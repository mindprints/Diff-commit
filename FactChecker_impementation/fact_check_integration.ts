// constants/models.ts - Add to your existing models array
export const MODELS = [
  // ... your existing models
  
  // Add these for fact-checking
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3',
    provider: 'DeepSeek',
    costTier: '$',
    inputCost: 0.14,  // per 1M tokens
    outputCost: 0.28,
    description: 'Fast claim extraction'
  },
  {
    id: 'perplexity/llama-3.1-sonar-large-128k-online',
    name: 'Perplexity Sonar Large',
    provider: 'Perplexity',
    costTier: '$$',
    inputCost: 1.00,
    outputCost: 1.00,
    description: 'Real-time fact verification'
  },
];

// types/factCheck.ts - Add to your types
export interface FactCheckLog {
  timestamp: string;
  task: 'fact-check-extraction' | 'fact-check-verification';
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  claimsProcessed?: number;
  rating?: number;
}

export interface FactCheckSession {
  verifications: VerificationResult[];
  report: string;
  correctedText: string;
  logs: FactCheckLog[];
  totalCost: number;
  totalTokens: number;
}

// services/factChecker.ts - Enhanced version with cost tracking
import type { FactClaim, VerificationResult, FactCheckLog, FactCheckSession } from '../types/factCheck';

export class FactChecker {
  private openRouterApiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  private logs: FactCheckLog[] = [];

  constructor(apiKey: string) {
    this.openRouterApiKey = apiKey;
  }

  /**
   * Main entry point - returns complete session with cost tracking
   */
  async checkFacts(
    text: string,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<FactCheckSession> {
    this.logs = []; // Reset logs for new session

    // Stage 1: Extract claims
    onProgress?.('Extracting factual claims...', 10);
    const claims = await this.extractClaims(text);

    if (claims.length === 0) {
      return {
        verifications: [],
        report: 'No factual claims found to verify.',
        correctedText: text,
        logs: this.logs,
        totalCost: this.calculateTotalCost(),
        totalTokens: this.calculateTotalTokens(),
      };
    }

    onProgress?.(`Found ${claims.length} claims. Verifying...`, 30);

    // Stage 2: Verify claims
    const verifications = await this.verifyClaims(claims, onProgress);

    onProgress?.('Generating corrections...', 90);

    // Stage 3: Generate corrected text
    const { correctedText, annotations } = this.generateCorrectedText(text, verifications);

    // Generate report
    const report = this.generateReport(verifications, annotations);

    onProgress?.('Complete!', 100);

    return {
      verifications,
      report,
      correctedText,
      logs: this.logs,
      totalCost: this.calculateTotalCost(),
      totalTokens: this.calculateTotalTokens(),
    };
  }

  private async extractClaims(text: string): Promise<FactClaim[]> {
    const model = 'deepseek/deepseek-chat';
    const prompt = `Extract all factual claims from the following text that can be verified. Focus on:
- Specific dates and timeframes
- Names of people, organizations, places
- Statistics and numbers
- Historical events
- Quotes attributed to people
- Scientific or technical facts

For each claim, provide:
1. The exact claim text
2. Category (date/statistic/name/place/event/quote/other)
3. Character position in original text (estimate start/end index)

Text to analyze:
"""
${text}
"""

Respond with ONLY a JSON array:
[{"claim": "text", "category": "type", "startIndex": 0, "endIndex": 10}]`;

    const requestBody = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    };

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://diff-commit-ai.app',
          'X-Title': 'Diff & Commit AI - Fact Checker',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      const usage = data.usage;

      // Log this request
      this.logs.push({
        timestamp: new Date().toISOString(),
        task: 'fact-check-extraction',
        model,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        cost: this.calculateCost(model, usage.prompt_tokens, usage.completion_tokens),
      });

      // Parse JSON response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.warn('No JSON array found in extraction response');
        return [];
      }

      const claims = JSON.parse(jsonMatch[0]);

