# Diff & Commit AI

**Diff & Commit AI** is a specialized, local-first desktop editor for refining text. It combines a professional **git-style diff engine** with multi-model **AI polishing tools** to help you iteratively improve content.

Unlike generic chat interfaces, this tool is built for *merging*: it visualizes exactly what changed, lets you accept/reject specific edits, and maintains a commit history of your revisions.

## 🌟 Key Features

### ⚡ Local & AI Hybrid Editing
*   **Local Spell Checker**: Instant, offline spell checking using Hunspell dictionaries (`en_US`). Zero latency, zero cost.
*   **Active Prompt System**: Centralized prompt selection and execution. Select a prompt from the header dropdown to make it "Active".
*   **Split-Button Execution**: A dual-action button in the header allows you to either select a new active prompt or immediately execute the current one.
*   **Integrated Prompt Panel**: Direct content generation and modification via custom instructions in the side panel.

### 🛡️ Fact Checker (Configurable Models + Search Modes)
Verify claims with model-configurable extraction and verification.
*   **Two-Stage Pipeline**: Extracts verifiable claims first, then verifies each claim independently.
*   **Configurable Models**: Choose extraction and verification models from Settings.
*   **Search Modes**: Run verification with `off`, `auto`, `online_suffix`, or `web_plugin` behavior.
*   **Structured Report Output**: Fact-check results open in a dedicated analysis viewer instead of directly rewriting editor text.

> See [docs/fact-checking-logic.md](docs/fact-checking-logic.md) for implementation details.

### 🔍 Multi-Panel Layout & Merge
*   **3-Panel Workflow**: Editor, AI Prompt Library, and Diff View all side-by-side for maximum productivity.
*   **Visual Diff**: Green (Added) / Red (Removed) highlighting.
*   **Smart Toggles**: Click any change to Accept or Reject it instantly.
*   **Linked Segments**: Intelligently group paired deletions and additions so you can accept or reject entire replacements as a single unit, toggling between the original text and the AI's replacement instantly.
*   **Editor Panel**: The left-hand panel is always editable. Make manual tweaks, then hit **"Compare"** to see how they differ from the original.
*   **Auto-Compare Toggle**: Enable real-time diff updates while editing (⚡ icon next to Compare button).
*   **Adjustable Boundaries**: Drag to resize panels and optimize your workspace.

### 💾 Git-Style Commit System
*   **Commit History**: Save "snapshots" of your text as you work.
*   **Restore**: Instantly revert to any previous committed version.
*   **Diff Against History**: Compare your current draft against any past version.
*   **Isolated Storage**: Each project folder has its own `.diff-commit/commits.json` file—no cross-contamination between projects.

### 📁 Repository & Project Management
*   **Repository-based Workflow**: A repository is a folder containing project subfolders.
*   **Folder-Based Projects**: Each project is a self-contained folder with:
    *   `content.md` — Your document text
    *   `.diff-commit/commits.json` — Version history
    *   `.diff-commit/metadata.json` — Project metadata (creation timestamp)
*   **Welcome Gate**: On first launch, you must create or open a repository before accessing the editor.
*   **Browser File System Access**: Full file system access in Chromium browsers via the File System Access API.
*   **Project Isolation**: Each project maintains completely independent content and commit history.
*   **HTML Import**: Import HTML documents—automatically converted to Markdown using Turndown.

### 🖱️ Advanced Selection (Ctrl+Drag)
*   **Multi-Selection**: Hold `Ctrl` to select multiple, non-contiguous pieces of text.
*   **Batch Processing**: Run AI operations (like "Fix Grammar") on *only* the selected headers or paragraphs at once.

### 📝 Prompt Library (CRUD)
*   **Custom AI Prompts**: Create, edit, and delete your own AI instruction sets.
*   **Organization**: Organize prompts with custom names and colors.
*   **Quick Access**: Seamlessly switch between built-in presets and your own custom library.

### 📊 Model Benchmarks (Artificial Analysis)
*   **Intelligence Scores**: View AI model benchmarks (Intelligence, Coding, Math indexes) from Artificial Analysis.
*   **Task-Based Sorting**: Sort models by task type (Coding, Intelligence, Math, Speed, Value).
*   **Price/Performance**: Compare models by value metric (intelligence per dollar).
*   **Fuzzy Matching**: Automatically matches your OpenRouter models to benchmark data.
*   **24-Hour Cache**: Benchmark data cached locally to minimize API calls.

