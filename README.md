# Diff & Commit AI

Diff & Commit AI is a modern, interactive desktop application designed to streamline the process of comparing, reviewing, and refining text versions. Unlike traditional diff tools which are often static or developer-focused, this tool provides a rich, user-friendly interface for content creators, editors, and prompt engineers to intelligently merge text.

## Key Features

### 🔍 Interactive Difference Engine
-   **Smart Diffing**: Highlights additions (Green), removals (Red), and modifications.
-   **Interactive Merging**: Click any highlighted segment to toggle its state.
    -   *Reject* an addition to remove it.
    -   *Restore* a deletion to keep the original text.
-   **Smart Swapping**: Automatically links replaced text (e.g., changing "cat" to "dog") so clicking one instantly toggles the other, preventing logical errors.
-   **Undo/Redo History**: Full state management allows you to safely roll back changes.
-   **Clear Text Panels**: Individual and "Clear All" buttons to quickly reset input panels.

### 🤖 AI-Powered Enhancements
-   **Multi-Model Support**: Switch instantly between top-tier models like **DeepSeek v3.2**, **Claude Haiku 4.5**, **GPT-OSS 120B**, **Google Gemini 3 Pro**, and more via OpenRouter.
-   **Cost Tier Indicators**: Models display dollar sign indicators ($-$$$$) in the dropdown to help anticipate costs before selection.
-   **AI Summary**: Generates a concise changelog of differences between versions.
-   **AI Polish**: Smooths out your final text with distinct modes:
    -   **Spelling Only**: Fixes typos without altering style.
    -   **Grammar Fix**: Corrects syntax and punctuation while preserving tone.
    -   **Full Polish**: Improves flow, clarity, and vocabulary.
    -   **Prompt Expansion**: Expands brief logic into high-fidelity AI prompt instructions.
-   **Cancellable Operations**: Cancel any in-progress AI operation with a single click to avoid getting stuck.

### 📊 Cost Tracking & Quality Control
-   **Real-time Cost Estimation**: Tracks token usage per session and calculates exact costs based on the selected model's pricing.
-   **Performance Logging**: Automatically logs every AI request (Task, Model, Tokens, Cost) to local storage.
-   **User Rating System**: Built-in 5-star rating prompt appears after each AI operation, allowing you to score model performance and save feedback.
-   **Logs Viewer**: Access your complete AI usage history through the logs modal (📊 icon in header):
    -   View all requests with date, model, task type, tokens, cost, and rating.
    -   See aggregate statistics: total cost, token counts, and average rating.
    -   Export logs to CSV for analysis.
    -   Clear all logs to start fresh.

### 📝 Committed Preview & Editing
-   **Real-time Preview**: See exactly what the final text looks like as you toggle differences.
-   **Manual Editing**: The preview pane is fully editable, allowing for final manual tweaks before copying.
-   **Text-to-Speech**: Built-in "Read Aloud" functionality to audit the rhythm and flow of your text. Select a section to hear just that part.

### 🎨 Customization & Accessibility
-   **Dark Mode**: Fully supported high-contrast dark theme.
-   **Typography Controls**: Switch between Sans, Serif, and Monospace fonts, and adjust font sizes (S, M, L, XL).
-   **Resizable Split Pane**: Drag the divider to adjust the ratio between the Diff View and the Preview.
-   **Non-Intrusive Alerts**: Error messages and notifications appear as sleek, dismissible toasts.

## Architecture & Implementation

### 🚀 Desktop Application (Electron)
Built as a robust desktop application using **Electron** to ensure better system integration, offline capability, and secure local storage.

#### **Build Pipeline**
-   **Bundler**: Vite (configured with `base: './'` for relative path resolution).
-   **Electron Builder**: Packages the application as a standalone `.exe` for Windows.
-   **Scripts**:
    -   `npm run dev`: Runs the Vite development server (browser mode).
    -   `npm run electron:dev`: Runs React (Vite) and Electron concurrently for desktop development.
    -   `npm run electron:build:win`: Builds the production executable for Windows.

### 🔑 API Key Management & Security
To ensure security and user privacy, we implement a dual-storage strategy for API keys:

1.  **Development (.env)**:
    -   Use `OPENROUTER_API_KEY` in your `.env` file for development.
2.  **Production (Local Storage)**:
    -   We use `electron-store` to save user API keys and usage logs locally on their machine.
    -   **IPC Bridge**: Keys and logs are securely handled via `window.electron` methods, isolating the renderer from the file system.

### 🧠 Model Selection & Configuration
We support a curated list of high-performance models to give users flexibility between cost, speed, and intelligence.

-   **Model Registry**: Managed in `constants/models.ts`.
-   **Cost Tiers**: Each model displays a cost indicator:
    -   **$** = Budget (< $0.50/M tokens avg)
    -   **$$** = Standard ($0.50 - $2.00/M tokens avg)
    -   **$$$** = Premium ($2.00 - $5.00/M tokens avg)
    -   **$$$$** = Expensive (> $5.00/M tokens avg)
-   **Supported Providers** (via OpenRouter):
    -   **DeepSeek**: `deepseek-v3.2` - Excellent price/performance ratio.
    -   **Google**: `gemini-3-pro-preview` - Large context window (1M tokens).
    -   **Anthropic**: `claude-haiku-4.5` - Fast and accurate.
    -   **OpenAI**: `gpt-oss-120b` - Budget-friendly option.
    -   **Others**: Moonshot AI (Kimi K2), xAI (Grok 4.1), MiniMax M2, Z-AI (GLM 4.6), Amazon Nova 2.

## Tech Stack

-   **Frontend**: React 19, TypeScript
-   **Styling**: Tailwind CSS (with `clsx` for dynamic classes)
-   **Icons**: Lucide React
-   **Desktop Framework**: Electron, Electron Builder, Electron Store
-   **Diff Engine**: `diff` library (Words mode)
-   **AI Integration**: OpenRouter API (Centralized hub for all models)
-   **Build Tool**: Vite

## Getting Started

### Prerequisites
-   Node.js installed.
-   An **OpenRouter API Key** (get one at [openrouter.ai](https://openrouter.ai)).

### Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Set up your environment variables. Copy the example file:
    ```bash
    cp .env.example .env
    ```
    Add your `OPENROUTER_API_KEY`.

4.  **Run Development Mode (Browser)**:
    ```bash
    npm run dev
    ```
    Open [http://localhost:5173](http://localhost:5173) in your browser.

5.  **Run Development Mode (Electron)**:
    ```bash
    npm run electron:dev
    ```
    This launches the standalone Electron window with hot reload.

6.  **Build for Windows**:
    ```bash
    npm run electron:build:win
    ```
    Output will be in the `release/` directory.

## License

MIT
