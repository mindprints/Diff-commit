
import { FactClaim, VerificationResult, FactCheckSession, ConfidenceLevel, VerificationStatus, FactClaimCategory } from '../types';
import { MODELS } from '../constants/models';
import type { Model } from '../constants/models';
import { requestOpenRouterChatCompletions } from './openRouterBridge';
import { applySearchModeToPayload, getFactCheckSearchMode, OpenRouterChatPayloadWithPlugins, SearchCapabilityHints } from './openRouterSearch';

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '';
const SITE_URL = 'http://localhost:5173';
const SITE_NAME = 'Diff & Commit AI';

// Models for fact-checking
const DEFAULT_EXTRACTION_MODEL = MODELS[0]; // DeepSeek v3.2 - cheap and fast
const DEFAULT_VERIFICATION_MODEL = MODELS.find(m => m.id === 'perplexity/sonar-pro') || MODELS[0];
const FACTCHECK_EXTRACTION_MODEL_KEY = 'diff-commit-factcheck-extraction-model';
const FACTCHECK_VERIFICATION_MODEL_KEY = 'diff-commit-factcheck-verification-model';

interface FactCheckResponse {
    session: FactCheckSession;
    usage: {
        inputTokens: number;
        outputTokens: number;
    };
    stageUsage?: {
        extraction: { inputTokens: number; outputTokens: number };
        verification: { inputTokens: number; outputTokens: number };
    };
    models?: {
        extraction: Model;
        verification: Model;
    };
    isError?: boolean;
    isCancelled?: boolean;
    errorMessage?: string;
}

interface ClaimExtractionResult {
    claims: FactClaim[];
    usage: { inputTokens: number; outputTokens: number };
}

interface VerificationApiResult {
    result: VerificationResult;
    usage: { inputTokens: number; outputTokens: number };
}

interface OpenRouterChatCompletionResponse {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
    };
}

interface RawFactClaim {
    claim?: string;
    statement?: string;
    category?: string;
    context?: string;
    verifiable?: boolean;
}

