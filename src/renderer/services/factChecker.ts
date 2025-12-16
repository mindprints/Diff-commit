
import { FactClaim, VerificationResult, FactCheckSession, ConfidenceLevel, VerificationStatus, FactClaimCategory } from '../types';
import { Model, MODELS } from '../constants/models';

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '';
const SITE_URL = 'http://localhost:5173';
const SITE_NAME = 'Diff & Commit AI';

// Models for fact-checking
const EXTRACTION_MODEL = MODELS[0]; // DeepSeek v3.2 - cheap and fast
const VERIFICATION_MODEL = MODELS.find(m => m.id === 'perplexity/sonar-pro') || MODELS[0];

interface FactCheckResponse {
    session: FactCheckSession;
    usage: {
        inputTokens: number;
        outputTokens: number;
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

/**
 * Extract factual claims from text using a cheap model
 */
async function extractClaims(
    text: string,
    signal?: AbortSignal
): Promise<ClaimExtractionResult> {
    const prompt = `Extract ALL verifiable claims from the following text, including both explicit facts AND implicit assertions. Look for:

EXPLICIT FACTS:
- Specific dates and timeframes
- Names of people, organizations, places
- Statistics and numbers
- Historical events
- Quotes attributed to people
- Scientific or technical facts

IMPLICIT ASSERTIONS (very important - these are often where misinformation hides):
- Causal claims: "X causes Y", "X leads to Y", "X results in Y"
- Frequency claims: "always", "never", "all the time", "everyone knows"
- Effectiveness claims: "doesn't work", "is safe", "is dangerous", "proven to"
- Comparative claims: "better than", "worse than", "more effective"
- Conspiracy theories: unverified narratives about hidden agendas
- Medical/health claims: claims about treatments, side effects, cures
- Risk/benefit claims: assertions about outcomes or consequences

EXAMPLES of what to extract:
- "vaccines cause autism" → Extract as causal/medical claim
- "happens all the time" → Extract as frequency claim  
- "this treatment doesn't work" → Extract as effectiveness claim
- "X was born in Paris" → Extract as name/place claim
- "the war started in 1914" → Extract as date/event claim

For each claim, provide:
1. The exact claim text (the specific assertion, may be a phrase or sentence)
2. Category: causal, frequency, effectiveness, conspiracy, medical, date, statistic, name, place, event, quote, or other
3. Brief surrounding context (a few words for context)

Text to analyze:
"""
${text.substring(0, 5000)}
"""

Respond with ONLY a valid JSON array. Extract ALL verifiable assertions, including controversial ones:
[{"claim": "example claim", "category": "causal", "context": "surrounding words"}]

If no verifiable claims are found, respond with: []`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": SITE_URL,
            "X-Title": SITE_NAME,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: EXTRACTION_MODEL.id,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1
        }),
        signal
    });

    if (!response.ok) {
        throw new Error(`Extraction API error: ${response.status}`);
    }

    const data = await response.json();
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
            const parsed = JSON.parse(jsonMatch[0]);
            claims = parsed.map((c: any, i: number) => ({
                id: `claim-${i}`,
                claim: c.claim || '',
                category: (c.category || 'other') as FactClaimCategory,
                context: c.context || ''
            }));
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

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": SITE_URL,
            "X-Title": SITE_NAME,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: VERIFICATION_MODEL.id,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2
        }),
        signal
    });

    if (!response.ok) {
        throw new Error(`Verification API error: ${response.status}`);
    }

    const data = await response.json();
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
    signal?: AbortSignal
): Promise<FactCheckResponse> {
    if (!OPENROUTER_API_KEY) {
        return {
            session: { claims: [], verifications: [], report: 'API Key missing.' },
            usage: { inputTokens: 0, outputTokens: 0 },
            isError: true,
            errorMessage: 'API Key missing. Check .env configuration.'
        };
    }

    let totalUsage = { inputTokens: 0, outputTokens: 0 };

    try {
        // Stage 1: Extract claims
        onProgress?.('Extracting factual claims...', 10);

        const { claims, usage: extractionUsage } = await extractClaims(text, signal);
        totalUsage.inputTokens += extractionUsage.inputTokens;
        totalUsage.outputTokens += extractionUsage.outputTokens;

        if (claims.length === 0) {
            return {
                session: {
                    claims: [],
                    verifications: [],
                    report: '📊 Fact Check Report\n══════════════════\n\nNo factual claims found to verify in the text.'
                },
                usage: totalUsage,
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
                const { result, usage: verifyUsage } = await verifySingleClaim(claim, signal);
                totalUsage.inputTokens += verifyUsage.inputTokens;
                totalUsage.outputTokens += verifyUsage.outputTokens;
                verifications.push(result);
            } catch (error: any) {
                if (error.name === 'AbortError') {
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
            isError: false
        };

    } catch (error: any) {
        if (error.name === 'AbortError') {
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
            errorMessage: error.message || 'Fact check failed.'
        };
    }
}

/**
 * Get the models used for fact-checking (for cost display)
 */
export function getFactCheckModels() {
    return {
        extraction: EXTRACTION_MODEL,
        verification: VERIFICATION_MODEL
    };
}
