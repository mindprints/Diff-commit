
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
    removeAllListeners: (channel: string) => void;
}

declare global {
    interface Window {
        electron: IElectronAPI;
    }
}