### 🖼️ AI Image Generation
*   **Prompt Panel Integration**: Generate images directly from the Prompt Panel using natural language.
*   **Trigger Keywords**: Use phrases like `generate image`, `create image`, or `image:` to activate.
*   **Model Auto-Detection**: Automatically detects image-capable models (Gemini, FLUX, DALL-E, Stable Diffusion).
*   **Smart Fallback**: If current model doesn't support images, finds an alternative from your imported models.
*   **Image Viewer Overlay**: View, save (as PNG), or regenerate images in a dedicated overlay.
*   **Context-Aware**: Include editor content as context for more relevant image generation.

> See [docs/image-generation.md](docs/image-generation.md) for detailed documentation.

### 📄 Analysis Results + Slash Commands
*   **Analysis Viewer**: Fact checks and critical reviews render in a dedicated report panel.
*   **Prompt Panel Slash Commands**: Deterministic command routing for analysis vs rewrite workflows.
*   **Workflow**: Run `/factcheck`, `/review`, or `/analyze`, then apply outcomes via `/edit` with “Use latest analysis context”.
*   **Built-in Manual**: Open `Tools -> Slash Command Manual` for in-app command docs.

### 🎨 Theme & Personalization
*   **Dynamic Hue Slider**: Adjust the application's accent color in real-time with a compact hue slider (0-360°).
*   **Adaptive Dark Mode**: Full support for both light and dark system preferences.

---

## 📂 Project Structure

```text
Diff-commit/
├── src/
│   ├── main/                   # Electron Main Process
│   │   └── index.ts            # Window management, IPC, native menus
│   ├── preload/                # Electron Preload Scripts
│   │   └── index.ts            # Secure bridge (contextBridge)
│   └── renderer/               # React Frontend
│       ├── components/         # UI Components
│       ├── hooks/              # Custom React Hooks
│       ├── services/           # API & Storage Services
│       ├── constants/          # Models & Prompts
│       ├── App.tsx             # Main Application
│       └── index.html          # Entry HTML
├── public/
│   └── dictionaries/           # Hunspell (.aff/.dic) files
├── electron.vite.config.ts     # Unified Vite config for Electron
├── package.json
└── README.md
```

### Project Folder Structure
```text
My Writing Projects/            # Repository (folder you create/open)
├── My Essay/                   # Project (folder)
│   ├── content.md              # Your document
│   └── .diff-commit/           # Version control data
│       ├── commits.json        # Commit history
│       └── metadata.json       # Project metadata (createdAt)
├── Work Notes/                 # Another project
│   ├── content.md
│   └── .diff-commit/
│       ├── commits.json
│       └── metadata.json
```

---

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18+)
*   OpenRouter API Key (for AI features)
*   (Optional) Perplexity API Key (for Fact Checking)
*   (Optional) Artificial Analysis API Key (for Model Benchmarks)

### Installation
1.  Clone the repo.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Set up environment:
    ```bash
    cp .env.example .env
    # Add your API keys to .env:
    # OPENROUTER_API_KEY=your_key
    # PERPLEXITY_API_KEY=your_key (optional)
    # ARTIFICIAL_ANALYSIS_API_KEY=your_key (optional)
    ```

### Running Locally

The project uses **electron-vite** for a unified development experience:

```bash
# Start Electron app with hot reload (recommended)
npm run dev

# Build for production
npm run build

# Preview production build
npm run start

# Build Windows installer
npm run build:win
```

*Builds are output to the `release/` directory.*

---

## � Working with Projects

Diff & Commit AI uses a **Repository -> Project** hierarchy to keep your work organized and safely stored on your local disk.

### ➕ Creating a Project
1.  **Open/Create a Repository**: On first launch, select a folder on your computer to be your workspace (Repository).
2.  **Add New Project**: Open the side panel and click the **"+"** icon.
3.  **Name Your Work**: Enter a name (or use the auto-generated timestamp). This creates a new subfolder in your repository containing a `content.md` file and version data.

### 💾 Saving & Snapshots (Commits)
The tool uses a git-style "commit" system to ensure you never lose a draft while iterating with AI.
-   **Manual Save**: Your current text is automatically saved as a "draft" to the project folder.
-   **Save Project**: `File -> Save Project` writes the current editor draft to the project's `content.md`.
-   **Export Project Bundle**: `File -> Export Project Bundle...` exports a copy of `content.md` and `commits.json` to a chosen folder.
-   **Commit (Snapshot)**: Hold **Shift + Click** the AI execution button (or use the Commit button in the History panel) to create a permanent snapshot.
-   **Stable Identity**: Projects are assigned a unique, stable ID (UUID). You can safely rename a project folder in the UI—the tool preserves its stable ID, ensuring your history and references remain intact.