interface FactCheckModelOptions {
    extractionModel?: Model;
    verificationModel?: Model;
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

function normalizeCategory(category: string | undefined): FactClaimCategory {
    const normalized = (category || 'other').toLowerCase();
    const allowedCategories: Set<FactClaimCategory> = new Set([
        'causal',
        'frequency',
        'effectiveness',
        'conspiracy',
        'medical',
        'date',
        'statistic',
        'name',
        'place',
        'event',
        'quote',
        'other'
    ]);
    return allowedCategories.has(normalized as FactClaimCategory)
        ? normalized as FactClaimCategory
        : 'other';
}

function normalizeClaimText(text: string | undefined): string {
    if (!text) return '';
    return text
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function canonicalKey(text: string): string {
    return text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function isLikelySubjectiveOrPersonal(claimText: string): boolean {
    const lowered = claimText.toLowerCase();
    if (/\b(i|we|me|us|my|our|mine|ours)\b/i.test(lowered)) {
        return true;
    }

    const subjectivePhrases = [
        'great time',
        'delicious',
        'tasty',
        'fun',
        'enjoyed',
        'loved',
        'hated',
        'felt',
        'i think',
        'i believe',
        'in my opinion'
    ];
    return subjectivePhrases.some((phrase) => lowered.includes(phrase));
}

function filterAndNormalizeClaims(rawClaims: RawFactClaim[]): FactClaim[] {
    const dedupe = new Set<string>();
    const normalized: FactClaim[] = [];

    for (const raw of rawClaims) {
        if (raw.verifiable === false) {
            continue;
        }

        const claimText = normalizeClaimText(raw.statement || raw.claim);
        if (!claimText || claimText.length < 6) {
            continue;
        }

        if (isLikelySubjectiveOrPersonal(claimText)) {
            continue;
        }

        const key = canonicalKey(claimText);
        if (!key || dedupe.has(key)) {
            continue;
        }
        dedupe.add(key);

        normalized.push({
            id: `claim-${normalized.length}`,
            claim: claimText,
            category: normalizeCategory(raw.category),
            context: normalizeClaimText(raw.context) || claimText.slice(0, 120)
        });
    }

    return normalized;
}

function getConfiguredModelId(key: string, fallbackId: string): string {
    try {
        const stored = localStorage.getItem(key)?.trim();
        if (stored) return stored;
    } catch (error) {
        console.warn('[FactCheck] Failed to read model preference:', error);
    }
    return fallbackId;
}

function setConfiguredModelId(key: string, modelId: string): void {
    try {
        localStorage.setItem(key, modelId);
    } catch (error) {
        console.warn('[FactCheck] Failed to store model preference:', error);
    }
}

export function getFactCheckExtractionModelId(): string {
    return getConfiguredModelId(FACTCHECK_EXTRACTION_MODEL_KEY, DEFAULT_EXTRACTION_MODEL.id);
}

export function setFactCheckExtractionModelId(modelId: string): void {
    setConfiguredModelId(FACTCHECK_EXTRACTION_MODEL_KEY, modelId);
}

export function getFactCheckVerificationModelId(): string {
    return getConfiguredModelId(FACTCHECK_VERIFICATION_MODEL_KEY, DEFAULT_VERIFICATION_MODEL.id);
}

export function setFactCheckVerificationModelId(modelId: string): void {
    setConfiguredModelId(FACTCHECK_VERIFICATION_MODEL_KEY, modelId);
}

function resolveModelById(modelId: string | undefined, fallback: Model, availableModels: Model[]): Model {
    if (!modelId) return fallback;
    const fromAvailable = availableModels.find((m) => m.id === modelId);
    if (fromAvailable) return fromAvailable;
    const fromBuiltIn = MODELS.find((m) => m.id === modelId);
    return fromBuiltIn || fallback;
}

export function resolveFactCheckModels(availableModels: Model[] = MODELS): { extraction: Model; verification: Model } {
    const extraction = resolveModelById(getFactCheckExtractionModelId(), DEFAULT_EXTRACTION_MODEL, availableModels);
    const verification = resolveModelById(getFactCheckVerificationModelId(), DEFAULT_VERIFICATION_MODEL, availableModels);
    return { extraction, verification };
}

async function requestChatCompletions(payload: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature: number;
    plugins?: Array<{ id: string; [key: string]: unknown }>;
}, signal?: AbortSignal, useSearch = false, searchHints?: SearchCapabilityHints): Promise<OpenRouterChatCompletionResponse> {
    const searchMode = useSearch ? getFactCheckSearchMode() : 'off';
    const effectivePayload = useSearch
        ? applySearchModeToPayload(payload as OpenRouterChatPayloadWithPlugins, searchMode, searchHints)
        : payload;

    if (window.electron?.openRouter?.chatCompletions) {
        return requestOpenRouterChatCompletions(effectivePayload, signal) as Promise<OpenRouterChatCompletionResponse>;
    }

    if (!OPENROUTER_API_KEY) {
        throw new Error('API Key missing. Check .env configuration.');
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": SITE_URL,
            "X-Title": SITE_NAME,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(effectivePayload),
        signal,
    });

    if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
    }

    return response.json();
}

/**
 * Extract factual claims from text using a cheap model
 */
