
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

    // OpenRouter API (secure - key stays in main process)
    openRouter: {
        fetchModels: () => Promise<Array<{
            id: string;
            name: string;
            provider: string;
            contextWindow: number;
            inputPrice: number;
            outputPrice: number;
            modality?: string;
            description?: string;
        }>>;
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
    removeAllListeners: (channel: string) => void;
}

declare global {
    interface Window {
        electron: IElectronAPI;
    }
}
