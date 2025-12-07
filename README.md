# Diff & Commit AI

Diff & Commit AI is a modern, interactive web application designed to streamline the process of comparing, reviewing, and refining text versions. Unlike traditional diff tools which are often static or developer-focused, this tool provides a rich, user-friendly interface for content creators, editors, and prompt engineers to intelligently merge text.

## Key Features

### 🔍 Interactive Difference Engine
-   **Smart Diffing**: Highlights additions (Green), removals (Red), and modifications.
-   **Interactive Merging**: Click any highlighted segment to toggle its state.
    -   *Reject* an addition to remove it.
    -   *Restore* a deletion to keep the original text.
-   **Smart Swapping**: Automatically links replaced text (e.g., changing "cat" to "dog") so clicking one instantly toggles the other, preventing logical errors.
-   **Undo/Redo History**: Full state management allows you to safely roll back changes.

### 🤖 AI-Powered Enhancements
-   **AI Summary**: Generates a concise changelog of differences between versions using Gemini 2.5 Flash.
-   **AI Polish**: Smooths out your final text with three distinct modes:
    -   **Spelling Only**: Fixes typos without altering style.
    -   **Grammar Fix**: Corrects syntax and punctuation while preserving tone.
    -   **Full Polish**: Improves flow, clarity, and vocabulary.
-   **Prompt Expansion**: A specialized mode for prompt engineers. It takes a brief intent (e.g., "image of a cyberpunk city") and expands it into a highly detailed, optimized instruction set for coding or generative media tasks.

### 📝 Committed Preview & Editing
-   **Real-time Preview**: See exactly what the final text looks like as you toggle differences.
-   **Manual Editing**: The preview pane is fully editable, allowing for final manual tweaks before copying.
-   **Text-to-Speech**: Built-in "Read Aloud" functionality to audit the rhythm and flow of your text. Select a specific section to read only that part.

### 🎨 Customization & Accessibility
-   **Dark Mode**: Fully supported high-contrast dark theme.
-   **Typography Controls**: Switch between Sans, Serif, and Monospace fonts, and adjust font sizes (S, M, L, XL) to suit your reading preference.
-   **Resizable Split Pane**: Drag the divider to adjust the ratio between the Diff View and the Preview.

## Tech Stack

-   **Frontend**: React 19, TypeScript
-   **Styling**: Tailwind CSS (with `clsx` for dynamic classes)
-   **Icons**: Lucide React
-   **Diff Engine**: `diff` library (Words mode)
-   **AI Integration**: Google Gemini API (`@google/genai`)
-   **Build Tool**: Vite (implied by environment)

## Getting Started

### Prerequisites
-   Node.js installed.
-   A Google Gemini API Key.

### Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Set up your environment variables. Create a `.env` file in the root:
    ```env
    API_KEY=your_google_gemini_api_key
    ```
4.  Run the development server:
    ```bash
    npm run dev
    ```

## Usage Workflow

1.  **Input**: Paste your *Original* text on the left and *Revised* text on the right. Use the arrow button to copy Original to Revised if needed.
2.  **Compare**: Click "Compare Versions" to generate the diff.
3.  **Review**:
    -   The Left Panel shows the **Interactive Diff**. Click green/red text to accept or reject changes.
    -   The Right Panel shows the **Committed Preview**. This is the final result.
4.  **Refine**:
    -   Use the **AI Edit** dropdown to polish grammar or expand prompts.
    -   Use the **Read Aloud** button to listen to the text.
5.  **Export**: Click **Copy** to save the final result to your clipboard.

## License

MIT
