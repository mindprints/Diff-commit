# Handoff - Next Session (Created 2026-02-10)

## Current status
- Prompt CRUD is now graph-based and legacy prompt modal is removed.
- Project and prompt graph modals now share extracted primitives (shell/canvas/menu/node/tooltip/search).
- Fact-check search mode is test-covered for all four modes.
- OpenRouter/Perplexity failure visibility improved (less generic error masking).

## Snapshot metadata (for reproducibility)
- Repository: `Diff-commit`
- Branch: `main`
- HEAD (short SHA): `57e5968`
- Worktree state at handoff update:
  - Modified: `package.json`
  - Modified: `package-lock.json`

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

## Validation summary (latest known)
- Type check: pass (`npx tsc --noEmit`)
- Lint (targeted): pass (`npx eslint <targeted files>`)
- Tests (targeted): pass
  - `src/renderer/services/factChecker.searchMode.test.ts`
  - `src/renderer/services/openRouterBridge.test.ts`
- Notes:
  - This is a targeted validation set, not full-repo test coverage.
  - Re-run before presentation if additional changes are made.

## Open issues and explicit TODO state
- Known blocking bugs: none documented in this handoff.
- Known non-blocking issues: none documented in this handoff.
- TODO for next session:
  - Confirm no regressions in prompt default selection after any final UI polish.
  - Add unit tests for extracted graph primitives (see refactor candidates).

## Environment assumptions
- Node/npm toolchain available locally.
- Network access available for model provider calls (OpenRouter/Perplexity).
- For deployment path, Docker-capable host available (Dokploy VPS target).

## Presentation checklist (this evening)
1. Run pre-demo checks:
   - `npx tsc --noEmit`
   - `npx eslint <targeted files>`
   - `npx vitest run src/renderer/services/factChecker.searchMode.test.ts src/renderer/services/openRouterBridge.test.ts`
2. Demo flow:
   - Prompt graph CRUD from context menu.
   - Hover preview + persistent selected tooltip behavior.
   - Project graph navigation and commit drill-down path.
   - Perplexity/Sonar error specificity and fallback behavior.
3. Prepare rollback:
   - Keep previous stable image/tag ready on VPS.
   - Confirm current production route can be switched back quickly in Dokploy.

## Dokploy migration notes (multi-app VPS)
- Goal: deploy without disrupting existing Docker workloads.
- Recommended approach:
  1. Use unique service/container names and non-overlapping ports.
  2. Reuse existing Dokploy reverse proxy routing (domain/subdomain path).
  3. Inject env vars via Dokploy secrets; do not bake keys into image.
  4. Start with single replica and healthcheck before enabling traffic.
  5. Validate logs and provider connectivity, then promote.
- Minimum preflight on VPS:
  - Port availability against currently running apps.
  - CPU/RAM headroom for new container.
  - Persistent volume mapping if runtime state/log retention is needed.

## Caution
- The repository remains a dirty worktree with unrelated pre-existing changes.
- Do not use destructive reset/revert against unrelated files without explicit user approval.

## Update - 2026-02-12 (Presentation deployment prep)

### Validation executed today
- `npx tsc --noEmit` -> pass
- `npx vitest run src/renderer/services/factChecker.searchMode.test.ts src/renderer/services/openRouterBridge.test.ts` -> pass (2 files, 6 tests)
- `npx eslint` on touched/targeted handoff files -> pass
- `npx eslint src --max-warnings=0` -> fail due to pre-existing repo-wide issues (not introduced by this handoff update)

### Deployment assets added
- `Dockerfile.web` (multi-stage build, serves `dist/` via nginx)
- `nginx.web.conf` (SPA fallback + `/healthz` endpoint)
- `.dockerignore` (reduces build context)

### Git refs created for deployment
- Validated checkpoint tag: `presentation-2026-02-12-57e5968`
- Deployment commit: `4bd9b0d`
- Deployment tag (Dokploy target): `presentation-deploy-2026-02-12`
- Deployment branch (Dokploy target): `presentation-2026-02-12`

### Push/cutover notes
- Push to `origin/main` was rejected (remote advanced). No force push was used.
- Deployment was published through dedicated branch/tag to avoid rebasing local uncommitted work.
- Local uncommitted files still present:
  - `package.json`
  - `package-lock.json`

### Dokploy runtime settings used/recommended
1. Source ref: `presentation-deploy-2026-02-12` (preferred immutable tag) or `presentation-2026-02-12`
2. Dockerfile path: `Dockerfile.web`
3. Exposed port: `80`
4. Healthcheck path: `/healthz`
5. Keep prior stable service routed for immediate rollback until smoke checks pass

### Post-deploy smoke script (executed manually)
1. Load app and verify first paint with no critical console/network errors.
2. Prompt graph CRUD and default prompt behavior.
3. Hover and persistent tooltip behavior on prompt nodes.
4. Project graph drag/edge create-delete/rename flow.
5. Run AI prompt and verify diff output behavior.
6. Trigger Perplexity/Sonar path and verify specific failure messaging.
7. Confirm `/healthz` returns `200 ok`.