      // Enrich claims with context from original text
      return claims.map((claim: any, index: number) => {
        const start = Math.max(0, claim.startIndex - 50);
        const end = Math.min(text.length, claim.endIndex + 50);
        const context = text.slice(start, end);

        return {
          id: `claim-${index}`,
          claim: claim.claim,
          category: claim.category,
          context,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
        };
      });
    } catch (error) {
      console.error('Error extracting claims:', error);
      throw new Error('Failed to extract factual claims');
    }
  }

  private async verifyClaims(
    claims: FactClaim[],
    onProgress?: (stage: string, progress: number) => void
  ): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];
    const model = 'perplexity/llama-3.1-sonar-large-128k-online';

    // Process claims one at a time to avoid rate limits
    for (let i = 0; i < claims.length; i++) {
      const claim = claims[i];
      const progress = 30 + (i / claims.length) * 60; // 30-90% range
      
      onProgress?.(
        `Verifying claim ${i + 1}/${claims.length}: "${claim.claim.slice(0, 50)}..."`,
        progress
      );

      const verification = await this.verifySingleClaim(claim, model);
      results.push(verification);

      // Small delay to avoid rate limits
      if (i < claims.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return results;
  }

  private async verifySingleClaim(claim: FactClaim, model: string): Promise<VerificationResult> {
    const prompt = `Verify this factual claim using current web sources:

Claim: "${claim.claim}"
Context: "${claim.context}"
Category: ${claim.category}

Determine:
1. Is this VERIFIED (correct and current)?
2. Is this INCORRECT (factually wrong)?
3. Is this OUTDATED (was correct but information changed)?
4. Is this UNVERIFIABLE (cannot find reliable sources)?

If incorrect or outdated, provide corrected information.

Respond ONLY with JSON:
{
  "status": "verified|incorrect|outdated|unverifiable",
  "correction": "corrected text or null",
  "sources": ["url1", "url2"],
  "confidence": "high|medium|low",
  "explanation": "brief explanation"
}`;

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://diff-commit-ai.app',
          'X-Title': 'Diff & Commit AI - Fact Checker',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        }),
      });

      const data = await response.json();
      const content = data.choices[0].message.content;
      const usage = data.usage;

      // Log this verification
      this.logs.push({
        timestamp: new Date().toISOString(),
        task: 'fact-check-verification',
        model,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        cost: this.calculateCost(model, usage.prompt_tokens, usage.completion_tokens),
        claimsProcessed: 1,
      });

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object in verification response');
      }

      const verification = JSON.parse(jsonMatch[0]);

      return {
        claim,
        status: verification.status,
        correction: verification.correction,
        sources: verification.sources || [],
        confidence: verification.confidence,
      };
    } catch (error) {
      console.error(`Error verifying claim "${claim.claim}":`, error);
      return {
        claim,
        status: 'unverifiable',
        sources: [],
        confidence: 'low',
      };
    }
  }

  private generateCorrectedText(
    originalText: string,
    verifications: VerificationResult[]
  ): { correctedText: string; annotations: string[] } {
    let correctedText = originalText;
    const annotations: string[] = [];

    const issues = verifications.filter(v => v.status !== 'verified');
    
    // Sort by startIndex in reverse to replace from end to start
    const sorted = [...issues].sort((a, b) => b.claim.startIndex - a.claim.startIndex);

    for (const verification of sorted) {
      const { claim, status, correction, sources } = verification;

      if (correction) {
        correctedText =
          correctedText.slice(0, claim.startIndex) +
          correction +
          correctedText.slice(claim.endIndex);
      }

      const statusEmoji = {
        incorrect: '❌',
        outdated: '⚠️',
        unverifiable: '❓'
      }[status] || '❓';

      annotations.push(
        `${statusEmoji} ${claim.claim}\n` +
        `   Status: ${status}\n` +
        (correction ? `   Correction: ${correction}\n` : '') +
        (sources.length ? `   Sources: ${sources.slice(0, 2).join(', ')}\n` : '')
      );
    }

    return { correctedText, annotations };
  }

  private generateReport(verifications: VerificationResult[], annotations: string[]): string {
    const verified = verifications.filter(v => v.status === 'verified').length;
    const incorrect = verifications.filter(v => v.status === 'incorrect').length;
    const outdated = verifications.filter(v => v.status === 'outdated').length;
    const unverifiable = verifications.filter(v => v.status === 'unverifiable').length;

    return `Fact Check Report
=================

Total claims analyzed: ${verifications.length}
✓ Verified: ${verified}
❌ Incorrect: ${incorrect}
⚠️ Outdated: ${outdated}
❓ Unverifiable: ${unverifiable}

${annotations.length > 0 ? '\nIssues Found:\n' + annotations.join('\n') : '\nAll facts verified!'}`;
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    // Cost per 1M tokens
    const costs: Record<string, { input: number; output: number }> = {
      'deepseek/deepseek-chat': { input: 0.14, output: 0.28 },
      'perplexity/llama-3.1-sonar-large-128k-online': { input: 1.00, output: 1.00 },
    };

    const modelCosts = costs[model] || { input: 1, output: 1 };
    return (inputTokens / 1_000_000) * modelCosts.input + 
           (outputTokens / 1_000_000) * modelCosts.output;
  }

  private calculateTotalCost(): number {
    return this.logs.reduce((sum, log) => sum + log.cost, 0);
  }

  private calculateTotalTokens(): number {
    return this.logs.reduce((sum, log) => sum + log.inputTokens + log.outputTokens, 0);
  }
}