async function extractClaims(
    text: string,
    extractionModel: Model,
    signal?: AbortSignal
): Promise<ClaimExtractionResult> {
    const prompt = `Extract verifiable factual claims from this text.

Rules:
- Return ONLY objective claims that can be checked against public sources.
- Exclude opinions, preferences, personal feelings, private experiences, and non-verifiable statements.
- Rewrite each result into a short standalone statement.
- If a sentence contains multiple factual assertions, split into separate statements.

Output format (JSON array only):
[
  {
    "statement": "The Louvre has moved to Berlin.",
    "category": "event",
    "context": "Couldn't visit the Louvre because it has moved to Berlin.",
    "verifiable": true
  }
]

Valid categories: causal, frequency, effectiveness, conspiracy, medical, date, statistic, name, place, event, quote, other.

Text to analyze:
"""
${text.substring(0, 5000)}
"""

If no verifiable claims exist, return: []`;

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const data = await requestChatCompletions({
        model: extractionModel.id,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
    }, signal, false);
    const content = data.choices?.[0]?.message?.content || '[]';
    const usage = data.usage ? {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens
    } : { inputTokens: 0, outputTokens: 0 };

    // Parse JSON, handling potential markdown code blocks
    let claims: FactClaim[] = [];
    try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as RawFactClaim[];
            claims = filterAndNormalizeClaims(parsed);
        }
    } catch (e) {
        console.warn('Failed to parse claims JSON:', e);
    }

    return { claims, usage };
}

/**
 * Verify a single claim using Perplexity's search-enabled model
 */
async function verifySingleClaim(
    claim: FactClaim,
    verificationModel: Model,
    signal?: AbortSignal
): Promise<VerificationApiResult> {
    const prompt = `Verify this claim using current, reliable web sources:

Claim: "${claim.claim}"
Context: "${claim.context}"
Category: ${claim.category}

VERIFICATION INSTRUCTIONS based on claim type:

For CAUSAL claims (X causes Y):
- Search for scientific consensus, meta-analyses, systematic reviews
- Note if claim lacks nuance (e.g., "X always causes Y" vs "X may increase risk of Y")
- Check if claim cherry-picks evidence or ignores contradictory studies

For FREQUENCY claims ("always", "never", "all the time"):
- Verify if absolute language is justified by evidence
- Look for counter-examples that disprove absolutes
- Check actual statistical frequency if available

For EFFECTIVENESS claims ("doesn't work", "is safe", "is dangerous"):
- Find consensus from health authorities (WHO, CDC, major medical journals)
- Check if claim oversimplifies complex issues
- Note evidence quality (randomized trials vs anecdotes)

For MEDICAL/HEALTH claims:
- Prioritize peer-reviewed sources and official health organization positions
- Note if claim contradicts scientific consensus
- Check for context that may change the meaning

For all claims, determine:
1. VERIFIED - Correct and well-supported by reliable sources
2. INCORRECT - Factually wrong, contradicted by evidence
3. OUTDATED - Was correct but information has changed
4. MISLEADING - Technically contains some truth but lacks critical context or nuance
5. UNVERIFIABLE - Cannot find reliable sources to confirm or deny

If incorrect, outdated, or misleading, provide corrected information with proper nuance.

Respond with ONLY a valid JSON object:
{
  "status": "verified",
  "correction": null,
  "sources": ["https://example.com"],
  "confidence": "high",
  "explanation": "Brief explanation of why this status was assigned"
}

Valid status values: verified, incorrect, outdated, misleading, unverifiable
Valid confidence values: high, medium, low`;

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const verificationWithHints = verificationModel as Model & {
        capabilities?: string[];
        supportedParams?: string[];
    };
    const data = await requestChatCompletions({
        model: verificationModel.id,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
    }, signal, true, {
        modelId: verificationModel.id,
        modelName: verificationModel.name,
        capabilities: verificationWithHints.capabilities,
        supportedParams: verificationWithHints.supportedParams,
    });
    const content = data.choices?.[0]?.message?.content || '{}';
    const usage = data.usage ? {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens
    } : { inputTokens: 0, outputTokens: 0 };

    // Parse JSON response
    let verification = {
        status: 'unverifiable' as VerificationStatus,
        correction: undefined as string | undefined,
        sources: [] as string[],
        confidence: 'low' as ConfidenceLevel,
        explanation: undefined as string | undefined
    };

    try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            verification = {
                status: parsed.status || 'unverifiable',
                correction: parsed.correction || undefined,
                sources: parsed.sources || [],
                confidence: parsed.confidence || 'low',
                explanation: parsed.explanation || undefined
            };
        }
    } catch (e) {
        console.warn('Failed to parse verification JSON:', e);
    }

    return {
        result: {
            claim,
            ...verification
        },
        usage
    };
}

