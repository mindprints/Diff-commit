import { contextBridge, ipcRenderer } from 'electron';
import type { AILogEntry, AIPrompt, Project, RepositoryInfo, TextCommit } from '../renderer/types';
import { subscribeIpcChannel } from './ipcSubscription';

// Type definitions for the hierarchy sub-API
interface HierarchyAPI {
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
}

// Type definitions for the OpenRouter sub-API
interface OpenRouterAPI {
    fetchModels: () => Promise<Array<{
        id: string;
        name: string;
        provider: string;
        contextWindow: number;
        inputPrice: number;
        outputPrice: number;
        modality?: string;
        description?: string;
        supportedParams?: string[];
        capabilities?: string[];
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
    chatCompletionsStart: (requestId: string, payload: {
        model: string;
        messages: Array<{ role: string; content: unknown }>;
        temperature?: number;
        response_format?: unknown;
        generation_config?: unknown;
        plugins?: Array<{ id: string;[key: string]: unknown }>;
    }) => Promise<unknown>;
    chatCompletionsCancel: (requestId: string) => Promise<boolean>;
}

// Type definitions for the Artificial Analysis sub-API
interface ArtificialAnalysisAPI {
    fetchBenchmarks: () => Promise<Array<{
        model_name?: string;
        creator?: string;
        intelligence_index?: number;
        coding_index?: number;
        math_index?: number;
        output_speed?: number;
        latency?: number;
        price_input?: number;
        price_output?: number;
    }>>;
}

// Full ElectronAPI interface
export interface ElectronAPI {
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

    // Commit History
    getVersions: () => Promise<TextCommit[]>;
    saveVersions: (commits: TextCommit[]) => Promise<boolean>;
    clearVersions: () => Promise<boolean>;

    // File Operations
    saveFile: (content: string, defaultName?: string, format?: 'md' | 'html' | 'txt') => Promise<string | null>;
    exportVersions: (commits: TextCommit[]) => Promise<string | null>;
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
    saveProjectBundle: (projectPath: string) => Promise<string | null>;
    renameProject: (projectPath: string, newName: string) => Promise<Project | null>;
    deleteProject: (projectPath: string) => Promise<boolean>;
    loadGraphData: (repoPath: string) => Promise<{ nodes: Array<{ id: string; x: number; y: number }>; edges: Array<{ from: string; to: string }> }>;
    saveGraphData: (repoPath: string, data: { nodes: Array<{ id: string; x: number; y: number }>; edges: Array<{ from: string; to: string }> }) => Promise<boolean>;

    // Hierarchy Enforcement System
    hierarchy: HierarchyAPI;

    // OpenRouter API (secure - key stays in main process)
    openRouter: OpenRouterAPI;

    // Artificial Analysis API (secure - key stays in main process)
    artificialAnalysis: ArtificialAnalysisAPI;

    // AI Prompts CRUD
    getPrompts: () => Promise<AIPrompt[]>;
    savePrompts: (prompts: AIPrompt[]) => Promise<boolean>;

    // Menu event listeners (from main process)
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

    // Tools Menu Listeners
    onMenuToolsSpellingLocal: (callback: () => void) => () => void;
    onMenuToolsSpellingAI: (callback: () => void) => () => void;
    onMenuToolsGrammar: (callback: () => void) => () => void;
    onMenuToolsPolish: (callback: () => void) => () => void;
    onMenuToolsFactCheck: (callback: () => void) => () => void;
    onMenuToolsPrompts: (callback: () => void) => () => void;
    onMenuToolsProjects: (callback: () => void) => () => void;
    onMenuToolsModels: (callback: () => void) => () => void;
    onMenuToolsSettings: (callback: () => void) => () => void;