// Integration with your existing AI handler
// Add this to your main component or AI service file

export async function handleAIPolish(
  text: string,
  mode: string,
  apiKey: string,
  selectedModel: string,
  onProgress?: (stage: string, progress: number) => void
): Promise<{
  result: string;
  logs: any[];
  totalCost: number;
  totalTokens: number;
  factCheckData?: FactCheckSession;
}> {
  // Special handling for fact-check mode
  if (mode === 'fact-check') {
    const checker = new FactChecker(apiKey);
    const session = await checker.checkFacts(text, onProgress);

    return {
      result: session.correctedText,
      logs: session.logs,
      totalCost: session.totalCost,
      totalTokens: session.totalTokens,
      factCheckData: session, // Pass this to your UI
    };
  }

  // Your existing polish modes (spelling, grammar, etc.)
  // ... existing code for other modes
  
  return {
    result: text,
    logs: [],
    totalCost: 0,
    totalTokens: 0,
  };
}

// Storage integration - save to your existing logs
export function saveFactCheckToLogs(
  session: FactCheckSession,
  userRating?: number
): void {
  // Use your existing electron-store or local storage
  const existingLogs = window.electron?.store.get('aiLogs') || [];
  
  // Add each log entry with user rating if provided
  const enrichedLogs = session.logs.map(log => ({
    ...log,
    rating: userRating,
    sessionId: Date.now(), // Group logs from same fact-check
  }));

  window.electron?.store.set('aiLogs', [...existingLogs, ...enrichedLogs]);
}

// React Hook for easy integration
export function useFactCheck(apiKey: string) {
  const [isChecking, setIsChecking] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [progressText, setProgressText] = React.useState('');
  const [session, setSession] = React.useState<FactCheckSession | null>(null);

  const checkFacts = async (text: string) => {
    setIsChecking(true);
    setSession(null);

    try {
      const checker = new FactChecker(apiKey);
      const result = await checker.checkFacts(text, (stage, prog) => {
        setProgressText(stage);
        setProgress(prog);
      });

      setSession(result);
      return result;
    } catch (error) {
      console.error('Fact check failed:', error);
      throw error;
    } finally {
      setIsChecking(false);
      setProgress(0);
      setProgressText('');
    }
  };

  const saveWithRating = (rating: number) => {
    if (session) {
      saveFactCheckToLogs(session, rating);
    }
  };

  return {
    checkFacts,
    saveWithRating,
    isChecking,
    progress,
    progressText,
    session,
  };
}