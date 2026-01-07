
import { AILogEntry, AIPrompt, Project, TextCommit } from './types';

export interface IElectronAPI {
    platform: string;

    // API Key management
    getApiKey: (provider: string) => Promise<string>;
    setApiKey: (provider: string, apiKey: string) => Promise<void>;

    // AI Usage Logging
    logUsage: (logEntry: AILogEntry) => Promise<boolean>;
    updateLogRating: (id: string, rating: number, feedback?: string) => Promise<boolean>;
    getLogs: () => Promise<AILogEntry[]>;
    clearLogs: () => Promise<boolean>;

    // Commit History
    getVersions: () => Promise<TextCommit[]>;
    saveVersions: (versions: TextCommit[]) => Promise<boolean>;
    clearVersions: () => Promise<boolean>;

    // AI Prompts CRUD
    getPrompts?: () => Promise<AIPrompt[]>;
    savePrompts?: (prompts: AIPrompt[]) => Promise<boolean>;

    // Projects (future Electron filesystem support)
    getProjects?: () => Promise<Project[]>;
    saveProject?: (project: Project) => Promise<boolean>;
    deleteProject?: (id: string) => Promise<boolean>;

    // File Operations
    saveFile: (content: string, defaultName?: string) => Promise<string | null>;
    exportVersions: (versions: TextCommit[]) => Promise<string | null>;

    /**
     * Save a base64-encoded image to disk via save dialog
     * @param base64Data - The image data (data URL or raw base64)
     * @param defaultName - Default filename for the save dialog
     * @returns The saved file path, or null if cancelled
     */
    saveImage: (base64Data: string, defaultName: string) => Promise<string | null>;

    // Repository & Project System
    openRepository: () => Promise<{ path: string; projects: Project[] } | null>;
    createRepository: () => Promise<{ path: string; projects: Project[] } | null>;
    createProject: (repoPath: string, name: string, content?: string) => Promise<Project | null>;
    saveProjectContent: (path: string, content: string) => Promise<boolean>;
    loadProjectContent: (path: string) => Promise<string>;
    loadProjectCommits: (path: string) => Promise<TextCommit[]>;
    saveProjectCommits: (path: string, commits: TextCommit[]) => Promise<boolean>;
    saveProjectBundle: (projectPath: string) => Promise<string | null>;
    renameProject: (projectPath: string, newName: string) => Promise<{
        id: string;
        name: string;
        content: string;
        createdAt: number;
        updatedAt: number;
        path: string;
        repositoryPath: string;
    } | null>;

    // Hierarchy Enforcement System
    hierarchy: {
        getNodeType: (dirPath: string) => Promise<'root' | 'repository' | 'project'>;
        validateCreate: (parentPath: string, name: string, childType: string) => Promise<{ valid: boolean; error?: string }>;
        createNode: (parentPath: string, name: string, nodeType: string) => Promise<{ path: string; type: string; name: string; createdAt: number }>;
        getInfo: (dirPath: string) => Promise<{
            path: string;
            type: 'root' | 'repository' | 'project';
            name: string;
            allowedChildTypes: string[];
            parentPath: string | null;
        } | null>;
    };

    /**
     * OpenRouter API (secure - key stays in main process)
     * 
     * @remarks
     * **Pricing Precision Note**: The `inputPrice` and `outputPrice` fields use JavaScript's
     * `number` type. While acceptable for display and comparison, be aware that IEEE 754
     * double-precision floats can introduce rounding errors in financial calculations.
     * 
     * OpenRouter returns pricing as strings (e.g., "0.0000015"), which we convert to numbers
     * after multiplying by 1,000,000 for USD per 1M tokens. For precise cost calculations,
     * consider using a decimal library or converting to integer micro-cents.
     * 
     * **Error Cases**: Promises may reject if:
     * - API key is not configured (OPENROUTER_API_KEY env var missing)
     * - Network timeout (30 second limit)
     * - OpenRouter API returns non-2xx status
     */
    openRouter: {
        /**
         * Fetch all available models from OpenRouter
         * @returns Array of model metadata with pricing
         */
        fetchModels: () => Promise<Array<{
            /** Unique model identifier (e.g., "anthropic/claude-3.5-sonnet") */
            id: string;
            /** Human-readable model name */
            name: string;
            /** Provider name (e.g., "Anthropic", "OpenAI") */
            provider: string;
            /** Maximum context window in tokens */
            contextWindow: number;
            /** Input price in USD per 1M tokens (converted from per-token rate) */
            inputPrice: number;
            /** Output price in USD per 1M tokens (converted from per-token rate) */
            outputPrice: number;
            /** Model modality (e.g., "text", "text+image") */
            modality?: string;
            /** Model description */
            description?: string;
        }>>;
        /**
         * Fetch current pricing for a specific model
         * @param modelId - The model ID to fetch pricing for
         * @returns Current input and output prices in USD per 1M tokens
         */
        fetchPricing: (modelId: string) => Promise<{ inputPrice: number; outputPrice: number }>;
    };

    // Menu event listeners
    onFileOpened: (callback: (content: string, path: string) => void) => void;
    onRequestSave: (callback: () => void) => void;
    onRequestExportVersions: (callback: () => void) => void;
    onVersionsImported: (callback: (versions: TextCommit[]) => void) => void;
    onMenuUndo: (callback: () => void) => void;
    onMenuRedo: (callback: () => void) => void;
    onMenuClearAll: (callback: () => void) => void;
    onMenuToggleDark: (callback: () => void) => void;
    onMenuFontSize: (callback: (size: string) => void) => void;
    onMenuFontFamily: (callback: (family: string) => void) => void;
    onMenuShowHelp: (callback: () => void) => void;
    onMenuShowLogs: (callback: () => void) => void;
    onMenuShowVersions: (callback: () => void) => void;
    onMenuNewProject: (callback: () => void) => void;
    onMenuCreateRepository: (callback: () => void) => void;
    onMenuOpenRepository: (callback: () => void) => void;
    onMenuSaveProject: (callback: () => void) => void;

    // Tools Menu Listeners
    onMenuToolsSpellingLocal: (callback: () => void) => void;
    onMenuToolsSpellingAI: (callback: () => void) => void;
    onMenuToolsGrammar: (callback: () => void) => void;
    onMenuToolsPolish: (callback: () => void) => void;
    onMenuToolsFactCheck: (callback: () => void) => void;
    onMenuToolsPrompts: (callback: () => void) => void;
    onMenuToolsProjects: (callback: () => void) => void;
    onMenuToolsModels: (callback: () => void) => void;
    onMenuToolsSettings?: (callback: () => void) => void;
    removeAllListeners: (channel: string) => void;
}

declare global {
    interface Window {
        electron: IElectronAPI;
    }
}
