# Project Syntax Reference

## Files (Short → Full)
| Short | Full Path |
|-------|-----------|
| `App` | App.tsx |
| `Rating` | components/RatingPrompt.tsx |
| `VerModal` | components/VersionHistoryModal.tsx |
| `Logs` | components/LogsModal.tsx |
| `Help` | components/HelpModal.tsx |
| `Btn` | components/Button.tsx |
| `DiffSeg` | components/DiffSegment.tsx |
| `Select` | components/SelectableTextArea.tsx |
| `ai` | services/ai.ts |
| `fact` | services/factChecker.ts |
| `gemini` | services/gemini.ts |
| `types` | types.ts |
| `elec.d` | electron.d.ts |
| `main.js` | electron/main.js |
| `preload` | electron/preload.js |
| `models` | constants/models.ts |

## Modes
| Short | Meaning |
|-------|---------|
| `INPUT` | ViewMode.INPUT (two textareas side by side) |
| `DIFF` | ViewMode.DIFF (diff view + preview pane) |

## UI Panels & Sections
| Short | Description |
|-------|-------------|
| `leftPane` | Original Version textarea (INPUT) / Interactive Diff (DIFF) |
| `rightPane` | Revised Version textarea (INPUT) / Committed Preview (DIFF) |
| `header` | Top bar with model selector, font controls, icons |
| `summary` | AI Summary drawer/overlay (bottom of preview) |
| `arrowBtn` | Copy left→right button (chevron) |
| `clearAll` | Clear Both Panels button |

## Buttons & Controls
| Short | Description |
|-------|-------------|
| `aiEdit` | "AI Edit..." dropdown button |
| `commit` | Green Commit button (DIFF mode) |
| `copy` | Copy button (DIFF mode) |
| `read` | Read Aloud button |
| `histBtn` | History icon button (header) |
| `logsBtn` | Logs icon button (header) |
| `darkBtn` | Dark/Light mode toggle |
| `undo/redo` | Undo/Redo buttons (DIFF mode header) |
| `accept` | Accept All button |
| `reject` | Reject All button |
| `refresh` | Refresh Diff button |
| `scrollSync` | Scroll sync toggle (Link2 icon) |

## AI Operations
| Short | PolishMode Value |
|-------|------------------|
| `spell` | 'spelling' |
| `gram` | 'grammar' |
| `polish` | 'polish' (full) |
| `prompt` | 'prompt' (expansion) |
| `exec` | 'execute' |
| `factck` | 'fact-check' |

## State Variables
| Short | Full Name |
|-------|-----------|
| `orig` | originalText |
| `mod` | modifiedText |
| `prev` | previewText |
| `segs` | segments |
| `vers` | versions |
| `mode` | mode (INPUT/DIFF) |
| `model` | selectedModel |
| `cost` | sessionCost |

## Modals
| Short | State Variable |
|-------|----------------|
| `helpOpen` | showHelp |
| `logsOpen` | showLogs |
| `verOpen` | showVersionHistory |
| `polishMenu` | isPolishMenuOpen |

## Handlers
| Short | Function |
|-------|----------|
| `doCompare` | handleCompare |
| `doPolish` | handlePolish |
| `doFact` | handleFactCheck |
| `doCommit` | handleCommit |
| `doRate` | handleRate |
| `doRestore` | handleRestoreVersion |
| `doClear` | handleClearAll |

## CSS/Spacing
| Short | Tailwind |
|-------|----------|
| `gap-3` | 12px gap |
| `gap-6` | 24px gap |
| `p-4` | 16px padding |
| `p-8` | 32px padding |

## Electron Menu
| Menu | Key Items |
|------|-----------|
| **File** | Open, Save As, Export/Import Versions, Quit |
| **Edit** | Undo, Redo, Clear All |
| **View** | Toggle Dark, Font Size/Family, Zoom |
| **Help** | Instructions, Logs, Versions, About |

## IPC Channels (main↔renderer)
| Channel | Direction | Description |
|---------|-----------|-------------|
| `file-opened` | main→render | File content from Open dialog |
| `request-save` | main→render | Trigger save from menu |
| `menu-undo/redo` | main→render | Edit commands |
| `menu-toggle-dark` | main→render | View toggle |
| `menu-show-help` | main→render | Open help modal |

