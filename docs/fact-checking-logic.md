# Fact-Checking Logic (Current State)

Last updated: 2026-02-14 (post refactor)

## Scope
This document describes the fact-checking flow currently implemented in the app, including model usage, search mode behavior, error handling, and logging.

Primary implementation files:
- `src/renderer/services/factChecker.ts`
- `src/renderer/services/openRouterSearch.ts`
- `src/renderer/contexts/AIContext.tsx`
- `src/renderer/components/AIPromptPanel.tsx`
- `src/renderer/components/AIResultsViewer.tsx`
- `src/renderer/components/SettingsModal.tsx`

## High-Level Flow
Fact-checking runs in 3 stages:
1. Claim extraction
2. Claim-by-claim verification
3. Report generation

Entry point:
- `runFactCheck(...)` in `src/renderer/services/factChecker.ts`
- Triggered by `handleFactCheck` in `src/renderer/contexts/AIContext.tsx`
- Typical prompt-panel trigger: slash command `/factcheck` in `src/renderer/components/AIPromptPanel.tsx`

## Model Selection (As Implemented)
Fact-check model selection is now configurable and persisted:
- Extraction model key: `diff-commit-factcheck-extraction-model`
- Verification model key: `diff-commit-factcheck-verification-model`

Defaults:
- Extraction: `MODELS[0]` (currently DeepSeek v3.2)
- Verification: `perplexity/sonar-pro` fallback to `MODELS[0]`

Selection surface:
- `SettingsModal` includes dedicated dropdowns for extraction and verification models.
- `AIContext` resolves configured model IDs against available/imported models at runtime.

## Request Path
`requestChatCompletions(...)` in `factChecker.ts` uses:
- Electron path: `requestOpenRouterChatCompletions(...)` via `openRouterBridge.ts` if `window.electron.openRouter.chatCompletions` is available.
- Browser fallback: direct `fetch("https://openrouter.ai/api/v1/chat/completions")` with `VITE_OPENROUTER_API_KEY`.

If neither Electron bridge nor API key is available:
- Fact-check returns an error response with `API Key missing. Check .env configuration.`

## Search Mode Behavior
Search mode configuration is stored in localStorage key:
- `diff-commit-factcheck-search-mode`

Modes are defined in `openRouterSearch.ts`:
- `off`: no payload changes
- `auto`: keep payload if model is "native search"; otherwise append `:online`
- `online_suffix`: always append `:online`
- `web_plugin`: inject `plugins: [{ id: "web", max_results: 5 }]` unless already present

Native search model heuristic:
- `perplexity/sonar*`
- `google/gemini*` with `grounding` in model id

Where mode is applied:
- Only during verification calls (`useSearch=true`)
- Extraction calls do not apply search mode

Settings UI:
- User can set mode in `SettingsModal` under "Fact-check Web Search"
- Label explicitly states: applies to fact-check verification requests only

## Stage Details
### 1. Claim Extraction
Function: `extractClaims(...)`
- Sends a structured extraction prompt
- Truncates analyzed input to first 5000 chars
- Expects JSON array in response (`statement`, `category`, `context`, `verifiable`)
- Parses array using regex extraction + JSON.parse
- Applies normalization/filtering pass before verification:
  - Drops `verifiable: false`
  - Drops subjective/personal statements (heuristic guard)
  - Normalizes claim text into standalone statements
  - Deduplicates near-identical claims
- On parse failure, logs warning and returns empty claims list

### 2. Verification
Function: `verifySingleClaim(...)`
- Sends one request per claim
- Uses configured verification model (not hardcoded at call site)
- Uses Sonar verification prompt with status taxonomy:
  - `verified`, `incorrect`, `outdated`, `misleading`, `unverifiable`
- Expects JSON object in response
- Parses object via regex extraction + JSON.parse
- On parse failure, falls back to `unverifiable` low-confidence result

Runtime loop behavior in `runFactCheck(...)`:
- Verifies claims sequentially
- Adds a 300ms delay between claims to reduce rate-limit pressure
- If one claim verification fails, that claim becomes `unverifiable` and the loop continues

### 3. Report Generation
Function: `generateReport(...)`
- Produces markdown-like text summary
- Includes totals by status
- Includes per-issue section for non-verified claims
- Formats up to 2 source links per claim (domain-based link labels when possible)

## Progress, Cancellation, and Errors
Progress callbacks from `runFactCheck(...)`:
- "Extracting factual claims..." (10%)
- "Found X claims. Verifying..." (25%)
- "Verifying: ..." (25-90%)
- "Generating report..." (95%)
- "Complete!" (100%)

Cancellation:
- Uses `AbortController` from `AIContext`
- If cancelled, returns `isCancelled: true`

Error handling:
- Top-level failures set `isError: true` and propagate `errorMessage`
- Per-claim verification failure does not abort the whole session; that claim is marked `unverifiable`

## AIContext Integration
`handleFactCheck` in `AIContext.tsx`:
- Blocks if current selected model is image-only (task mismatch guard)
- Pulls source text from editor source selector
- Calls `runFactCheck(...)`
- Updates UI progress and error state
- Stores fact-check output as an analysis artifact (report text)
- Opens analysis report viewer (`AIResultsViewer`) on success
- Logs usage into two synthetic entries:
  - `fact-check-extraction`
  - `fact-check-verification`

Usage/cost accounting:
- Stage usage is now tracked directly in `runFactCheck(...)` for extraction and verification.
- `AIContext` logs exact per-stage token usage when available (with compatibility fallback only if missing).

## Known Constraints / Current Coupling
1. Search capability still depends on provider/model support; unsupported models may fail for `:online` or `web_plugin`.
2. Subjective/personal filtering uses pragmatic heuristics; edge cases can still slip through.
3. JSON extraction still relies on regex + parse, so malformed model output degrades to fallback behavior.
4. Some legacy fact-check entry points may still be wired to older edit/diff flows instead of analysis-artifact flow; slash command path (`/factcheck`) is the current reliable route.

## Current Validation Status
Validated in-repo:
- `src/renderer/services/factChecker.searchMode.test.ts`
- `src/renderer/services/openRouterBridge.test.ts`

Observed live smoke behavior (2026-02-14):
- Extraction request succeeded.
- Verification succeeded for:
  - `off`
  - `online_suffix`
  - `web_plugin`