### 🚪 Closing Behavior & Recovery
-   **Close Prompt for Unsaved Drafts**: If the current draft has not been persisted to `content.md`, closing the app prompts `Save / Don't Save / Cancel`.
-   **Save on Close**: Choosing `Save` writes the current draft before the window closes.
-   **Recovered Draft Banner**: If an unsaved draft snapshot exists on next launch, the editor shows a banner with `Restore Draft` or `Discard`.
-   **Expected Startup State**: The app opens the most recently updated project in the current repository; recovered drafts are optional and explicit.

### 📂 Loading & Switching
-   **Project List**: Open the side panel to see all projects within your current repository.
-   **Switching**: Click a project name to load it. The editor will automatically re-read the `content.md` from disk and load its unique history.
-   **Auto-Save on Switch**: The app will attempt to save your current draft before loading a different project to prevent data loss.

### 🗑️ Management
-   **Rename**: Use the edit icon next to a project name in the sidebar to change its name.
-   **Delete**: Deleting a project removes the entire project folder and its history data from your disk permanently.

---

## 🛠️ Terminology

To avoid confusion during development:*   **Editor (Left)**: The editable "Working Copy" where you type and edit.
*   **Diff View (Right)**: Shows the comparison between Original and your edits, with accept/reject toggles.
*   **Original**: The immutable baseline text you are comparing against.
*   **Commit**: Saving the current state to history and making it the new baseline.
*   **Diff Mode**: The primary view showing the comparison between Original and your edits.
*   **Active Prompt**: The currently selected instruction set for the AI (e.g., "Grammar Fix"). Once selected, it can be triggered via the header button or Ctrl+Click.
*   **Repository**: A folder on your computer that contains project folders.
*   **Project**: A folder within a repository containing `content.md` and `.diff-commit/`.

---

## 📝 Changelog (v1.5.0)

### New Features

#### ✍️ Formatting Shortcuts
*   **`Ctrl+B`** — Wraps selected text in `**...**` (bold). Pressing again unwraps.
*   **`Ctrl+I`** — Wraps selected text in `*...*` (italic). Pressing again unwraps.
*   **No selection**: Inserts the marker pair with the cursor between them, ready to type.
*   Shortcuts only activate when the main editor textarea is focused.
*   Uses `*` (not `_`) for italic: `*` renders at any text position; `_` silently fails adjacent to alphanumeric chars (CommonMark §6.2).
*   Leading/trailing whitespace in the selection is moved **outside** the markers so the closing delimiter is never preceded by a space.

#### 📥 Extended Import (`File → Import File...`)
*   **DOCX** (`.docx`) — Converted via `mammoth` → HTML, then `turndown` → Markdown. Headings, bold, italic survive.
*   **HTML** (`.html`, `.htm`) — Converted to Markdown via `turndown`.
*   **Markdown & plain text** — Passed through unchanged.
*   Import failures show a native error dialog.

#### 📤 Format-Aware Export (`File → Export Preview As`)
*   Submenu with three explicit format choices:
    *   **Markdown (.md)** — Native format, saved as-is.
    *   **HTML (.html)** — Rendered to a clean styled HTML document via `marked`.
    *   **Plain Text (.txt)** — Markdown syntax stripped via `markdown-to-txt`.
*   Correct extension is pre-filled in the save dialog and auto-appended if cleared.
*   Conversion failures show a native error dialog and abort — no silently corrupt files.

### Bug Fixes & Hardening
*   `mammoth`, `marked`, `markdown-to-txt` added to Vite externals (prevents bundling failures).
*   Mammoth CJS interop fixed: `(mammothMod.default ?? mammothMod)` used for API access.
*   Variable shadowing in import handler (`result`) resolved to `openResult`/`mammothResult`.
*   `rawHtml` hoisted outside `try` so the `catch` fallback is in scope.
*   `save-file` IPC: `defaultName` validated with `typeof === 'string'` before `.replace()`.
*   Export catch blocks: now show error dialog and return `null` instead of writing corrupt output.
*   Unwrap cursor: `selectionStart` correctly shifted after marker removal.
*   Format fallback: `??` → `||` to also catch empty-string formats.

---

## 📝 Changelog (Unreleased / Prototype Work)