    // Folder & Workspace Paths
    getWorkspacePath: () => Promise<string>;
    getReposPath: () => Promise<string>;
    setCustomWorkspace: (customPath: string) => Promise<{ success: boolean; paths: string[]; error?: string }>;
    createFolderAtPath: (folderPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    loadRepositoryAtPath: (repoPath: string) => Promise<{ path: string; projects: Project[] } | null>;

}

// Declare global Window interface augmentation
declare global {
    interface Window {
        electron: ElectronAPI;
    }
}

// Build the typed API object
const electronAPI: ElectronAPI = {
    platform: process.platform,
    resourcesPath: process.resourcesPath,

    // API Key management
    setApiKey: (provider: string, apiKey: string) => ipcRenderer.invoke('set-api-key', provider, apiKey),
    getApiKeyConfigured: (provider: string) => ipcRenderer.invoke('get-api-key-configured', provider),

    // AI Usage Logging
    logUsage: (logEntry: AILogEntry) => ipcRenderer.invoke('log-usage', logEntry),
    updateLogRating: (id: string, rating: number, feedback?: string) => ipcRenderer.invoke('update-log-rating', id, rating, feedback),
    getLogs: () => ipcRenderer.invoke('get-logs'),
    clearLogs: () => ipcRenderer.invoke('clear-logs'),

    // Commit History
    getVersions: () => ipcRenderer.invoke('get-versions'),
    saveVersions: (commits: TextCommit[]) => ipcRenderer.invoke('save-versions', commits),
    clearVersions: () => ipcRenderer.invoke('clear-versions'),

    // File Operations
    saveFile: (content: string, defaultName?: string, format?: 'md' | 'html' | 'txt') => ipcRenderer.invoke('save-file', content, defaultName, format ?? 'md'),
    exportVersions: (commits: TextCommit[]) => ipcRenderer.invoke('export-versions', commits),
    saveImage: (base64Data: string, defaultName: string) => ipcRenderer.invoke('save-image', base64Data, defaultName),

    // Repository & Project System
    openRepository: () => ipcRenderer.invoke('open-repository'),
    createRepository: () => ipcRenderer.invoke('create-repository'),
    listRepositories: () => ipcRenderer.invoke('list-repositories'),
    renameRepository: (repoPath: string, newName: string) => ipcRenderer.invoke('rename-repository', repoPath, newName),
    deleteRepository: (repoPath: string) => ipcRenderer.invoke('delete-repository', repoPath),
    createProject: (repoPath: string, name: string, content?: string) => ipcRenderer.invoke('create-project', repoPath, name, content),
    saveProjectContent: (path: string, content: string) => ipcRenderer.invoke('save-project-content', path, content),
    loadProjectContent: (path: string) => ipcRenderer.invoke('load-project-content', path),
    loadProjectCommits: (path: string) => ipcRenderer.invoke('load-project-commits', path),
    saveProjectCommits: (path: string, commits: TextCommit[]) => ipcRenderer.invoke('save-project-commits', path, commits),
    saveProjectBundle: (projectPath: string) => ipcRenderer.invoke('save-project-bundle', projectPath),
    renameProject: (projectPath: string, newName: string) => ipcRenderer.invoke('rename-project', projectPath, newName),
    deleteProject: (projectPath: string) => ipcRenderer.invoke('delete-project', projectPath),
    loadGraphData: (repoPath: string) => ipcRenderer.invoke('graph:load', repoPath),
    saveGraphData: (repoPath: string, data) => ipcRenderer.invoke('graph:save', repoPath, data),

    // Hierarchy Enforcement System
    hierarchy: {
        getNodeType: (dirPath: string) => ipcRenderer.invoke('hierarchy-get-node-type', dirPath),
        validateCreate: (parentPath: string, name: string, childType: string) => ipcRenderer.invoke('hierarchy-validate-create', parentPath, name, childType),
        createNode: (parentPath: string, name: string, nodeType: string) => ipcRenderer.invoke('hierarchy-create-node', parentPath, name, nodeType),
        getInfo: (dirPath: string) => ipcRenderer.invoke('hierarchy-get-info', dirPath),
    },

    // AI Prompts CRUD
    getPrompts: () => ipcRenderer.invoke('get-prompts'),
    savePrompts: (prompts: AIPrompt[]) => ipcRenderer.invoke('save-prompts', prompts),

    // OpenRouter API (secure - key stays in main process)
    openRouter: {
        fetchModels: () => ipcRenderer.invoke('openrouter:fetch-models'),
        fetchPricing: (modelId: string) => ipcRenderer.invoke('openrouter:fetch-pricing', modelId),
        chatCompletions: (payload) => ipcRenderer.invoke('openrouter:chat-completions', payload),
        chatCompletionsStart: (requestId, payload) => ipcRenderer.invoke('openrouter:chat-completions-start', requestId, payload),
        chatCompletionsCancel: (requestId) => ipcRenderer.invoke('openrouter:chat-completions-cancel', requestId),
    },

    // Artificial Analysis API (secure - key stays in main process)
    artificialAnalysis: {
        fetchBenchmarks: () => ipcRenderer.invoke('artificialanalysis:fetch-benchmarks'),
    },

    // Menu event listeners (from main process)
    onFileOpened: (callback: (content: string, path: string) => void) => {
        return subscribeIpcChannel(ipcRenderer, 'file-opened', callback);
    },
    onRequestSave: (callback: (format: 'md' | 'html' | 'txt') => void) => {
        return subscribeIpcChannel(ipcRenderer, 'request-save', callback);
    },
    onRequestExportVersions: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'request-export-versions', callback);
    },
    onVersionsImported: (callback: (versions: TextCommit[]) => void) => {
        return subscribeIpcChannel(ipcRenderer, 'versions-imported', callback);
    },
    onMenuUndo: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-undo', callback);
    },
    onMenuRedo: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-redo', callback);
    },
    onMenuClearAll: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-clear-all', callback);
    },
    onMenuToggleDark: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-toggle-dark', callback);
    },
    onMenuFontSize: (callback: (size: string) => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-font-size', callback);
    },
    onMenuFontFamily: (callback: (family: string) => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-font-family', callback);
    },
    onMenuShowHelp: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-show-help', callback);
    },
    onMenuShowLogs: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-show-logs', callback);
    },
    onMenuShowVersions: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-show-versions', callback);
    },
    onMenuNewProject: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-new-project', callback);
    },
    onMenuCreateRepository: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-create-repository', callback);
    },
    onMenuOpenRepository: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-open-repository', callback);
    },
    onMenuSaveProject: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-save-project', callback);
    },

    // Tools Menu Listeners
    onMenuToolsSpellingLocal: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-tools-spelling-local', callback);
    },
    onMenuToolsSpellingAI: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-tools-spelling-ai', callback);
    },
    onMenuToolsGrammar: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-tools-grammar', callback);
    },
    onMenuToolsPolish: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-tools-polish', callback);
    },
    onMenuToolsFactCheck: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-tools-factcheck', callback);
    },
    onMenuToolsPrompts: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-tools-prompts', callback);
    },
    onMenuToolsProjects: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-tools-projects', callback);
    },
    onMenuToolsModels: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-tools-models', callback);
    },
    onMenuToolsSettings: (callback: () => void) => {
        return subscribeIpcChannel(ipcRenderer, 'menu-tools-settings', callback);
    },

    // Folder & Workspace Paths
    getWorkspacePath: () => ipcRenderer.invoke('get-workspace-path'),
    getReposPath: () => ipcRenderer.invoke('get-repos-path'),
    setCustomWorkspace: (customPath: string) => ipcRenderer.invoke('set-custom-workspace', customPath),
    createFolderAtPath: (folderPath: string) => ipcRenderer.invoke('create-folder-at-path', folderPath),
    loadRepositoryAtPath: (repoPath: string) => ipcRenderer.invoke('load-repository-at-path', repoPath),
};

// Expose to renderer
contextBridge.exposeInMainWorld('electron', electronAPI);
