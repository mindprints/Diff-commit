# Handoff — Next Session (Created 2026-02-22)

## Current status
- Universal graph is now the active replacement path and supports project moves across repos.
- Universal graph interaction/UX polish shipped:
  - source-repo stays visible after move
  - hover tooltips render above neighboring pills
  - reliable double-click to open
  - delete quick action on project pills
  - sort dropdown (`name`, `date`, `reset`)
  - merge via Ctrl/Cmd+click ordered selection + `Merge (N)` button
- Project manager integration from universal graph works:
  - opens on top of universal graph
  - starts directly in create mode
  - cancel returns to graph
  - create/load returns to editor
- Prompt editing in main editor now supports renaming (`PROMPT NAME` / `SYSTEM INSTRUCTION` / `TASK`).
- Repo intelligence prototype (NotebookLM-style direction) is scaffolded and functional for v1:
  - repo index/query/redundancy IPC
  - main-process indexing over project contents
  - minimal repo intel panel
  - grounded summarize/ask/topic-map model calls using retrieved chunks
  - renderer fallback when preload bridge is stale/missing
- `npx tsc --noEmit` passes.

---

## Snapshot metadata
- Repository: `Diff-commit`
- Branch: `main`
- Date: `2026-02-22`

---

## What changed this session

### 1. Universal graph polish + feature parity work
- **Move behavior**: dropping a project into another repo now keeps the user in the source repo view (target repo no longer auto-loads).
- **Tooltip layering fix**: hovered project content previews are not occluded by adjacent pills.
- **Delete quick action**: project pills gained hover trash icon (confirm + delete).
- **Header controls**:
  - `New Project`
  - `Repo Intel`
  - `Merge` (with selected count in label)
  - `Sort` dropdown replacing separate sort buttons and housing `Reset View`
- **Merge workflow ported from old project graph**:
  - Ctrl/Cmd+click ordered multi-select
  - visible merge-selection highlight (violet border/ring)
  - merged project created in selection order
  - merge content bug fixed by creating merged project with `open: false` and then explicitly loading it via normal project-load path (prevents stale editor content overwrite)

### 2. Project manager + universal graph coordination
- `ProjectsPanel` z-index raised so it appears above universal graph and blurs the graph layer, not the main page.
- Added optional `onExitToEditor` callback so create/load exits universal graph while cancel does not.
- Added `startInCreateMode` to `ProjectsPanel` to remove extra click after pressing `New Project` in universal graph.

### 3. Prompt editing in main editor (rename support)
- Prompt editing format in `EditorPanel` expanded from 2 sections to 3:
  - `PROMPT NAME`
  - `SYSTEM INSTRUCTION`
  - `TASK`
- Save flow now writes `name` back through `updatePrompt(...)`.
- Parser remains backward-compatible with older 2-section prompt content.
- Retired `+ New Prompt` header button removed from prompt manager (`PromptGraphModal`) per new workflow.

### 4. Repo intelligence system design + implementation (prototype)
- Added shared repo-intel contracts (`src/shared/repoIntelTypes.ts`)
- Added main-process repo-intel services:
  - `src/main/repoIntelIndexService.ts`
  - `src/main/repoIntelIpc.ts`
- Registered `repo-intel:*` IPC handlers in `src/main/index.ts`
- Added preload bridge and renderer typings for `window.electron.repoIntel`
- Added renderer-side repo intel service/context skeleton:
  - `src/renderer/services/repoIntelService.ts`
  - `src/renderer/contexts/RepoIntelContext.tsx`
  - `src/renderer/hooks/useRepoIntel.ts`
- Added `RepoIntelPanel` UI modal and universal graph entry button

#### Repo intel v1 capabilities (working)
- **Indexing** (main process): scans repo project folders and ingests `content.md`
- **Chunking**: simple text chunking (char-based, newline-aware)
- **Retrieval**: lexical scoring (token overlap + phrase boost)
- **Redundancy**: exact duplicates + lexical similarity (Jaccard over tokens)
- **AI summarize/ask/topic map**:
  - grounded OpenRouter calls using retrieved excerpts
  - citations attached from retrieved top chunks

#### Important compatibility behavior
- If the app is running without the new preload bridge loaded (common after hot edits to preload/main without restart), renderer repo-intel falls back to `loadRepositoryAtPath(...)` and performs retrieval/redundancy client-side so the panel remains usable.
- Restarting Electron/main is still recommended to use the proper `repoIntel` bridge + main-process index path.

---

## Files modified / added (session summary)

### Universal graph / UI flow
- `src/renderer/components/UniversalGraphModal.tsx`
- `src/renderer/components/AppModals.tsx`
- `src/renderer/components/ProjectsPanel.tsx`
- `src/renderer/components/PromptGraphModal.tsx`
- `src/renderer/components/EditorPanel.tsx`
- `src/renderer/contexts/UIContext.tsx`

### Repo intelligence (new)
- `src/shared/repoIntelTypes.ts`
- `src/main/repoIntelIndexService.ts`
- `src/main/repoIntelIpc.ts`
- `src/renderer/services/repoIntelService.ts`
- `src/renderer/contexts/RepoIntelContext.tsx`
- `src/renderer/hooks/useRepoIntel.ts`
- `src/renderer/components/RepoIntelPanel.tsx`

### Wiring / typings
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/renderer/electron.d.ts`
- `src/renderer/contexts/index.tsx`
- `src/renderer/contexts/ProjectContext.tsx` (signature widening for `createNewProject(..., open?)`)

### Docs
- `HANDOFF-2026-02-21.md` (updated to 2026-02-22 state)
- `README.md`
- `docs/handoff-next-session-2026-02-22.md` (this file)

---

## Known issues / limitations
- Repo intel answer citations are currently retrieval-derived, not strict parsed/validated `[C#]` references from model output.
- Repo intel index is in-memory only (lost on restart).
- Repo intel retrieval is lexical only (no embeddings/hybrid search yet).
- Repo intel panel does not yet show detailed index stats or expose topic-map button in UI.
- Repo intel cost logging/session-cost integration not yet wired into existing AI accounting.
- Universal graph still lacks commit/diff lane integration (deferred).

---

## Suggested first checks next session
1. Restart Electron dev app and verify repo intel uses `window.electron.repoIntel` (no renderer fallback path hit).
2. Run repo-intel manual checks on a repo with 5+ projects:
   - `Build / Refresh Index`
   - `Summarize Repo`
   - `Ask Repo` (with a project-specific query)
   - `Find Redundancy`
3. Confirm merge workflow in universal graph with 2-3 projects:
   - selection order preserved
   - merged project content contains expected source blocks
   - editor opens merged project correctly
4. Prompt edit regression check:
   - edit prompt name/system/task in main editor
   - save prompt
   - verify rename reflected in prompt manager dropdown/graph

---

## Next implementation targets (recommended)
1. **Repo intel persistence**
   - persist index manifests/chunks to disk under app cache
   - add invalidation based on file timestamps/content hashes
2. **Grounding quality**
   - parse explicit model citations (`[C1]`, `[C2]`) and map to retrieved chunks
   - warn on uncited claims / unmatched citations
3. **Repo intel UI**
   - add `Map Topics` action button
   - display index status stats (sources/chunks/builtAt)
   - open-project shortcuts from redundancy pairs
4. **Universal graph roadmap**
   - commit/diff visualization lane
   - more quick actions
   - conflict handling UX on cross-repo moves

