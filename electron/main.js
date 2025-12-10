import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import dotenv from 'dotenv';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const isDev = process.env.NODE_ENV === 'development';
const store = new Store();

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, '../public/icon.png')
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

// Send command to renderer
function sendToRenderer(channel, ...args) {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send(channel, ...args);
    }
}

// Create custom application menu
function createMenu() {
    const isMac = process.platform === 'darwin';

    const template = [
        // App menu (macOS only)
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }] : []),

        // File menu
        {
            label: 'File',
            submenu: [
                {
                    label: 'Open Text File...',
                    accelerator: 'CmdOrCtrl+O',
                    click: async () => {
                        const result = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openFile'],
                            filters: [
                                { name: 'Text Files', extensions: ['txt', 'md', 'text'] },
                                { name: 'All Files', extensions: ['*'] }
                            ]
                        });
                        if (!result.canceled && result.filePaths.length > 0) {
                            const content = fs.readFileSync(result.filePaths[0], 'utf-8');
                            sendToRenderer('file-opened', content, result.filePaths[0]);
                        }
                    }
                },
                {
                    label: 'Save Preview As...',
                    accelerator: 'CmdOrCtrl+S',
                    click: async () => {
                        sendToRenderer('request-save');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Export Versions...',
                    click: async () => {
                        sendToRenderer('request-export-versions');
                    }
                },
                {
                    label: 'Import Versions...',
                    click: async () => {
                        const result = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openFile'],
                            filters: [
                                { name: 'JSON Files', extensions: ['json'] }
                            ]
                        });
                        if (!result.canceled && result.filePaths.length > 0) {
                            const content = fs.readFileSync(result.filePaths[0], 'utf-8');
                            try {
                                const versions = JSON.parse(content);
                                sendToRenderer('versions-imported', versions);
                            } catch (e) {
                                dialog.showErrorBox('Import Error', 'Invalid JSON file format.');
                            }
                        }
                    }
                },
                { type: 'separator' },
                isMac ? { role: 'close' } : { role: 'quit' }
            ]
        },

        // Edit menu
        {
            label: 'Edit',
            submenu: [
                {
                    label: 'Undo',
                    accelerator: 'CmdOrCtrl+Z',
                    click: () => sendToRenderer('menu-undo')
                },
                {
                    label: 'Redo',
                    accelerator: 'CmdOrCtrl+Shift+Z',
                    click: () => sendToRenderer('menu-redo')
                },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
                { type: 'separator' },
                {
                    label: 'Clear All',
                    click: () => sendToRenderer('menu-clear-all')
                }
            ]
        },

        // View menu
        {
            label: 'View',
            submenu: [
                {
                    label: 'Toggle Dark Mode',
                    accelerator: 'CmdOrCtrl+D',
                    click: () => sendToRenderer('menu-toggle-dark')
                },
                { type: 'separator' },
                {
                    label: 'Font Size',
                    submenu: [
                        { label: 'Small', click: () => sendToRenderer('menu-font-size', 'sm') },
                        { label: 'Medium', click: () => sendToRenderer('menu-font-size', 'base') },
                        { label: 'Large', click: () => sendToRenderer('menu-font-size', 'lg') },
                        { label: 'Extra Large', click: () => sendToRenderer('menu-font-size', 'xl') }
                    ]
                },
                {
                    label: 'Font Family',
                    submenu: [
                        { label: 'Sans Serif', click: () => sendToRenderer('menu-font-family', 'sans') },
                        { label: 'Serif', click: () => sendToRenderer('menu-font-family', 'serif') },
                        { label: 'Monospace', click: () => sendToRenderer('menu-font-family', 'mono') }
                    ]
                },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
                ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : [])
            ]
        },

        // Window menu
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                ...(isMac ? [
                    { type: 'separator' },
                    { role: 'front' }
                ] : [
                    { role: 'close' }
                ])
            ]
        },

        // Help menu
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Instructions',
                    accelerator: 'F1',
                    click: () => sendToRenderer('menu-show-help')
                },
                {
                    label: 'View AI Usage Logs',
                    click: () => sendToRenderer('menu-show-logs')
                },
                {
                    label: 'Version History',
                    click: () => sendToRenderer('menu-show-versions')
                },
                { type: 'separator' },
                {
                    label: 'About Diff & Commit AI',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About Diff & Commit AI',
                            message: 'Diff & Commit AI',
                            detail: 'A modern, interactive desktop application for comparing, reviewing, and refining text versions with AI-powered enhancements.\n\nVersion 1.2.0'
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
    // Create the menu
    createMenu();

    // IPC Handlers for API Key
    ipcMain.handle('get-api-key', (event, provider) => {
        const storeKey = `${provider}ApiKey`;
        let envVar = undefined;
        if (provider === 'gemini') envVar = process.env.GEMINI_API_KEY;
        if (provider === 'openRouter') envVar = process.env.OPENROUTER_API_KEY;
        if (provider === 'openrouter') envVar = process.env.OPENROUTER_API_KEY;
        return store.get(storeKey) || envVar;
    });

    ipcMain.handle('set-api-key', (event, provider, apiKey) => {
        store.set(`${provider}ApiKey`, apiKey);
    });

    // Logging Handlers
    ipcMain.handle('log-usage', (event, logEntry) => {
        const logs = store.get('aiLogs') || [];
        if (logs.length > 1000) logs.shift();
        logs.push(logEntry);
        store.set('aiLogs', logs);
        return true;
    });

    ipcMain.handle('update-log-rating', (event, id, rating, feedback) => {
        const logs = store.get('aiLogs') || [];
        const index = logs.findIndex(l => l.id === id);
        if (index !== -1) {
            logs[index].rating = rating;
            if (feedback) logs[index].feedback = feedback;
            store.set('aiLogs', logs);
            return true;
        }
        return false;
    });

    ipcMain.handle('get-logs', () => {
        return store.get('aiLogs') || [];
    });

    ipcMain.handle('clear-logs', () => {
        store.set('aiLogs', []);
        return true;
    });

    // Version History Handlers
    ipcMain.handle('get-versions', () => {
        return store.get('textVersions') || [];
    });

    ipcMain.handle('save-versions', (event, versions) => {
        store.set('textVersions', versions);
        return true;
    });

    ipcMain.handle('clear-versions', () => {
        store.set('textVersions', []);
        return true;
    });

    // File save handler
    ipcMain.handle('save-file', async (event, content, defaultName) => {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: defaultName || 'untitled.txt',
            filters: [
                { name: 'Text Files', extensions: ['txt'] },
                { name: 'Markdown', extensions: ['md'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        if (!result.canceled && result.filePath) {
            fs.writeFileSync(result.filePath, content, 'utf-8');
            return result.filePath;
        }
        return null;
    });

    // Export versions handler
    ipcMain.handle('export-versions', async (event, versions) => {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: 'versions-backup.json',
            filters: [{ name: 'JSON Files', extensions: ['json'] }]
        });
        if (!result.canceled && result.filePath) {
            fs.writeFileSync(result.filePath, JSON.stringify(versions, null, 2), 'utf-8');
            return result.filePath;
        }
        return null;
    });

    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});