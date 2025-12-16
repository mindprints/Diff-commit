# Diff & Commit AI

**Diff & Commit AI** is a specialized, local-first desktop editor for refining text. It combines a professional **git-style diff engine** with multi-model **AI polishing tools** to help you iteratively improve content.

Unlike generic chat interfaces, this tool is built for *merging*: it visualizes exactly what changed, lets you accept/reject specific edits, and maintains a commit history of your revisions.

## 🌟 Key Features

### ⚡ Local & AI Hybrid Editing
*   **Local Spell Checker**: Instant, offline spell checking using Hunspell dictionaries (`en_US`). Zero latency, zero cost.
*   **AI Polish**: Access top-tier models (DeepSeek, Claude, GPT-4, Gemini) via OpenRouter for complex tasks:
    *   **Grammar Fix**: Strict syntax correction.
    *   **Full Polish**: Flow, tone, and clarity improvements.
    *   **Spelling (AI)**: Context-aware spelling for technical terms.
    *   **Prompt Expansion**: Turn rough notes into detailed LLM prompts.

### 🛡️ Fact Checker (Perplexity)
Verify claims with real-time web search.
*   **Deep Extraction**: Identifies causal, statistical, and historical claims.
*   **Verification**: Checks each claim against live web sources using Perplexity Sonar Pro.
*   **Categorization**: Tags claims (e.g., 'Medical', 'Political', 'Statistical').

### 🔍 Interactive Diff & Merge
*   **Visual Diff**: Green (Added) / Red (Removed) highlighting.
*   **Smart Toggles**: Click any change to Accept or Reject it instantly.
*   **Linked Segments**: Intelligent handling of replacements (swapping words toggles both the removal and addition).
*   **Committed Preview**: The right-hand panel is always editable. Make manual tweaks, then hit **"Compare"** to see how they differ from the original.

### 💾 Git-Style Commit System
*   **Commit History**: Save "snapshots" of your text as you work.
*   **Restore**: Instantly revert to any previous committed version.
*   **Diff Against History**: Compare your current draft against any past version.
*   **Per-Project Storage**: Each project has its own independent commit history stored in `.commits/commits.json`.

### 📁 Repository & Project Management
*   **Repository-based Workflow**: Open a folder as a repository, each subfolder becomes a project.
*   **Browser File System Access**: Full file system access in Chromium browsers via the File System Access API.
*   **Project Isolation**: Each project maintains independent content and commit history.

### 🖱️ Advanced Selection (Ctrl+Drag)
*   **Multi-Selection**: Hold `Ctrl` to select multiple, non-contiguous pieces of text.
*   **Batch Processing**: Run AI operations (like "Fix Grammar") on *only* the selected headers or paragraphs at once.

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

---

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18+)
*   OpenRouter API Key (for AI features)
*   (Optional) Perplexity API Key (for Fact Checking)

### Installation
1.  Clone the repo.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Set up environment:
    ```bash
    cp .env.example .env
    # Add your OPENROUTER_API_KEY to .env
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

## 🛠️ Terminology
To avoid confusion during development:
*   **Original (Left)**: The immutable baseline text you are comparing against.
*   **Preview (Right)**: The live, editable "Working Copy".
*   **Commit**: Moving the state of "Preview" into history and making it the new "Original".
*   **Diff Mode**: The primary view showing the comparison between Original and Preview.
*   **Prompt**: A saved instruction set for the AI (e.g., "Grammar Fix"). Can be **Local** (TypeScript logic) or **AI** (LLM prompt).
*   **Repository**: A folder containing multiple projects.
*   **Project**: A subfolder within a repository, containing `draft.txt` and `.commits/`.

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

