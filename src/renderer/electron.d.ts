
import { AILogEntry, AIPrompt, Project, RepositoryInfo, TextCommit, FolderOperationResult } from './types';

export interface IElectronAPI {
    platform: string;
    resourcesPath: string;

    // API Key management
    setApiKey: (provider: string, apiKey: string) => Promise<void>;
    getApiKeyConfigured: (provider: string) => Promise<boolean>;

    // AI Usage Logging
    logUsage: (logEntry: AILogEntry) => Promise<boolean>;
    updateLogRating: (id: string, rating: number, feedback?: string) => Promise<boolean>;
    getLogs: () => Promise<AILogEntry[]>;
    clearLogs: () => Promise<boolean>;

    // AI Prompts CRUD
    getPrompts: () => Promise<AIPrompt[]>;
    savePrompts: (prompts: AIPrompt[]) => Promise<boolean>;

    // File Operations
    saveFile: (content: string, defaultName?: string, format?: 'md' | 'html' | 'txt') => Promise<string | null>;
    exportVersions: (versions: TextCommit[]) => Promise<string | null>;
    saveImage: (base64Data: string, defaultName: string) => Promise<string | null>;

    // Repository & Project System
    openRepository: () => Promise<{ path: string; projects: Project[] } | null>;
    createRepository: () => Promise<{ path: string; projects: Project[] } | null>;
    listRepositories: () => Promise<RepositoryInfo[]>;
    renameRepository: (repoPath: string, newName: string) => Promise<RepositoryInfo | null>;
    deleteRepository: (repoPath: string) => Promise<boolean>;
    createProject: (repoPath: string, name: string, content?: string) => Promise<Project | null>;
    saveProjectContent: (path: string, content: string) => Promise<boolean>;
    loadProjectContent: (path: string) => Promise<string>;
    loadProjectCommits: (path: string) => Promise<TextCommit[]>;
    saveProjectCommits: (path: string, commits: TextCommit[]) => Promise<boolean>;
    deleteProject: (projectPath: string) => Promise<boolean>;
    saveProjectBundle: (projectPath: string) => Promise<string | null>;
    renameProject: (projectPath: string, newName: string) => Promise<Project | null>;
    moveProjectToRepository: (projectPath: string, targetRepoPath: string) => Promise<Project | null>;
    loadGraphData: (repoPath: string) => Promise<{
        nodes: Array<{ id: string; x: number; y: number }>;
        edges: Array<{ from: string; to: string }>;
    }>;
    saveGraphData: (
        repoPath: string,
        data: {
            nodes: Array<{ id: string; x: number; y: number }>;
            edges: Array<{ from: string; to: string }>;
        }
    ) => Promise<boolean>;

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
     */
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
        chatCompletions: (payload: {
            model: string;
            messages: Array<{ role: string; content: unknown }>;
            temperature?: number;
            response_format?: unknown;
            generation_config?: unknown;
            plugins?: Array<{ id: string;[key: string]: unknown }>;
        }) => Promise<unknown>;
        chatCompletionsStart?: (requestId: string, payload: {
            model: string;
            messages: Array<{ role: string; content: unknown }>;
            temperature?: number;
            response_format?: unknown;
            generation_config?: unknown;
            plugins?: Array<{ id: string;[key: string]: unknown }>;
        }) => Promise<unknown>;
        chatCompletionsCancel?: (requestId: string) => Promise<boolean>;
    };

    // Menu event listeners
    onFileOpened: (callback: (content: string, path: string) => void) => () => void;
    onRequestSave: (callback: (format: 'md' | 'html' | 'txt') => void) => () => void;
    onRequestExportVersions: (callback: () => void) => () => void;
    onVersionsImported: (callback: (versions: TextCommit[]) => void) => () => void;
    onMenuUndo: (callback: () => void) => () => void;
    onMenuRedo: (callback: () => void) => () => void;
    onMenuClearAll: (callback: () => void) => () => void;
    onMenuToggleDark: (callback: () => void) => () => void;
    onMenuFontSize: (callback: (size: string) => void) => () => void;
    onMenuFontFamily: (callback: (family: string) => void) => () => void;
    onMenuShowHelp: (callback: () => void) => () => void;
    onMenuShowLogs: (callback: () => void) => () => void;
    onMenuShowVersions: (callback: () => void) => () => void;
    onMenuNewProject: (callback: () => void) => () => void;
    onMenuCreateRepository: (callback: () => void) => () => void;
    onMenuOpenRepository: (callback: () => void) => () => void;
    onMenuSaveProject: (callback: () => void) => () => void;
    onMenuExportProjectBundle: (callback: () => void) => () => void;
    onRequestSaveBeforeClose: (callback: (requestId: string) => void) => () => void;
    onDiscardDraftBeforeClose: (callback: () => void) => () => void;
    setWindowDirtyState: (hasUnsavedChanges: boolean) => Promise<boolean>;
    respondSaveBeforeClose: (requestId: string, success: boolean) => Promise<boolean>;

    // Tools Menu Listeners
    onMenuToolsSpellingLocal: (callback: () => void) => () => void;
    onMenuToolsSpellingAI: (callback: () => void) => () => void;
    onMenuToolsGrammar: (callback: () => void) => () => void;
    onMenuToolsPolish: (callback: () => void) => () => void;
    onMenuToolsFactCheck: (callback: () => void) => () => void;
    onMenuToolsPrompts: (callback: () => void) => () => void;
    onMenuToolsProjects: (callback: () => void) => () => void;
    onMenuToolsModels: (callback: () => void) => () => void;
    onMenuToolsSettings?: (callback: () => void) => () => void;

    // Folder & Workspace Paths
    getWorkspacePath: () => Promise<string>;
    getReposPath: () => Promise<string>;
    setCustomWorkspace: (customPath: string) => Promise<FolderOperationResult>;
    createFolderAtPath: (folderPath: string) => Promise<FolderOperationResult>;
    loadRepositoryAtPath: (repoPath: string) => Promise<{ path: string; projects: Project[] } | null>;
}

declare global {
    interface Window {
        electron: IElectronAPI;
    }
}
