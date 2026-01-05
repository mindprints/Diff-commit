import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { AILogEntry, AIPrompt, Project, TextCommit } from '../renderer/types';

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

// Full ElectronAPI interface
export interface ElectronAPI {
    platform: string;
    resourcesPath: string;

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
    saveVersions: (commits: TextCommit[]) => Promise<boolean>;
    clearVersions: () => Promise<boolean>;

    // File Operations
    saveFile: (content: string, defaultName?: string) => Promise<string | null>;
    exportVersions: (commits: TextCommit[]) => Promise<string | null>;

    // Repository & Project System
    openRepository: () => Promise<{ path: string; projects: Project[] } | null>;
    createRepository: () => Promise<{ path: string; projects: Project[] } | null>;
    createProject: (repoPath: string, name: string, content?: string) => Promise<Project | null>;
    saveProjectContent: (path: string, content: string) => Promise<boolean>;
    loadProjectContent: (path: string) => Promise<string>;
    loadProjectCommits: (path: string) => Promise<TextCommit[]>;
    saveProjectCommits: (path: string, commits: TextCommit[]) => Promise<boolean>;
    saveProjectBundle: (projectPath: string) => Promise<string | null>;
    renameProject: (projectPath: string, newName: string) => Promise<Project | null>;

    // Hierarchy Enforcement System
    hierarchy: HierarchyAPI;

    // AI Prompts CRUD
    getPrompts: () => Promise<AIPrompt[]>;
    savePrompts: (prompts: AIPrompt[]) => Promise<boolean>;

    // Menu event listeners (from main process)
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

    // Cleanup listeners
    removeAllListeners: (channel: string) => void;
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
    getApiKey: (provider: string) => ipcRenderer.invoke('get-api-key', provider),
    setApiKey: (provider: string, apiKey: string) => ipcRenderer.invoke('set-api-key', provider, apiKey),

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
    saveFile: (content: string, defaultName?: string) => ipcRenderer.invoke('save-file', content, defaultName),
    exportVersions: (commits: TextCommit[]) => ipcRenderer.invoke('export-versions', commits),

    // Repository & Project System
    openRepository: () => ipcRenderer.invoke('open-repository'),
    createRepository: () => ipcRenderer.invoke('create-repository'),
    createProject: (repoPath: string, name: string, content?: string) => ipcRenderer.invoke('create-project', repoPath, name, content),
    saveProjectContent: (path: string, content: string) => ipcRenderer.invoke('save-project-content', path, content),
    loadProjectContent: (path: string) => ipcRenderer.invoke('load-project-content', path),
    loadProjectCommits: (path: string) => ipcRenderer.invoke('load-project-commits', path),
    saveProjectCommits: (path: string, commits: TextCommit[]) => ipcRenderer.invoke('save-project-commits', path, commits),
    saveProjectBundle: (projectPath: string) => ipcRenderer.invoke('save-project-bundle', projectPath),
    renameProject: (projectPath: string, newName: string) => ipcRenderer.invoke('rename-project', projectPath, newName),

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

    // Menu event listeners (from main process)
    onFileOpened: (callback: (content: string, path: string) => void) =>
        ipcRenderer.on('file-opened', (_event: IpcRendererEvent, content: string, path: string) => callback(content, path)),
    onRequestSave: (callback: () => void) =>
        ipcRenderer.on('request-save', () => callback()),
    onRequestExportVersions: (callback: () => void) =>
        ipcRenderer.on('request-export-versions', () => callback()),
    onVersionsImported: (callback: (versions: TextCommit[]) => void) =>
        ipcRenderer.on('versions-imported', (_event: IpcRendererEvent, versions: TextCommit[]) => callback(versions)),
    onMenuUndo: (callback: () => void) =>
        ipcRenderer.on('menu-undo', () => callback()),
    onMenuRedo: (callback: () => void) =>
        ipcRenderer.on('menu-redo', () => callback()),
    onMenuClearAll: (callback: () => void) =>
        ipcRenderer.on('menu-clear-all', () => callback()),
    onMenuToggleDark: (callback: () => void) =>
        ipcRenderer.on('menu-toggle-dark', () => callback()),
    onMenuFontSize: (callback: (size: string) => void) =>
        ipcRenderer.on('menu-font-size', (_event: IpcRendererEvent, size: string) => callback(size)),
    onMenuFontFamily: (callback: (family: string) => void) =>
        ipcRenderer.on('menu-font-family', (_event: IpcRendererEvent, family: string) => callback(family)),
    onMenuShowHelp: (callback: () => void) =>
        ipcRenderer.on('menu-show-help', () => callback()),
    onMenuShowLogs: (callback: () => void) =>
        ipcRenderer.on('menu-show-logs', () => callback()),
    onMenuShowVersions: (callback: () => void) =>
        ipcRenderer.on('menu-show-versions', () => callback()),
    onMenuNewProject: (callback: () => void) =>
        ipcRenderer.on('menu-new-project', () => callback()),
    onMenuCreateRepository: (callback: () => void) =>
        ipcRenderer.on('menu-create-repository', () => callback()),
    onMenuOpenRepository: (callback: () => void) =>
        ipcRenderer.on('menu-open-repository', () => callback()),
    onMenuSaveProject: (callback: () => void) =>
        ipcRenderer.on('menu-save-project', () => callback()),

    // Tools Menu Listeners
    onMenuToolsSpellingLocal: (callback: () => void) =>
        ipcRenderer.on('menu-tools-spelling-local', () => callback()),
    onMenuToolsSpellingAI: (callback: () => void) =>
        ipcRenderer.on('menu-tools-spelling-ai', () => callback()),
    onMenuToolsGrammar: (callback: () => void) =>
        ipcRenderer.on('menu-tools-grammar', () => callback()),
    onMenuToolsPolish: (callback: () => void) =>
        ipcRenderer.on('menu-tools-polish', () => callback()),
    onMenuToolsFactCheck: (callback: () => void) =>
        ipcRenderer.on('menu-tools-factcheck', () => callback()),
    onMenuToolsPrompts: (callback: () => void) =>
        ipcRenderer.on('menu-tools-prompts', () => callback()),
    onMenuToolsProjects: (callback: () => void) =>
        ipcRenderer.on('menu-tools-projects', () => callback()),
    onMenuToolsModels: (callback: () => void) =>
        ipcRenderer.on('menu-tools-models', () => callback()),

    // Cleanup listeners
    removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel)
};

// Expose to renderer
contextBridge.exposeInMainWorld('electron', electronAPI);