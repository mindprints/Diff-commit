// types/factCheck.ts
export interface FactClaim {
  id: string;
  claim: string;
  category: 'date' | 'statistic' | 'name' | 'place' | 'event' | 'quote' | 'other';
  context: string; // surrounding text for context
  startIndex: number;
  endIndex: number;
}

export interface VerificationResult {
  claim: FactClaim;
  status: 'verified' | 'incorrect' | 'outdated' | 'unverifiable';
  correction?: string;
  sources: string[];
  confidence: 'high' | 'medium' | 'low';
}

// constants/models.ts - Add these to your existing models
export const FACT_CHECK_MODELS = {
  extractor: 'deepseek/deepseek-v3.2', // Cheap model for extraction
  verifier: 'perplexity/llama-3.1-sonar-large-128k-online' // Search-enabled for verification
};

// services/factChecker.ts
import { diffWords } from 'diff';
import type { FactClaim, VerificationResult } from '../types/factCheck';

export class FactChecker {
  private openRouterApiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

  constructor(apiKey: string) {
    this.openRouterApiKey = apiKey;
  }

  /**
   * Stage 1: Extract factual claims from text using a cheap model
   */
  async extractClaims(text: string): Promise<FactClaim[]> {
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
3. Surrounding context (5-10 words before and after)

Text to analyze:
"""
${text}
"""

Respond with ONLY a JSON array, no other text:
[
  {
    "claim": "exact claim text",
    "category": "date",
    "context": "surrounding context",
    "startIndex": 0,
    "endIndex": 10
  }
]`;

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openRouterApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: FACT_CHECK_MODELS.extractor,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1, // Low temperature for consistent extraction
        }),
      });

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      // Parse JSON response, handling potential markdown code blocks
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array found in response');
      
      const claims = JSON.parse(jsonMatch[0]);
      
      // Add IDs to claims
      return claims.map((claim: any, index: number) => ({
        ...claim,
        id: `claim-${index}`,
      }));
    } catch (error) {
      console.error('Error extracting claims:', error);
      throw new Error('Failed to extract factual claims');
    }
  }

  /**
   * Stage 2: Verify claims using Perplexity's search
   */
  async verifyClaims(claims: FactClaim[]): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];

    // Process claims in batches of 3 to avoid overwhelming the API
    for (let i = 0; i < claims.length; i += 3) {
      const batch = claims.slice(i, i + 3);
      const batchResults = await Promise.all(
        batch.map(claim => this.verifySingleClaim(claim))
      );
      results.push(...batchResults);
    }

    return results;
  }

  private async verifySingleClaim(claim: FactClaim): Promise<VerificationResult> {
    const prompt = `Verify this factual claim using current web sources:

Claim: "${claim.claim}"
Context: "${claim.context}"
Category: ${claim.category}

Determine if this claim is:
1. VERIFIED - Correct and current
2. INCORRECT - Factually wrong
3. OUTDATED - Was correct but information has changed
4. UNVERIFIABLE - Cannot find reliable sources

If incorrect or outdated, provide the correct information.

Respond with ONLY a JSON object:
{
  "status": "verified|incorrect|outdated|unverifiable",
  "correction": "corrected text if needed, null otherwise",
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
        },
        body: JSON.stringify({
          model: FACT_CHECK_MODELS.verifier,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        }),
      });

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON object found in response');
      
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

  /**
   * Generate a corrected version of the text with inline annotations
   */
  generateCorrectedText(
    originalText: string,
    verifications: VerificationResult[]
  ): { correctedText: string; annotations: string[] } {
    let correctedText = originalText;
    const annotations: string[] = [];

    // Sort by startIndex in reverse to replace from end to start
    const sortedVerifications = [...verifications]
      .filter(v => v.status !== 'verified')
      .sort((a, b) => b.claim.startIndex - a.claim.startIndex);

    for (const verification of sortedVerifications) {
      const { claim, status, correction, sources } = verification;
      
      if (correction) {
        // Replace the incorrect text with correction
        correctedText = 
          correctedText.slice(0, claim.startIndex) +
          correction +
          correctedText.slice(claim.endIndex);
      }

      // Create annotation
      const statusEmoji = {
        incorrect: '❌',
        outdated: '⚠️',
        unverifiable: '❓'
      }[status] || '❓';

      annotations.push(
        `${statusEmoji} ${claim.claim}\n` +
        `   Status: ${status}\n` +
        (correction ? `   Correction: ${correction}\n` : '') +
        (sources.length ? `   Sources: ${sources.join(', ')}\n` : '')
      );
    }

    return { correctedText, annotations };
  }
}

// Integration with your existing component
// In your DiffViewer component, add this to the polish modes:

export const POLISH_MODES = {
  // ... existing modes
  'fact-check': {
    label: 'Fact Check',
    icon: '🔍',
    description: 'Verify factual claims with web sources',
    model: null, // Will use multiple models
  }
};

// Example usage in your AI Polish handler
export async function handleFactCheck(
  text: string,
  apiKey: string,
  onProgress?: (stage: string, progress: number) => void
): Promise<{ correctedText: string; report: string; tokenUsage: any }> {
  const checker = new FactChecker(apiKey);
  
  // Stage 1: Extract claims
  onProgress?.('Extracting factual claims...', 25);
  const claims = await checker.extractClaims(text);
  
  if (claims.length === 0) {
    return {
      correctedText: text,
      report: 'No factual claims found to verify.',
      tokenUsage: { extraction: 0, verification: 0 }
    };
  }
  
  // Stage 2: Verify claims
  onProgress?.('Verifying claims with web sources...', 50);
  const verifications = await checker.verifyClaims(claims);
  
  // Stage 3: Generate corrected text
  onProgress?.('Generating corrections...', 90);
  const { correctedText, annotations } = checker.generateCorrectedText(
    text,
    verifications
  );
  
  // Generate report
  const verified = verifications.filter(v => v.status === 'verified').length;
  const incorrect = verifications.filter(v => v.status === 'incorrect').length;
  const outdated = verifications.filter(v => v.status === 'outdated').length;
  const unverifiable = verifications.filter(v => v.status === 'unverifiable').length;
  
  const report = `
Fact Check Report
=================

Total claims analyzed: ${claims.length}
✓ Verified: ${verified}
❌ Incorrect: ${incorrect}
⚠️ Outdated: ${outdated}
❓ Unverifiable: ${unverifiable}

${annotations.length > 0 ? '\nIssues Found:\n' + annotations.join('\n') : '\nAll facts verified!'}
  `.trim();
  
  onProgress?.('Complete', 100);
  
  return {
    correctedText,
    report,
    tokenUsage: {
      extraction: claims.length * 100, // Rough estimate
      verification: verifications.length * 500
    }
  };
}
