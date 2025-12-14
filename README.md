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
*   **Offline Storage**: All history and settings are saved locally on your machine.

### 🖱️ Advanced Selection (Ctrl+Drag)
*   **Multi-Selection**: Hold `Ctrl` to select multiple, non-contiguous pieces of text.
*   **Batch Processing**: Run AI operations (like "Fix Grammar") on *only* the selected headers or paragraphs at once.

---

## 📂 Project Structure

```text
Diff-commit/
├── .agent/                 # Agent workflows & syntax reference
├── components/             # React UI Components
│   ├── CommitHistoryModal  # Version control UI
│   ├── DiffSegment         # The visual diff blocks
│   ├── LogsModal           # AI usage & cost tracking
│   ├── MultiSelectTextArea # Core editor with selection overlay
│   ├── ProjectsPanel       # File/Project management
│   ├── PromptsModal        # Prompt CRUD manager
│   └── ...
├── constants/
│   ├── models.ts           # AI Model definitions & pricing
│   └── prompts.ts          # Built-in prompt definitions
├── electron/               # Electron Main Process
│   ├── main.js             # Window management & IPC
│   └── preload.js          # Secure bridge
├── hooks/                  # Custom React Hooks
│   ├── useDiffState.ts     # Core diffing logic
│   ├── useElectronMenu.ts  # Native menu integration
│   ├── useMultiSelection.ts# Discontinuous selection logic
│   ├── usePrompts.ts       # Prompt management logic
│   └── ...
├── public/
│   └── dictionaries/       # Hunspell (.aff/.dic) files for local checking
├── services/               # Logic & External APIs
│   ├── ai.ts               # OpenRouter API Service
│   ├── factChecker.ts      # Perplexity Fact-Check Service
│   ├── spellChecker.ts     # Local Typo.js Service
│   └── promptStorage.ts    # JSON-based persistence
├── App.tsx                 # Main Application Layout
├── types.ts                # TypeScript Interfaces
└── README.md               # This file
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
*   **Web Mode** (Fastest for UI dev):
    ```bash
    npm run dev
    ```
*   **Desktop Mode** (Full feature set):
    ```bash
    npm run electron:dev
    ```

### Building for Production
Create a Windows installer (`.exe`):
```bash
npm run electron:build:win
```
*Builds are output to the `release/` directory.*

---

## 🛠️ Terminology
To avoid confusion during development:
*   **Original (Left)**: The immutable baseline text you are comparing against.
*   **Preview (Right)**: The live, editable "Working Copy".
*   **Commit**: Moving the state of "Preview" into history and making it the new "Original".
*   **Diff Mode**: The primary view showing the comparison between Original and Preview.
*   **Prompt**: A saved instruction set for the AI (e.g., "Grammar Fix"). can be **Local** (Typescript logic) or **AI** (LLM prompt).
