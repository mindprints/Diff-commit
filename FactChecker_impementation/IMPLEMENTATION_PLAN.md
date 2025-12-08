# Fact Checker Implementation Plan

## Overview

This document outlines a safe, incremental approach to adding a Fact Checker feature using Perplexity's online search-enabled models via OpenRouter. The implementation will integrate with our existing AI infrastructure without breaking current functionality.

---

## 📋 Analysis of Provided Code

### What's Good ✅

1. **Two-Stage Architecture**: Using a cheap model (DeepSeek) for extraction and Perplexity for verification is cost-efficient.
2. **Cost Tracking**: The code tracks token usage and costs per operation.
3. **Progress Callbacks**: `onProgress` callbacks enable good UX during long operations.
4. **Error Handling**: Graceful fallback to "unverifiable" on errors.
5. **Batch Processing**: Claims are processed sequentially with delays to avoid rate limits.

### Issues to Address ⚠️

| Issue | Problem | Solution |
|-------|---------|----------|
| **Class-based approach** | Our current `ai.ts` uses functional approach | Refactor to match existing patterns (functional exports) |
| **Hardcoded model IDs** | `deepseek/deepseek-chat` doesn't match our `models.ts` | Use our existing models or add new ones properly |
| **Separate API key handling** | The class takes `apiKey` as constructor arg | Use our existing `OPENROUTER_API_KEY` from env |
| **Different log structure** | `FactCheckLog` differs from `AILogEntry` | Extend `AILogEntry` to support fact-check tasks |
| **No AbortSignal support** | Missing cancellation support | Add AbortSignal like our other AI functions |
| **React Hook pattern** | `useFactCheck` hook doesn't match our component patterns | Integrate directly into App.tsx state |
| **Storage access** | `window.electron?.store.get()` - we use IPC methods | Use our existing `window.electron.logUsage()` |
| **Duplicate cost calculation** | Has its own cost calculator | Use our existing `getCostTier` and model pricing |

---

## 🏗️ Implementation Phases

### Phase 1: Foundation (Low Risk)
**Goal**: Add types and models without touching existing code.

1. **Update `types.ts`**
   - Add `FactClaim`, `VerificationResult`, `FactCheckSession` interfaces
   - Extend `AILogEntry.taskType` to include `'fact-check-extraction' | 'fact-check-verification'`

2. **Update `constants/models.ts`**
   - Add Perplexity Sonar model with correct pricing
   - Keep DeepSeek for extraction (we already have it)

### Phase 2: Service Layer (Medium Risk)
**Goal**: Create a new service file that follows our existing patterns.

1. **Create `services/factChecker.ts`**
   - Use our existing `callOpenRouter` function pattern (or a similar internal one)
   - Support AbortSignal for cancellation
   - Return usage data in same format as other AI functions
   - Export functional APIs: `extractClaims()`, `verifyClaims()`, `runFactCheck()`

2. **Integration Points**
   - Use same API key from environment
   - Use same headers (HTTP-Referer, X-Title)
   - Return compatible `AIResponse` type

### Phase 3: UI Integration (Medium Risk)
**Goal**: Add Fact Check to AI Edit menu without modifying existing buttons.

1. **Add to AI Edit Dropdown**
   - Add "Fact Check" option below "Prompt Expansion"
   - Use different icon (shield or checkmark)
   - Show in separate section (divider)

2. **Progress Indicator**
   - Show detailed progress text during fact-checking
   - Reuse existing `isPolishing` state or add `isFactChecking`

3. **Results Display**
   - Create `FactCheckResults.tsx` component (from provided code, adapted)
   - Show in a collapsible panel below the preview
   - Allow copying corrections

### Phase 4: Logging & Rating (Low Risk)
**Goal**: Integrate with existing cost tracking and rating system.

1. **Log Each API Call**
   - Use existing `logAIUsage()` with extended task types
   - Track extraction and verification separately

2. **Rating Prompt**
   - Reuse existing `RatingPrompt` component
   - Show after fact-check completes

3. **Logs Modal**
   - Extend to show fact-check sessions
   - Group by session ID

---

## 📁 File Changes Summary

| File | Change Type | Risk Level |
|------|-------------|------------|
| `types.ts` | Add interfaces | 🟢 Low |
| `constants/models.ts` | Add Perplexity model | 🟢 Low |
| `services/factChecker.ts` | **New file** | 🟢 Low (isolated) |
| `components/FactCheckResults.tsx` | **New file** | 🟢 Low (isolated) |
| `App.tsx` | Add state, menu option, results panel | 🟡 Medium |
| `components/LogsModal.tsx` | Extend for fact-check logs | 🟢 Low |

---

## 🔧 Technical Implementation Details

### New Types (types.ts)

