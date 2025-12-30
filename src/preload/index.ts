const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
contextBridge.exposeInMainWorld('electron', {
    platform: process.platform,
    resourcesPath: process.resourcesPath,

    // API Key management
    getApiKey: (provider) => ipcRenderer.invoke('get-api-key', provider),
    setApiKey: (provider, apiKey) => ipcRenderer.invoke('set-api-key', provider, apiKey),

    // AI Usage Logging
    logUsage: (logEntry) => ipcRenderer.invoke('log-usage', logEntry),
    updateLogRating: (id, rating, feedback) => ipcRenderer.invoke('update-log-rating', id, rating, feedback),
    getLogs: () => ipcRenderer.invoke('get-logs'),
    clearLogs: () => ipcRenderer.invoke('clear-logs'),

    // Commit History
    getVersions: () => ipcRenderer.invoke('get-versions'),
    saveVersions: (commits) => ipcRenderer.invoke('save-versions', commits),
    clearVersions: () => ipcRenderer.invoke('clear-versions'),

    // File Operations
    saveFile: (content, defaultName) => ipcRenderer.invoke('save-file', content, defaultName),
    exportVersions: (commits) => ipcRenderer.invoke('export-versions', commits),

    // Repository & Project System
    openRepository: () => ipcRenderer.invoke('open-repository'),
    createRepository: () => ipcRenderer.invoke('create-repository'),
    createProject: (repoPath, name, content) => ipcRenderer.invoke('create-project', repoPath, name, content),
    saveProjectContent: (path, content) => ipcRenderer.invoke('save-project-content', path, content),
    loadProjectContent: (path) => ipcRenderer.invoke('load-project-content', path),
    loadProjectCommits: (path) => ipcRenderer.invoke('load-project-commits', path),
    saveProjectCommits: (path, commits) => ipcRenderer.invoke('save-project-commits', path, commits),
    saveProjectBundle: (projectPath) => ipcRenderer.invoke('save-project-bundle', projectPath),

    // Hierarchy Enforcement System
    hierarchy: {
        getNodeType: (dirPath) => ipcRenderer.invoke('hierarchy-get-node-type', dirPath),
        validateCreate: (parentPath, name, childType) => ipcRenderer.invoke('hierarchy-validate-create', parentPath, name, childType),
        createNode: (parentPath, name, nodeType) => ipcRenderer.invoke('hierarchy-create-node', parentPath, name, nodeType),
        getInfo: (dirPath) => ipcRenderer.invoke('hierarchy-get-info', dirPath),
    },

    // AI Prompts CRUD
    getPrompts: () => ipcRenderer.invoke('get-prompts'),
    savePrompts: (prompts) => ipcRenderer.invoke('save-prompts', prompts),

    // Menu event listeners (from main process)
    onFileOpened: (callback) => ipcRenderer.on('file-opened', (event, content, path) => callback(content, path)),
    onRequestSave: (callback) => ipcRenderer.on('request-save', () => callback()),
    onRequestExportVersions: (callback) => ipcRenderer.on('request-export-versions', () => callback()),
    onVersionsImported: (callback) => ipcRenderer.on('versions-imported', (event, versions) => callback(versions)),
    onMenuUndo: (callback) => ipcRenderer.on('menu-undo', () => callback()),
    onMenuRedo: (callback) => ipcRenderer.on('menu-redo', () => callback()),
    onMenuClearAll: (callback) => ipcRenderer.on('menu-clear-all', () => callback()),
    onMenuToggleDark: (callback) => ipcRenderer.on('menu-toggle-dark', () => callback()),
    onMenuFontSize: (callback) => ipcRenderer.on('menu-font-size', (event, size) => callback(size)),
    onMenuFontFamily: (callback) => ipcRenderer.on('menu-font-family', (event, family) => callback(family)),
    onMenuShowHelp: (callback) => ipcRenderer.on('menu-show-help', () => callback()),
    onMenuShowLogs: (callback) => ipcRenderer.on('menu-show-logs', () => callback()),
    onMenuShowVersions: (callback) => ipcRenderer.on('menu-show-versions', () => callback()),
    onMenuNewProject: (callback) => ipcRenderer.on('menu-new-project', () => callback()),
    onMenuCreateRepository: (callback) => ipcRenderer.on('menu-create-repository', () => callback()),
    onMenuOpenRepository: (callback) => ipcRenderer.on('menu-open-repository', () => callback()),
    onMenuSaveProject: (callback) => ipcRenderer.on('menu-save-project', () => callback()),

    // Tools Menu Listeners
    onMenuToolsSpellingLocal: (callback) => ipcRenderer.on('menu-tools-spelling-local', () => callback()),
    onMenuToolsSpellingAI: (callback) => ipcRenderer.on('menu-tools-spelling-ai', () => callback()),
    onMenuToolsGrammar: (callback) => ipcRenderer.on('menu-tools-grammar', () => callback()),
    onMenuToolsPolish: (callback) => ipcRenderer.on('menu-tools-polish', () => callback()),
    onMenuToolsFactCheck: (callback) => ipcRenderer.on('menu-tools-factcheck', () => callback()),
    onMenuToolsPrompts: (callback) => ipcRenderer.on('menu-tools-prompts', () => callback()),
    onMenuToolsProjects: (callback) => ipcRenderer.on('menu-tools-projects', () => callback()),

    // Cleanup listeners (optional, for component unmount)
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});