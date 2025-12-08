const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
contextBridge.exposeInMainWorld('electron', {
    platform: process.platform,
    getApiKey: (provider) => ipcRenderer.invoke('get-api-key', provider),
    setApiKey: (provider, apiKey) => ipcRenderer.invoke('set-api-key', provider, apiKey),
    logUsage: (logEntry) => ipcRenderer.invoke('log-usage', logEntry),
    updateLogRating: (id, rating, feedback) => ipcRenderer.invoke('update-log-rating', id, rating, feedback)
});