# Handoff - Next Session (Created 2026-02-10)

## Current status
- Prompt CRUD is now graph-based and legacy prompt modal is removed.
- Project and prompt graph modals now share extracted primitives (shell/canvas/menu/node/tooltip/search).
- Fact-check search mode is test-covered for all four modes.
- OpenRouter/Perplexity failure visibility improved (less generic error masking).

## Primary files touched in this session
- `src/renderer/components/AppModals.tsx`
- `src/renderer/components/EditorPanel.tsx`
- `src/renderer/components/ModelsModal.tsx`
- `src/renderer/components/ProjectNodeModal.tsx`
- `src/renderer/components/PromptGraphModal.tsx`
- `src/renderer/components/graph/GraphModalShell.tsx`
- `src/renderer/components/graph/GraphCanvas.tsx`
- `src/renderer/components/graph/GraphContextMenu.tsx`
- `src/renderer/components/graph/GraphNodeCard.tsx`
- `src/renderer/components/graph/GraphNodeTooltip.tsx`
- `src/renderer/components/graph/GraphSearchControl.tsx`
- `src/renderer/services/ai.ts`
- `src/main/index.ts`
- `src/renderer/services/factChecker.searchMode.test.ts`
- `src/renderer/components/PromptsModal.tsx` (deleted)

## Important behavior changes to be aware of
- AI request flow now retries once without `response_format` when format support is rejected.
- Main process now throws explicit timeout error text for OpenRouter requests.
- Prompt nodes now show tooltip on hover and persistent tooltip when selected.

## Recommended first checks next session
1. Manual UI smoke test:
   - Open prompt graph modal.
   - Hover prompt nodes (preview appears).
   - Select prompt node (persistent detail tooltip).
   - Edit/create/delete/reset/default actions from context menu.
   - Verify prompt default selection still updates runtime behavior.
2. Project graph regression check:
   - Drag nodes/canvas, create/delete edges, rename/delete project.
   - Commit drill-down and return-to-projects path.
3. Perplexity path check:
   - Run a prompt using a Sonar model and verify errors are specific if failures occur.
   - Verify fallback without `response_format` activates only when needed.

## Suggested next refactor candidates
- Extract a shared graph node header utility for icon+title+rename interaction.
- Normalize context menu item sets through typed helper factories.
- Add focused unit tests for graph primitives:
  - `GraphContextMenu`
  - `GraphNodeCard`
  - `GraphNodeTooltip`
  - `GraphSearchControl`

## Commands used successfully in this session
- `npx tsc --noEmit`
- `npx eslint <targeted files>`
- `npx vitest run src/renderer/services/factChecker.searchMode.test.ts src/renderer/services/openRouterBridge.test.ts`

## Caution
- The repository remains a dirty worktree with unrelated pre-existing changes.
- Do not use destructive reset/revert against unrelated files without explicit user approval.
