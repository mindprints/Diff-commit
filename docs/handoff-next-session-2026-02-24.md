# Handoff — Next Session (Created 2026-02-24)

## Snapshot metadata
- Repository: `Diff-commit`
- Branch: `main`
- Date: `2026-02-24`

## What changed this session

### 1. Prompting UX improvements
- Added starter pills to `AIPromptPanel` to seed editable prompt text/commands:
  - `Review`, `Analyze`, `Fact-check`, `Rewrite`, `Compress`, `Expand`, `Compose`, `Edit`
- Added Prompt Graph `Sort` dropdown (pattern aligned with Universal Graph):
  - sort by name / type / pinned / order
  - reset view
- Increased prompt title display space:
  - wider prompt graph node width
  - wider active prompt label in header split-button dropdown
- Moved Prompt Graph pin dropzone to the **left side** to avoid top-right sort menu overlap.

### 2. Prompt soft staging + close-save integration
- Prompt CRUD changes are now **soft-staged in memory** during the session (no immediate persistence).
- Staged prompt changes are included in Electron close-save flow:
  - `Save` persists staged prompts
  - `Don't Save` discards staged prompts
  - `Cancel` keeps app open
- Window dirty-state now includes both:
  - unpersisted project content changes
  - staged prompt changes

### 3. Model persistence + model ping audit
- Fixed text default model restore for imported OpenRouter models in `AIContext`.
- Added model ping audit system:
  - pings **all available models** (not role-specific selections)
  - startup autorun (default on; user-toggle in Settings)
  - manual trigger from Settings
  - results popup sorted by latency (successes first, failures after)

### 4. Models import browser clarity improvements
- Added `Show Imported` toggle in Import Browser.
- Added `Imported` badges in import rows.
- Added search hint for hidden already-imported matches.
- This helps distinguish:
  - "missing from OpenRouter `/models` response"
  - "already imported and therefore hidden"

### 5. OpenRouter image generation request compatibility fix
- Image-generation requests now include `modalities: ["image"]` on `/chat/completions`.
- Updated renderer bridge/preload/main typings to support `modalities`.
- Improved image-generation error reporting to surface JSON response bodies.

### 6. OpenRouter catalog debugging results (important)
- Direct checks against OpenRouter `/api/v1/models` (authenticated and unauthenticated) show:
  - `bytedance-seed` models are present
  - `black-forest-labs` and `sourceful` are absent in this environment
- Therefore those providers cannot currently appear in the app import browser because the upstream endpoint is not returning them.
- This is separate from image-generation request formatting/runtime compatibility.

## Files touched (high level)
- `src/renderer/components/AIPromptPanel.tsx`
- `src/renderer/components/PromptGraphModal.tsx`
- `src/renderer/components/PromptDropdownButton.tsx`
- `src/renderer/hooks/usePrompts.ts`
- `src/renderer/contexts/AIContext.tsx`
- `src/renderer/hooks/useElectronMenu.ts`
- `src/renderer/App.tsx`
- `src/renderer/contexts/ProjectContext.tsx`
- `src/renderer/components/AppModals.tsx`
- `src/renderer/components/SettingsModal.tsx`
- `src/renderer/components/ModelsModal.tsx`
- `src/renderer/services/imageGenerationService.ts`
- `src/renderer/services/openRouterBridge.ts`
- `src/renderer/electron.d.ts`
- `src/preload/index.ts`
- `src/main/index.ts`
- `src/renderer/contexts/ModelsContext.tsx`
- `packages/model-intel-core/src/openRouterModels.ts`
- `packages/model-intel-core/src/artificialAnalysis.ts`
- `src/shared/openRouterModels.test.ts`

## Validation run
- `npx tsc --noEmit` ✅
- `npx vitest run src/shared/openRouterModels.test.ts` ⚠️ **UNVERIFIED** (FAILED with `spawn EPERM` in sandbox environment; see blockers below).

## Known caveats / follow-up
- Prompt soft staging means prompt edits are not persisted until save/close. Crash/force-close can lose staged prompt changes.
- OpenRouter image model availability in Import Browser still depends entirely on upstream `/models` catalog visibility.
- Some image-capable models may still have no Artificial Analysis scores if AA does not provide matching benchmark entries or uses image-specific metrics we do not yet parse/render.

## Suggested first checks tomorrow
1. **BLOCKER: Fix and verify test execution.** The command `npx vitest run src/shared/openRouterModels.test.ts` failed with `spawn EPERM`. This must be resolved (check permissions/environment) and the test must pass before relying on the `openRouterModels.ts` changes.
2. Manually test Flux/OpenRouter image generation after `modalities: ["image"]` patch.
2. Confirm close-save dialog behavior for prompt-only edits:
   - create/edit prompts
   - close app
   - verify Save / Don't Save / Cancel semantics
3. Verify Prompt Graph sort actions + left-side pin dropzone on small and large windows.
4. **Tracked: Staged prompt crash-loss mitigation.** Current soft staging can lose edits on crash/force-quit. Implement an autosave-to-temp/draft store (e.g., `localStorage` or a draft file) with periodic background saves. 
    - Implementation: Check for persisted draft key on launch and show recovery prompt.
    - UI Support: Implement the `Staged prompts` badge/indicator and add a manual `Save prompts now` fallback action in the header/graph.