### Universal Graph (active prototype replacement path)
*   **Project move UX polish**: Dragging a project to a repo zone now keeps you in the source repo view (target repo flashes on success).
*   **Reliable open behavior**: Double-click on project pills opens the project in the editor again.
*   **Project quick actions**: Hover trash icon added for deleting projects directly from the universal graph.
*   **Merge workflow**: `Ctrl/Cmd+Click` select multiple projects (selection order preserved) and merge them via a new `Merge` button.
*   **Sorting controls**: Sort-by-name and sort-by-date moved into a compact `Sort` dropdown (with `Reset View`).
*   **Layering fix**: Hover previews/tooltips render above surrounding pills.

### Project Manager integration (from Universal Graph)
*   `New Project` in universal graph opens the Project Manager **on top of** the graph.
*   The Project Manager opens directly in create mode (no second "New" click).
*   Cancel returns to universal graph; create/load returns to the editor.

### Prompt Editing in Main Editor
*   Prompt edit mode now supports renaming via a 3-tier format in the main editor:
    *   `PROMPT NAME`
    *   `SYSTEM INSTRUCTION`
    *   `TASK`
*   Saving prompt edits now updates prompt name as well as content fields.

### Repo Intelligence Prototype (NotebookLM-style direction)
*   New repo-scoped analysis prototype with a minimal `RepoIntelPanel`:
    *   Build/refresh index
    *   Summarize repo
    *   Ask repo
    *   Find redundancy
*   V1 backend/indexing scans project `content.md` files across the repo.
*   Grounded AI summarize/ask flows use retrieved repo excerpts and return source citations (retrieval-derived).
*   Renderer fallback path exists when the new Electron preload bridge is not yet loaded (restart Electron to use the full main-process repo-intel path).

### Prompting UX + Prompt Persistence (latest prototype work)
*   **Prompt Panel Starter Pills**: Clickable starters (`Review`, `Analyze`, `Fact-check`, `Rewrite`, `Compress`, `Expand`, `Compose`, `Edit`) seed the prompt panel with editable text/commands.
*   **Prompt Graph Sort Dropdown**: Prompt graph now has graph-aligned sorting controls (`name`, `type`, `pinned`, `order`, `reset view`).
*   **Prompt Soft Staging**: Prompt CRUD changes are staged in-session (not immediately persisted) and can be saved/discarded via the app close flow.
*   **Prompt Title Space**: Wider prompt graph nodes and wider active-prompt label area reduce truncation.

### Model Manager / Diagnostics
*   **Imported Text Model Restore**: Default text model now restores correctly when the selected model is an imported OpenRouter model.
*   **Model Ping Audit**: Settings can run a full model ping audit (all available models), with optional auto-run at startup and a results popup sorted by latency.
*   **Import Browser Clarity**: Added `Show Imported` toggle, `Imported` badges, and search hints when matches are hidden because they are already imported.

### OpenRouter Image Generation Compatibility
*   **Image `modalities` support**: Image generation requests now include `modalities: ["image"]` for OpenRouter `/chat/completions` calls (important for Flux-style image models).
*   **Improved Error Details**: Image-generation errors now surface JSON response bodies when available.

---

## 📝 Changelog (v1.4.0)

### New Features
*   **AI Image Generation**: Generate images from the Prompt Panel using natural language. Supports Gemini, FLUX, DALL-E, and Stable Diffusion models with automatic model detection and fallback.
*   **Consolidated Prompt System**: centralizes AI execution around a single "Active Prompt" workflow.
*   **Active Prompt Dropdown**: Transform the AI header menu into a selector for the global active prompt.
*   **Split AI Edit Button**: New primary header action to execute the active prompt with one click.
*   **Prompt Panel Execution**: Type raw instructions in the Prompt Panel and press `Enter` to modify text or generate new content from scratch.
*   **Unified Ctrl+Click**: `Ctrl+Click` on any word now consistently triggers the currently active prompt for rapid iteration.
*   **Model Benchmarks**: Compare AI models by intelligence, coding, math, speed, and value scores with 24-hour cached benchmark data from Artificial Analysis.

### Stability & Performance
*   **Async Operation Safety**: Resolved React lifecycle crashes during parallel AI operations.
*   **Staleness Prevention**: Implemented `previewTextRef` to ensure async operations always utilize the absolute latest document state.
*   **Empty Editor Support**: Enabled content generation from an empty editor via the Prompt Panel.

### UI/UX Refinement
*   **Context Menu Restoration**: Restored default right-click behavior by removing redundant AI polishing options.
*   **Active Prompt HUD**: The main header button now dynamically reflects the name of the selected active prompt.

---

## 📝 Changelog (v1.3.0)

