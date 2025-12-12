const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
contextBridge.exposeInMainWorld('electron', {
    platform: process.platform,

    // API Key management
    getApiKey: (provider) => ipcRenderer.invoke('get-api-key', provider),
    setApiKey: (provider, apiKey) => ipcRenderer.invoke('set-api-key', provider, apiKey),

    // AI Usage Logging
    logUsage: (logEntry) => ipcRenderer.invoke('log-usage', logEntry),
    updateLogRating: (id, rating, feedback) => ipcRenderer.invoke('update-log-rating', id, rating, feedback),
    getLogs: () => ipcRenderer.invoke('get-logs'),
    clearLogs: () => ipcRenderer.invoke('clear-logs'),

    // Version History
    getVersions: () => ipcRenderer.invoke('get-versions'),
    saveVersions: (versions) => ipcRenderer.invoke('save-versions', versions),
    clearVersions: () => ipcRenderer.invoke('clear-versions'),

    // File Operations
    saveFile: (content, defaultName) => ipcRenderer.invoke('save-file', content, defaultName),
    exportVersions: (versions) => ipcRenderer.invoke('export-versions', versions),

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

    // Cleanup listeners (optional, for component unmount)
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});