/**
 * Get category label with emoji
 */
function getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
        'causal': '🔗 Causal',
        'frequency': '📊 Frequency',
        'effectiveness': '⚡ Effectiveness',
        'conspiracy': '🕵️ Conspiracy',
        'medical': '⚕️ Medical',
        'date': '📅 Date',
        'statistic': '📈 Statistic',
        'name': '👤 Name',
        'place': '📍 Place',
        'event': '🎯 Event',
        'quote': '💬 Quote',
        'other': '📝 Other'
    };
    return labels[category] || '📝 Other';
}

/**
 * Generate a formatted report from verification results
 */
function generateReport(verifications: VerificationResult[]): string {
    const verified = verifications.filter(v => v.status === 'verified').length;
    const incorrect = verifications.filter(v => v.status === 'incorrect').length;
    const outdated = verifications.filter(v => v.status === 'outdated').length;
    const misleading = verifications.filter(v => v.status === 'misleading').length;
    const unverifiable = verifications.filter(v => v.status === 'unverifiable').length;

    const lines: string[] = [
        `📊 Fact Check Report`,
        `══════════════════`,
        ``,
        `Total claims analyzed: ${verifications.length}`,
        `✓ Verified: ${verified}`,
        `❌ Incorrect: ${incorrect}`,
        `⚠️ Outdated: ${outdated}`,
        `🔶 Misleading: ${misleading}`,
        `❓ Unverifiable: ${unverifiable}`,
        ``
    ];

    const issues = verifications.filter(v => v.status !== 'verified');
    if (issues.length > 0) {
        lines.push(`Issues Found:`);
        lines.push(``);

        for (const v of issues) {
            const emoji = {
                'incorrect': '❌',
                'outdated': '⚠️',
                'misleading': '🔶',
                'unverifiable': '❓'
            }[v.status] || '❓';

            const categoryLabel = getCategoryLabel(v.claim.category);

            lines.push(`${emoji} "${v.claim.claim}"`);
            lines.push(`   Type: ${categoryLabel}`);
            lines.push(`   Status: ${v.status} (${v.confidence} confidence)`);
            if (v.correction) {
                lines.push(`   ➜ Correction: ${v.correction}`);
            }
            if (v.explanation) {
                lines.push(`   💡 ${v.explanation}`);
            }
            if (v.sources.length > 0) {
                // Format sources as clickable markdown links
                const formattedSources = v.sources.slice(0, 2).map((url, idx) => {
                    // Try to extract domain name for link text
                    try {
                        const domain = new URL(url).hostname.replace('www.', '');
                        return `[${domain}](${url})`;
                    } catch {
                        return `[Source ${idx + 1}](${url})`;
                    }
                }).join(', ');
                lines.push(`   📎 Sources: ${formattedSources}`);
            }
            lines.push(``);
        }
    } else if (verifications.length > 0) {
        lines.push(`✅ All facts verified!`);
    } else {
        lines.push(`No factual claims found to verify.`);
    }

    return lines.join('\n');
}

/**
 * Main entry point: Run complete fact-check on text
 */