### New Features
*   **3-Panel UI Refactor**: Fully restored and optimized the side-by-side layout (Editor, AI Prompt Library, Diff View).
*   **Prompt Management System**: Full CRUD for AI prompts with persistent storage (Electron Store/LocalStorage).
*   **Theme Customization**: Real-time hue slider for personalized app aesthetics.
*   **Adaptive Sidebar**: Collapsible/Resizable panels for a more flexible document editing experience.

### Developer Experience
*   **Tailwind CSS Linting**: Added workspace settings to suppress unknown at-rule warnings.
*   **Architecture Refactor**: Extracted complex logic into focused custom hooks (`useElectronMenu`, `useProjects`, `usePrompts`, etc.).
*   **Upgraded Dependencies**: React 19, Vite 6, and Electron 39 support.

### Bug Fixes
*   **Fixed Project Residue**: Resolved issues where old content would persist when creating or switching projects.
*   **Fixed Scroll Sync**: Improved robustness of scroll synchronization between panels.

---

## 📝 Changelog (v1.2.9)

### Breaking Changes
*   **Folder-Based Projects**: Projects are now folders (not files). Each project contains:
    *   `content.md` — The document text
    *   `.diff-commit/commits.json` — Version history
    *   `.diff-commit/metadata.json` — Creation timestamp
*   **Note**: Old file-based repositories will need to be recreated with the new structure.

### New Features
*   **Welcome Modal**: Users must create or open a repository on first launch—no more "invisible" commits.
*   **Metadata Tracking**: Proper `createdAt` (persisted) and `updatedAt` (file modification time) tracking.
*   **Content Persistence**: Document content is saved to `content.md` on every commit.
*   **Fresh Content Loading**: Switching projects re-reads content from disk, ensuring no stale data.

### Bug Fixes
*   **Fixed Content Residue**: New projects now start with a clean editor—no inherited content.
*   **Fixed Commit Crossover**: Each project's commits are now fully isolated in their own folder.
*   **Fixed Project Switching**: Content and commits correctly load when switching between projects.

### UI/UX Improvements
*   **Clearer Repository Creation**: Default name changed from "Diff-Commit-Repos" to "My Writing Projects".
*   **Better Empty State Messaging**: Clear guidance on creating repositories vs. projects.

---

## 📝 Changelog (v1.2.7)

### New Features
*   **HTML Import**: Import HTML files—automatically converted to Markdown using Turndown (preserves headings, lists, links, emphasis).
*   **Auto-Compare Toggle**: Enable real-time diff updates while editing (⚡ icon). Debounced to 500ms to avoid excessive updates.
*   **Header Fallback Text**: Shows "No Repo" and "Unsaved Project" when no repository/project is selected.

### Bug Fixes
*   **Fixed Scroll Sync**: Scroll synchronization now works correctly after panel layout swap.
*   **Fixed Compare Button**: Compare button now properly shows diffs after manual edits.

### Code Cleanup
*   Removed orphaned comments referencing old panel layout terminology.

---

## 📝 Changelog (v1.2.6)

### New Features
*   **Panel Layout Swap**: Editor now on left, Diff View on right for more intuitive workflow.
*   **Background Hue Theming**: Compact slider in header to customize app color theme (0-360° hue).

### Improvements  
*   **Unified Theming**: CSS custom properties for consistent color theming across all UI areas.
*   **Fixed Header Heights**: Both panel headers now have consistent fixed height.
*   **Panel Background Consistency**: Both panels now use matching background structure.

---

## 📝 Changelog (v1.2.5)

### Bug Fixes
*   **Fixed Cumulative Diffs**: Subsequent AI edits now correctly show diffs against the original baseline instead of resetting.
*   **Fixed Electron Spellcheck**: Local spell checker now works in packaged Electron app (dictionary path resolution for `extraResources`).

### Technical Improvements
*   Added `originalTextRef` to prevent stale closure in `useAsyncAI` diff callback.
*   Added `publicDir` to electron-vite config for static asset handling.
*   Added dictionaries to `extraResources` and exposed `resourcesPath` in preload.

---

## 📝 Changelog (v1.2.3)

### New Features
*   **electron-vite Migration**: Unified development with single `npm run dev` command and HMR support.
*   **Browser File System Access**: Real file system access in Chromium browsers for repository/project management.
*   **Per-Project Commits**: Each project now maintains its own independent commit history.
*   **Dynamic Version Display**: Version number now reads from `package.json` in both Electron and browser modes.

### Improvements
*   **Fixed Local Spell Checker**: Dictionary paths updated for electron-vite compatibility.
*   **Project Switching**: Content properly resets when switching between projects.
*   **Clear All Commits**: Now properly clears commits in browser file system mode.