```typescript
// Add to existing types.ts
export type FactClaimCategory = 'date' | 'statistic' | 'name' | 'place' | 'event' | 'quote' | 'other';
export type VerificationStatus = 'verified' | 'incorrect' | 'outdated' | 'unverifiable';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface FactClaim {
  id: string;
  claim: string;
  category: FactClaimCategory;
  context: string;
  startIndex: number;
  endIndex: number;
}

export interface VerificationResult {
  claim: FactClaim;
  status: VerificationStatus;
  correction?: string;
  sources: string[];
  confidence: ConfidenceLevel;
  explanation?: string;
}

export interface FactCheckSession {
  claims: FactClaim[];
  verifications: VerificationResult[];
  report: string;
  correctedText: string;
}

// Extend AILogEntry taskType
export interface AILogEntry {
  // ... existing fields
  taskType: 'summary' | 'polish' | 'fact-check-extraction' | 'fact-check-verification';
  sessionId?: string; // Group fact-check logs
}
```

### New Model (constants/models.ts)

```typescript
{
  id: 'perplexity/llama-3.1-sonar-large-128k-online',
  name: 'Perplexity Sonar',
  provider: 'Perplexity',
  contextWindow: 127072,
  inputPrice: 1.00,
  outputPrice: 1.00
}
```

### Service Structure (services/factChecker.ts)

```typescript
// Follows our existing ai.ts patterns
export async function extractClaims(
  text: string, 
  signal?: AbortSignal
): Promise<{ claims: FactClaim[]; usage: TokenUsage }>;

export async function verifyClaim(
  claim: FactClaim, 
  signal?: AbortSignal
): Promise<{ result: VerificationResult; usage: TokenUsage }>;

export async function runFactCheck(
  text: string,
  onProgress?: (stage: string, percent: number) => void,
  signal?: AbortSignal
): Promise<{
  session: FactCheckSession;
  usage: { inputTokens: number; outputTokens: number };
  isError?: boolean;
  isCancelled?: boolean;
}>;
```

### App.tsx Integration

```tsx
// New state
const [isFactChecking, setIsFactChecking] = useState(false);
const [factCheckProgress, setFactCheckProgress] = useState('');
const [factCheckSession, setFactCheckSession] = useState<FactCheckSession | null>(null);

// New handler
const handleFactCheck = async () => {
  cancelAIOperation();
  abortControllerRef.current = new AbortController();
  
  setIsFactChecking(true);
  setIsPolishMenuOpen(false);
  
  const { session, usage, isError, isCancelled } = await runFactCheck(
    previewText,
    (stage, percent) => setFactCheckProgress(stage),
    abortControllerRef.current.signal
  );
  
  if (isCancelled) return;
  
  if (!isError) {
    setFactCheckSession(session);
    // Optionally update the diff view with corrected text
    updateCost(usage);
    // Log each part separately
  }
  
  setIsFactChecking(false);
};

// Add to AI Edit menu
<button onClick={handleFactCheck}>
  <Shield className="w-4 h-4" />
  Fact Check
</button>
```

---

## ⚠️ Risk Mitigation

1. **Feature Flag**: Add `const FACT_CHECK_ENABLED = true` to easily disable if issues arise
2. **Separate Service**: New code is isolated in new files, won't break existing functions
3. **Incremental Testing**: Test each phase before moving to next
4. **Rollback Plan**: Each phase can be reverted independently

---

## 📊 Estimated Costs

| Operation | Model | Est. Tokens | Est. Cost |
|-----------|-------|-------------|-----------|
| Claim Extraction | DeepSeek v3.2 | ~2000 | ~$0.0005 |
| Per Claim Verification | Perplexity Sonar | ~500 | ~$0.0005 |
| **5 Claims Total** | Mixed | ~4500 | ~$0.003 |

---

## 🚀 Recommended Order of Implementation

1. ✅ **Phase 1**: Add types and Perplexity model (5 min)
2. ✅ **Phase 2**: Create `services/factChecker.ts` (30 min)
3. ✅ **Phase 3**: Add UI - menu option + basic integration (20 min)
4. ✅ **Phase 3b**: Create `FactCheckResults.tsx` component (15 min)
5. ✅ **Phase 4**: Wire up logging and rating (10 min)
6. ✅ **Testing**: End-to-end test with real text (10 min)

**Total Estimated Time**: ~1.5 hours

---

## 🎯 Success Criteria

- [ ] Fact Check appears in AI Edit menu
- [ ] Progress indicator shows during operation
- [ ] Cancel button works
- [ ] Results display with color-coded status
- [ ] Sources are clickable links
- [ ] Corrections can be copied
- [ ] Cost is tracked and displayed
- [ ] Rating prompt appears after completion
- [ ] Logs show in Logs Modal
- [ ] No existing functionality is broken

---

## Questions Before Proceeding

1. Do you want the fact checker to **automatically apply corrections** to the preview text, or just **show suggestions**?
2. Should the results panel be **persistent** (stays until closed) or **temporary** (clears on next action)?
3. Do you want a **dedicated button** for Fact Check, or is **adding to AI Edit menu** sufficient?

Ready to implement when you give the go-ahead!
