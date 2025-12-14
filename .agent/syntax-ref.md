# Project Syntax Reference

## Core Files & Modules
| Short Name | Full Path | Description |
|------------|-----------|-------------|
| `App` | `App.tsx` | Main application component and state orchestrator |
| `types` | `types.ts` | Shared TypeScript interfaces and types |
| `main` | `electron/main.js` | Electron main process (IPC handling) |
| `preload` | `electron/preload.js` | Electron preload script (Context Bridge) |
| `styles` | `index.css` | Global styles and Tailwind directives |

## Components (`components/`)
| Component | File | Purpose |
|-----------|------|---------|
| `MultiTextArea` | `MultiSelectTextArea.tsx` | Enhanced textarea with multi-selection & highlight overlays |
| `DiffSeg` | `DiffSegment.tsx` | Individual diff block (added/removed/unchanged) |
| `Projects` | `ProjectsPanel.tsx` | Side panel for managing text projects |
| `Prompts` | `PromptsModal.tsx` | CRUD modal for AI prompts |
| `History` | `CommitHistoryModal.tsx` | Git-style commit history viewer |
| `Logs` | `LogsModal.tsx` | AI usage logging and cost tracking |
| `Rating` | `RatingPrompt.tsx` | User feedback toast for AI tasks |
| `Context` | `ContextMenu.tsx` | Custom right-click menu for editor |

## Services (`services/`)
| Service | File | Functionality |
|---------|------|---------------|
| `Spell` | `spellChecker.ts` | **Local** spell checker (Typo.js/Hunspell) |
| `AI` | `ai.ts` | OpenRouter API wrapper & prompt handling |
| `Fact` | `factChecker.ts` | Perplexity API for claim verification |
| `PromptStore` | `promptStorage.ts` | Persistence (Electron Store / LocalStorage) for prompts |
| `ProjStore` | `projectStorage.ts` | Persistence for projects |

## Custom Hooks (`hooks/`)
| Hook | File | Responsibility |
|------|------|----------------|
| `useDiff` | `useDiffState.ts` | Manages diff segments, history, and merging logic |
| `useScroll` | `useScrollSync.ts` | Synchronizes scrolling between left/right panels |
| `useMenu` | `useElectronMenu.ts` | Handles native Electron menu IPC events |
| `useCommits`| `useCommitHistory.ts` | Manages commit stack and versioning |
| `usePrompts`| `usePrompts.ts` | Manages prompt CRUD and loading |
| `useSelect` | `useMultiSelection.ts` | Handles discontinuous text selection logic |

## State Terminology
| Term | Variable | Definition |
|------|----------|------------|
| `Source` | `sourceText` | Text being acted upon (usually from Left or Right panel) |
| `Preview` | `previewText` | The editable text in the Right (Diff) panel |
| `Original` | `originalText` | The baseline text in the Left panel |
| `Selection`| `selectionRanges` | Array of discontinuous selected text ranges |
| `Segments` | `segments` | Array of `DiffSegment` objects (the diff model) |

## Prompt IDs (`constants/prompts.ts`)
| ID | Display Name | Type |
|----|--------------|------|
| `spelling_local` | Spelling (Local) | Offline, Typo.js |
| `spelling_ai` | Spelling (AI) | LLM-based |
| `grammar` | Grammar Fix | LLM-based |
| `polish` | Full Polish | LLM-based |
| `fact-check` | Fact Check | Perplexity API |

## Key Functionality Terms
- **"Commit"**: Saving the current state of the Right panel as a new version node.
- **"Refresh Diff"**: Re-calculating the diff between the Left (Original) and Right (Preview) panels.
- **"Local Spelling"**: In-browser spell check using `.dic` files, 0 cost, instant.