export async function runFactCheck(
    text: string,
    onProgress?: (stage: string, percent: number) => void,
    signal?: AbortSignal,
    modelOptions?: FactCheckModelOptions
): Promise<FactCheckResponse> {
    if (!window.electron?.openRouter?.chatCompletions && !OPENROUTER_API_KEY) {
        return {
            session: { claims: [], verifications: [], report: 'API Key missing.' },
            usage: { inputTokens: 0, outputTokens: 0 },
            isError: true,
            errorMessage: 'API Key missing. Check .env configuration.'
        };
    }

    const totalUsage = { inputTokens: 0, outputTokens: 0 };
    const extractionUsage = { inputTokens: 0, outputTokens: 0 };
    const verificationUsage = { inputTokens: 0, outputTokens: 0 };
    const activeModels = {
        extraction: modelOptions?.extractionModel || resolveFactCheckModels().extraction,
        verification: modelOptions?.verificationModel || resolveFactCheckModels().verification
    };

    try {
        // Stage 1: Extract claims
        onProgress?.('Extracting factual claims...', 10);

        const { claims, usage: extractionStageUsage } = await extractClaims(text, activeModels.extraction, signal);
        extractionUsage.inputTokens += extractionStageUsage.inputTokens;
        extractionUsage.outputTokens += extractionStageUsage.outputTokens;
        totalUsage.inputTokens += extractionStageUsage.inputTokens;
        totalUsage.outputTokens += extractionStageUsage.outputTokens;

        if (claims.length === 0) {
            return {
                session: {
                    claims: [],
                    verifications: [],
                    report: '📊 Fact Check Report\n══════════════════\n\nNo factual claims found to verify in the text.'
                },
                usage: totalUsage,
                stageUsage: {
                    extraction: extractionUsage,
                    verification: verificationUsage
                },
                models: activeModels,
                isError: false
            };
        }

        onProgress?.(`Found ${claims.length} claims. Verifying...`, 25);

        // Stage 2: Verify each claim
        const verifications: VerificationResult[] = [];

        for (let i = 0; i < claims.length; i++) {
            // Check for cancellation
            if (signal?.aborted) {
                return {
                    session: { claims, verifications, report: 'Cancelled.' },
                    usage: totalUsage,
                    isCancelled: true
                };
            }

            const claim = claims[i];
            const progress = 25 + ((i + 1) / claims.length) * 65; // 25-90% range
            onProgress?.(`Verifying: "${claim.claim.substring(0, 40)}..."`, progress);

            try {
                const { result, usage: verifyUsage } = await verifySingleClaim(claim, activeModels.verification, signal);
                verificationUsage.inputTokens += verifyUsage.inputTokens;
                verificationUsage.outputTokens += verifyUsage.outputTokens;
                totalUsage.inputTokens += verifyUsage.inputTokens;
                totalUsage.outputTokens += verifyUsage.outputTokens;
                verifications.push(result);
            } catch (error: unknown) {
                if (isAbortError(error)) {
                    return {
                        session: { claims, verifications, report: 'Cancelled.' },
                        usage: totalUsage,
                        isCancelled: true
                    };
                }
                // On error, mark as unverifiable and continue
                verifications.push({
                    claim,
                    status: 'unverifiable',
                    sources: [],
                    confidence: 'low',
                    explanation: 'Verification failed due to an error.'
                });
            }

            // Small delay between requests to avoid rate limits
            if (i < claims.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        // Stage 3: Generate report
        onProgress?.('Generating report...', 95);
        const report = generateReport(verifications);

        onProgress?.('Complete!', 100);

        return {
            session: { claims, verifications, report },
            usage: totalUsage,
            stageUsage: {
                extraction: extractionUsage,
                verification: verificationUsage
            },
            models: activeModels,
            isError: false
        };

    } catch (error: unknown) {
        if (isAbortError(error)) {
            return {
                session: { claims: [], verifications: [], report: 'Cancelled.' },
                usage: totalUsage,
                isCancelled: true
            };
        }

        console.error('Fact check error:', error);
        return {
            session: { claims: [], verifications: [], report: 'An error occurred.' },
            usage: totalUsage,
            isError: true,
            errorMessage: error instanceof Error ? error.message : 'Fact check failed.'
        };
    }
}

/**
 * Get the models used for fact-checking (for cost display)
 */
export function getFactCheckModels() {
    return resolveFactCheckModels(MODELS);
}
