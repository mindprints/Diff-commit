import { app, BrowserWindow, ipcMain, Menu, dialog, MenuItemConstructorOptions } from 'electron';
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
            preload: path.join(__dirname, '../preload/index.js')
        },
        // Icon path: try resources path for production, or relative for dev
        icon: isDev
            ? path.join(__dirname, '../../public/icon.png')
            : path.join(process.resourcesPath, 'icon.png') // Common place for extraResources
    });

    if (isDev) {
        mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
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
                    label: 'Create Repository...',
                    click: () => sendToRenderer('menu-create-repository')
                },
                { type: 'separator' },
                {
                    label: 'New Project...',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => sendToRenderer('menu-new-project')
                },
                { type: 'separator' },
                {
                    label: 'Import File...',
                    accelerator: 'CmdOrCtrl+O',
                    click: async () => {
                        const result = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openFile'],
                            filters: [
                                { name: 'Supported Files', extensions: ['txt', 'md', 'html', 'htm', 'json'] },
                                { name: 'HTML Files', extensions: ['html', 'htm'] },
                                { name: 'Text Files', extensions: ['txt', 'md'] },
                                { name: 'All Files', extensions: ['*'] }
                            ]
                        });
                        if (!result.canceled && result.filePaths.length > 0) {
                            const filePath = result.filePaths[0];
                            let content = fs.readFileSync(filePath, 'utf-8');

                            // Convert HTML to Markdown if needed
                            const ext = path.extname(filePath).toLowerCase();
                            if (ext === '.html' || ext === '.htm') {
                                try {
                                    const TurndownService = require('turndown');
                                    const turndown = new TurndownService({
                                        headingStyle: 'atx',
                                        codeBlockStyle: 'fenced',
                                        bulletListMarker: '-'
                                    });
                                    content = turndown.turndown(content);
                                } catch (e) {
                                    console.error('Failed to convert HTML to Markdown:', e);
                                    // Fall back to raw content if conversion fails
                                }
                            }

                            sendToRenderer('file-opened', content, filePath);
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
                {
                    label: 'Save Project...',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click: () => sendToRenderer('menu-save-project')
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
                    label: 'About',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About',
                            message: 'Diff & Commit AI',
                            detail: `A modern, interactive desktop application for comparing, reviewing, and refining text versions with AI-powered enhancements.\n\nVersion ${app.getVersion()}`
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template as MenuItemConstructorOptions[]);
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
        const logs = (store.get('aiLogs') || []) as Array<Record<string, unknown>>;
        if (logs.length > 1000) logs.shift();
        logs.push(logEntry);
        store.set('aiLogs', logs);
        return true;
    });

    ipcMain.handle('update-log-rating', (event, id, rating, feedback) => {
        const logs = (store.get('aiLogs') || []) as Array<Record<string, unknown>>;
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

    // Supported file extensions for projects
    const PROJECT_FILE_EXTENSIONS = ['.md', '.txt', '.html', '.htm'];

    function isProjectFile(filename: string): boolean {
        const lower = filename.toLowerCase();
        return PROJECT_FILE_EXTENSIONS.some(ext => lower.endsWith(ext));
    }

    // Open Repository (Select Folder) - scans for project files
    ipcMain.handle('open-repository', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory', 'createDirectory']
        });

        if (result.canceled || result.filePaths.length === 0) return null;

        const repoPath = result.filePaths[0];
        const projects = [];

        // Scan for project files (.md, .txt, .html)
        try {
            const items = fs.readdirSync(repoPath, { withFileTypes: true });
            for (const item of items) {
                if (item.isFile() && !item.name.startsWith('.') && isProjectFile(item.name)) {
                    const filePath = path.join(repoPath, item.name);
                    const stats = fs.statSync(filePath);
                    const content = fs.readFileSync(filePath, 'utf-8');

                    // Use filename without extension as display name
                    const displayName = item.name.replace(/\.[^/.]+$/, '');

                    projects.push({
                        id: item.name,  // Full filename including extension
                        name: displayName,
                        content,
                        createdAt: stats.birthtimeMs,
                        updatedAt: stats.mtimeMs,
                        path: filePath,
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

    // Create New Project (create a file, default .md)
    ipcMain.handle('create-project', async (event, repoPath, projectName, initialContent = '') => {
        if (!repoPath || !projectName) return null;

        // Add .md extension if no extension provided
        const filename = projectName.includes('.') ? projectName : `${projectName}.md`;
        const filePath = path.join(repoPath, filename);
        const displayName = filename.replace(/\.[^/.]+$/, '');

        try {
            // Create the file
            fs.writeFileSync(filePath, initialContent, 'utf-8');

            return {
                id: filename,
                name: displayName,
                content: initialContent,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                path: filePath,
                repositoryPath: repoPath
            };
        } catch (e) {
            console.error('Failed to create project:', e);
            throw e;
        }
    });

    // Save Project Content (write directly to the file)
    ipcMain.handle('save-project-content', async (event, projectPath, content) => {
        if (!projectPath) return false;
        try {
            fs.writeFileSync(projectPath, content, 'utf-8');
            return true;
        } catch (e) {
            console.error('Failed to save project content:', e);
            return false;
        }
    });

    // Helper: get .diff-commit directory path
    function getDiffCommitPath(repoPath: string): string {
        return path.join(repoPath, '.diff-commit');
    }

    // Load Project Commits (from .diff-commit/{filename}.commits.json)
    ipcMain.handle('load-project-commits', async (event, projectPath) => {
        if (!projectPath) return [];

        const repoPath = path.dirname(projectPath);
        const filename = path.basename(projectPath);
        const diffCommitDir = getDiffCommitPath(repoPath);
        const commitsFile = path.join(diffCommitDir, `${filename}.commits.json`);

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

    // Save Project Commits (to .diff-commit/{filename}.commits.json)
    ipcMain.handle('save-project-commits', async (event, projectPath, commits) => {
        if (!projectPath) return false;

        const repoPath = path.dirname(projectPath);
        const filename = path.basename(projectPath);
        const diffCommitDir = getDiffCommitPath(repoPath);
        const commitsFile = path.join(diffCommitDir, `${filename}.commits.json`);

        try {
            if (!fs.existsSync(diffCommitDir)) {
                fs.mkdirSync(diffCommitDir, { recursive: true });
            }
            fs.writeFileSync(commitsFile, JSON.stringify(commits, null, 2), 'utf-8');
            return true;
        } catch (e) {
            console.error('Failed to save commits:', e);
            return false;
        }
    });

    // Create Repository (Create a new folder on disk)
    ipcMain.handle('create-repository', async () => {
        const docsPath = app.getPath('documents');
        const defaultPath = path.join(docsPath, 'Diff-Commit-Repos');

        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Create Repository',
            defaultPath: defaultPath,
            buttonLabel: 'Create',
            properties: ['createDirectory' as any],
            nameFieldLabel: 'Repository Name'
        });

        if (result.canceled || !result.filePath) return null;

        const repoPath = result.filePath;

        try {
            // Create the repository folder
            fs.mkdirSync(repoPath, { recursive: true });

            // Create .diff-commit folder for commit storage
            fs.mkdirSync(path.join(repoPath, '.diff-commit'), { recursive: true });

            return { path: repoPath, projects: [] };
        } catch (e) {
            console.error('Failed to create repository:', e);
            throw e;
        }
    });

    // Save Project Bundle (Export project content + commits as folder)
    ipcMain.handle('save-project-bundle', async (event, projectPath) => {
        if (!projectPath) return null;

        const repoPath = path.dirname(projectPath);
        const filename = path.basename(projectPath);
        const displayName = filename.replace(/\.[^/.]+$/, '');
        const diffCommitDir = path.join(repoPath, '.diff-commit');
        const commitsFile = path.join(diffCommitDir, `${filename}.commits.json`);

        // Read current content
        const projectContent = fs.existsSync(projectPath)
            ? fs.readFileSync(projectPath, 'utf-8')
            : '';
        const commitsContent = fs.existsSync(commitsFile)
            ? fs.readFileSync(commitsFile, 'utf-8')
            : '[]';

        // Show save dialog for the bundle folder
        const docsPath = app.getPath('documents');
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Project Bundle',
            defaultPath: path.join(docsPath, `${displayName}-bundle`),
            buttonLabel: 'Save Bundle'
        });

        if (result.canceled || !result.filePath) return null;

        try {
            const bundleDir = result.filePath;
            fs.mkdirSync(bundleDir, { recursive: true });
            fs.writeFileSync(path.join(bundleDir, filename), projectContent, 'utf-8');
            fs.writeFileSync(path.join(bundleDir, `${filename}.commits.json`), commitsContent, 'utf-8');
            return bundleDir;
        } catch (e) {
            console.error('Failed to save project bundle:', e);
            throw e;
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