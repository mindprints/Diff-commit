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
                    label: 'Open Repository...',
                    accelerator: 'CmdOrCtrl+Shift+O',
                    click: () => sendToRenderer('menu-open-repository')
                },
                {
                    label: 'New Project...',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => sendToRenderer('menu-new-project')
                },
                {
                    label: 'Switch Project...',
                    accelerator: 'CmdOrCtrl+P',
                    click: () => sendToRenderer('menu-switch-project')
                },
                { type: 'separator' },
                {
                    label: 'Import File...',
                    accelerator: 'CmdOrCtrl+O',
                    click: async () => {
                        const result = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openFile'],
                            filters: [
                                { name: 'Supported Files', extensions: ['txt', 'md', 'json'] },
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

        // Tools menu
        {
            label: 'Tools',
            submenu: [
                {
                    label: 'Check Spelling (Local)',
                    click: () => sendToRenderer('menu-tools-spelling-local')
                },
                {
                    label: 'Check Spelling (AI)',
                    click: () => sendToRenderer('menu-tools-spelling-ai')
                },
                {
                    label: 'Fix Grammar',
                    click: () => sendToRenderer('menu-tools-grammar')
                },
                {
                    label: 'Full Polish',
                    click: () => sendToRenderer('menu-tools-polish')
                },
                { type: 'separator' },
                {
                    label: 'Fact Check',
                    click: () => sendToRenderer('menu-tools-factcheck')
                },
                { type: 'separator' },
                {
                    label: 'Manage Prompts...',
                    click: () => sendToRenderer('menu-tools-prompts')
                },
                {
                    label: 'Project Manager...',
                    click: () => sendToRenderer('menu-tools-projects')
                }
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
                    label: 'Commit History',
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
                            detail: 'A modern, interactive desktop application for comparing, reviewing, and refining text versions with AI-powered enhancements.\n\nVersion 1.2.1'
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

    // Commit History Handlers
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

    // AI Prompts Handlers
    ipcMain.handle('get-prompts', () => {
        return store.get('aiPrompts') || [];
    });

    ipcMain.handle('save-prompts', (event, prompts) => {
        store.set('aiPrompts', prompts);
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

    // Export commits handler
    ipcMain.handle('export-versions', async (event, commits) => {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: 'commits-backup.json',
            filters: [{ name: 'JSON Files', extensions: ['json'] }]
        });
        if (!result.canceled && result.filePath) {
            fs.writeFileSync(result.filePath, JSON.stringify(commits, null, 2), 'utf-8');
            return result.filePath;
        }
        return null;
    });

    // Repository Management Handlers

    // Open Repository (Select Folder)
    ipcMain.handle('open-repository', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory', 'createDirectory']
        });

        if (result.canceled || result.filePaths.length === 0) return null;

        const repoPath = result.filePaths[0];
        const projects = [];

        // Scan for subdirectories that look like projects
        try {
            const items = fs.readdirSync(repoPath, { withFileTypes: true });
            for (const item of items) {
                if (item.isDirectory() && !item.name.startsWith('.')) {
                    const projectPath = path.join(repoPath, item.name);
                    const draftPath = path.join(projectPath, 'draft.txt');

                    // A valid project must have a draft.txt (or we can be lenient and just accept folders)
                    // Let's accept any folder, and check for draft.txt to read content
                    let content = '';
                    let stats = fs.statSync(projectPath);

                    if (fs.existsSync(draftPath)) {
                        content = fs.readFileSync(draftPath, 'utf-8');
                        const draftStats = fs.statSync(draftPath);
                        stats = draftStats; // Use file stats for dates if file exists
                    }

                    projects.push({
                        id: item.name, // Use folder name as ID for simplicity in FS mode
                        name: item.name,
                        content,
                        createdAt: stats.birthtimeMs,
                        updatedAt: stats.mtimeMs,
                        path: projectPath,
                        repositoryPath: repoPath
                    });
                }
            }
        } catch (e) {
            console.error('Failed to scan repository:', e);
            throw e;
        }

        return { path: repoPath, projects };
    });

    // Create New Project in Repository
    ipcMain.handle('create-project', async (event, repoPath, projectName, initialContent = '') => {
        if (!repoPath || !projectName) return null;

        const projectPath = path.join(repoPath, projectName);
        const draftPath = path.join(projectPath, 'draft.txt');
        const commitsPath = path.join(projectPath, '.commits');

        try {
            // Create directories
            if (!fs.existsSync(projectPath)) fs.mkdirSync(projectPath);
            if (!fs.existsSync(commitsPath)) fs.mkdirSync(commitsPath);

            // Create draft file
            fs.writeFileSync(draftPath, initialContent, 'utf-8');

            return {
                id: projectName,
                name: projectName,
                content: initialContent,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                path: projectPath,
                repositoryPath: repoPath
            };
        } catch (e) {
            console.error('Failed to create project:', e);
            throw e;
        }
    });

    // Save Project Content
    ipcMain.handle('save-project-content', async (event, projectPath, content) => {
        if (!projectPath) return false;
        try {
            const draftPath = path.join(projectPath, 'draft.txt');
            fs.writeFileSync(draftPath, content, 'utf-8');
            return true;
        } catch (e) {
            console.error('Failed to save project content:', e);
            return false;
        }
    });

    // Load Project Commits (from .commits folder)
    ipcMain.handle('load-project-commits', async (event, projectPath) => {
        if (!projectPath) return [];
        const commitsPath = path.join(projectPath, '.commits');
        const commitsFile = path.join(commitsPath, 'commits.json');

        try {
            if (fs.existsSync(commitsFile)) {
                const data = fs.readFileSync(commitsFile, 'utf-8');
                return JSON.parse(data);
            }
            return [];
        } catch (e) {
            console.error('Failed to load commits:', e);
            return [];
        }
    });

    // Save Project Commits
    ipcMain.handle('save-project-commits', async (event, projectPath, commits) => {
        if (!projectPath) return false;
        const commitsPath = path.join(projectPath, '.commits');
        const commitsFile = path.join(commitsPath, 'commits.json');

        try {
            if (!fs.existsSync(commitsPath)) fs.mkdirSync(commitsPath, { recursive: true });
            fs.writeFileSync(commitsFile, JSON.stringify(commits, null, 2), 'utf-8');
            return true;
        } catch (e) {
            console.error('Failed to save commits:', e);
            return false;
        }
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