import { app, BrowserWindow, ipcMain, Menu, dialog, MenuItemConstructorOptions, safeStorage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import dotenv from 'dotenv';
import fs from 'fs';
import * as hierarchyService from './hierarchyService';
import { AppFolderInitializer } from './AppFolderInitializer';
import { registerHierarchyHandlers } from './hierarchy-ipc-handlers';
import type { NodeType } from './hierarchyTypes';
import {
    assertProjectPath as assertProjectPathBase,
    assertRepositoryPath as assertRepositoryPathBase,
} from './pathValidators';
import { readProjectBundleSource } from './projectBundle';
import {
    normalizeOpenRouterModel,
    tokenPriceToMillionPrice,
    type OpenRouterModel,
} from '../shared/openRouterModels';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine if we're in development before loading dotenv
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Load environment variables from the correct path
// Development: project root (.env)
// Production: app userData directory (e.g., %APPDATA%/diff-commit-ai/.env on Windows)
const envPath = isDev
    ? path.join(__dirname, '../../.env')
    : path.join(app.getPath('userData'), '.env');

// Try to load from the computed path, silently continue if not found
dotenv.config({ path: envPath });

// Ensure cache directories are writable to avoid disk cache errors
try {
    const cachePath = path.join(app.getPath('userData'), 'cache');
    fs.mkdirSync(cachePath, { recursive: true });
    app.commandLine.appendSwitch('disk-cache-dir', cachePath);
    app.commandLine.appendSwitch('gpu-cache-dir', cachePath);
} catch (e) {
    console.warn('[App] Failed to initialize cache directory:', e);
}

// Also log for debugging
if (!isDev) {
    console.log('[Config] Looking for .env at:', envPath);
}

const store = new Store();

// ========================================
// Secure API Key Storage Helpers
// ========================================

/**
 * Encrypt an API key using OS-level encryption (DPAPI on Windows, Keychain on macOS)
 */
function encryptApiKey(key: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
        console.warn('[Security] Encryption not available, storing key in plain text');
        return key;
    }
    return safeStorage.encryptString(key).toString('base64');
}

/**
 * Decrypt an API key. Handles both encrypted and plain text keys for migration.
 */
function decryptApiKey(encryptedKey: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
        return encryptedKey;
    }
    try {
        return safeStorage.decryptString(Buffer.from(encryptedKey, 'base64'));
    } catch (e) {
        // Key might be stored in plain text from before migration
        console.warn('[Security] Failed to decrypt key, assuming plain text');
        return encryptedKey;
    }
}

/**
 * Get an API key securely. Checks electron-store first (with decryption),
 * then falls back to environment variables.
 * Provider is normalized to lowercase for consistent storage.
 */
function getSecureApiKey(provider: string): string | undefined {
    // Normalize provider to lowercase for consistent storage
    const normalizedProvider = provider.toLowerCase();

    // Map to canonical provider identifiers
    const providerMap: Record<string, string> = {
        'openrouter': 'openrouter',
        'gemini': 'gemini',
        'artificialanalysis': 'artificialanalysis',
        'artificial_analysis': 'artificialanalysis',
    };

    const canonicalProvider = providerMap[normalizedProvider] || normalizedProvider;
    const storeKey = `${canonicalProvider}ApiKey`;
    const storedKey = store.get(storeKey) as string | undefined;

    if (storedKey) {
        return decryptApiKey(storedKey);
    }

    // Fall back to environment variables using canonical keys
    const envVars: Record<string, string | undefined> = {
        'gemini': process.env.GEMINI_API_KEY,
        'openrouter': process.env.OPENROUTER_API_KEY,
        'artificialanalysis': process.env.ARTIFICIAL_ANALYSIS_API_KEY,
    };

    return envVars[canonicalProvider];
}

let mainWindow = null;
let folderInitializer: AppFolderInitializer | null = null;

interface WindowLifecycleState {
    hasUnsavedChanges: boolean;
    bypassCloseGuard: boolean;
}

const windowLifecycleState = new Map<number, WindowLifecycleState>();
const pendingSaveBeforeClose = new Map<string, (success: boolean) => void>();

function getWindowLifecycleState(window: BrowserWindow): WindowLifecycleState {
    const key = window.id;
    const existing = windowLifecycleState.get(key);
    if (existing) return existing;
    const created: WindowLifecycleState = {
        hasUnsavedChanges: false,
        bypassCloseGuard: false,
    };
    windowLifecycleState.set(key, created);
    return created;
}

function requestRendererSaveBeforeClose(window: BrowserWindow, timeoutMs = 10000): Promise<boolean> {
    const requestId = crypto.randomUUID();
    return new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (success: boolean) => {
            if (settled) return;
            settled = true;
            pendingSaveBeforeClose.delete(requestId);
            resolve(success);
        };

        pendingSaveBeforeClose.set(requestId, settle);
        window.webContents.send('request-save-before-close', requestId);
        setTimeout(() => settle(false), timeoutMs);
    });
}

// Initialize app folders before creating window
/**
 * Initialize app folders before creating window.
 * Returns true if successful, false otherwise.
 */
async function initializeApp(): Promise<boolean> {
    console.log('[App] Initializing application folders...');

    // Create folder initializer
    folderInitializer = new AppFolderInitializer();

    // Check if folders already exist
    const exists = await folderInitializer.checkFoldersExistAsync();
    console.log('[App] Workspace exists:', exists.workspace);

    // Create default folder structure
    const result = await folderInitializer.initializeDefaultFolders();

    if (result.success) {
        console.log('[App] ✓ Application folders initialized');
        if (result.paths.length > 0) {
            console.log('[App] Created:', result.paths.length, 'new folders/files');
        } else {
            console.log('[App] All folders already exist');
        }

        // Register IPC handlers with the repos path
        const reposPath = folderInitializer.getReposPath();
        console.log('[App] Repos path:', reposPath);

        // Pass repos path to hierarchy validator
        registerHierarchyHandlers(reposPath);
        return true;
    } else {
        console.error('[App] ✗ Failed to initialize folders:', result.error);

        // Show user-facing error dialog
        dialog.showErrorBox(
            'Application Initialization Failed',
            `The application failed to initialize its vital folders:\n\n${result.error}\n\nPlease check your file permissions and try again.`
        );

        return false;
    }
}

function createWindow() {
    const createdWindow = new BrowserWindow({
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
    mainWindow = createdWindow;

    getWindowLifecycleState(createdWindow);
    createdWindow.on('close', async (event) => {
        const lifecycle = getWindowLifecycleState(createdWindow);
        if (lifecycle.bypassCloseGuard || !lifecycle.hasUnsavedChanges) {
            return;
        }

        event.preventDefault();
        const result = await dialog.showMessageBox(createdWindow, {
            type: 'warning',
            buttons: ['Save', "Don't Save", 'Cancel'],
            defaultId: 0,
            cancelId: 2,
            title: 'Unsaved Project Changes',
            message: 'You have unsaved project changes.',
            detail: 'Choose Save to persist the current draft before closing.',
            noLink: true,
        });

        if (result.response === 2) {
            return;
        }

        if (result.response === 1) {
            lifecycle.bypassCloseGuard = true;
            lifecycle.hasUnsavedChanges = false;
            createdWindow.webContents.send('discard-draft-before-close');
            createdWindow.close();
            return;
        }

        const saved = await requestRendererSaveBeforeClose(createdWindow);
        if (!saved) {
            dialog.showErrorBox(
                'Unable to Save Project',
                'The project could not be saved before closing. The window will remain open so you can retry.'
            );
            return;
        }

        lifecycle.bypassCloseGuard = true;
        lifecycle.hasUnsavedChanges = false;
        createdWindow.close();
    });

    createdWindow.on('closed', () => {
        windowLifecycleState.delete(createdWindow.id);
    });

    if (isDev) {
        createdWindow.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173');
        createdWindow.webContents.openDevTools();
    } else {
        createdWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
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
                        const openResult = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openFile'],
                            filters: [
                                { name: 'Supported Files', extensions: ['txt', 'md', 'docx', 'html', 'htm'] },
                                { name: 'Word Documents (.docx)', extensions: ['docx'] },
                                { name: 'HTML Files', extensions: ['html', 'htm'] },
                                { name: 'Text / Markdown', extensions: ['txt', 'md'] },
                                { name: 'All Files', extensions: ['*'] }
                            ]
                        });
                        if (!openResult.canceled && openResult.filePaths.length > 0) {
                            const filePath = openResult.filePaths[0];
                            const ext = path.extname(filePath).toLowerCase();
                            let content = '';

                            if (ext === '.docx') {
                                // DOCX → HTML (mammoth) → Markdown (Turndown)
                                try {
                                    // mammoth is CJS — access via .default when imported as ESM
                                    const mammothMod = await import('mammoth');
                                    const mammoth = (mammothMod as unknown as { default: typeof mammothMod }).default ?? mammothMod;
                                    const { default: TurndownService } = await import('turndown');
                                    const mammothResult = await mammoth.convertToHtml({ path: filePath });
                                    const turndown = new TurndownService({
                                        headingStyle: 'atx',
                                        codeBlockStyle: 'fenced',
                                        bulletListMarker: '-',
                                        strongDelimiter: '**',
                                        emDelimiter: '*',
                                    });
                                    content = turndown.turndown(mammothResult.value);
                                    if (mammothResult.messages.length > 0) {
                                        console.warn('[Import DOCX] Mammoth warnings:', mammothResult.messages);
                                    }
                                } catch (e) {
                                    console.error('[Import DOCX] Failed:', e);
                                    dialog.showErrorBox('Import Failed', 'Could not read the Word document. The file may be corrupted or an unsupported variant.');
                                    return;
                                }
                            } else if (ext === '.html' || ext === '.htm') {
                                // HTML → Markdown (Turndown)
                                const rawHtml = fs.readFileSync(filePath, 'utf-8');
                                try {
                                    const { default: TurndownService } = await import('turndown');
                                    const turndown = new TurndownService({
                                        headingStyle: 'atx',
                                        codeBlockStyle: 'fenced',
                                        bulletListMarker: '-',
                                        strongDelimiter: '**',
                                        emDelimiter: '*',
                                    });
                                    content = turndown.turndown(rawHtml);
                                } catch (e) {
                                    console.error('[Import HTML] Failed:', e);
                                    content = rawHtml;
                                }
                            } else {
                                // Plain text / Markdown — pass through
                                content = fs.readFileSync(filePath, 'utf-8');
                            }

                            sendToRenderer('file-opened', content, filePath);
                        }
                    }
                },
                {
                    label: 'Export Preview As',
                    accelerator: 'CmdOrCtrl+S',
                    submenu: [
                        {
                            label: 'Markdown (.md)...',
                            click: () => sendToRenderer('request-save', 'md')
                        },
                        {
                            label: 'HTML (.html)...',
                            click: () => sendToRenderer('request-save', 'html')
                        },
                        {
                            label: 'Plain Text (.txt)...',
                            click: () => sendToRenderer('request-save', 'txt')
                        },
                    ]
                },
                {
                    label: 'Save Project',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click: () => sendToRenderer('menu-save-project')
                },
                {
                    label: 'Export Project Bundle...',
                    accelerator: 'CmdOrCtrl+Shift+E',
                    click: () => sendToRenderer('menu-export-project-bundle')
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
                    label: 'Slash Command Manual',
                    click: () => sendToRenderer('menu-show-help')
                },
                { type: 'separator' },
                {
                    label: 'Manage Prompts...',
                    click: () => sendToRenderer('menu-tools-prompts')
                },
                {
                    label: 'Project Manager...',
                    click: () => sendToRenderer('menu-tools-projects')
                },
                {
                    label: 'Model Manager...',
                    click: () => sendToRenderer('menu-tools-models')
                },
                { type: 'separator' },
                {
                    label: 'Settings...',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => sendToRenderer('menu-tools-settings')
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

app.whenReady().then(async () => {
    // Initialize folders BEFORE creating window
    const initialized = await initializeApp();

    if (!initialized) {
        console.error('[App] Startup aborted due to initialization failure.');
        // Quit the app after a delay to allow the error dialog to be read
        setTimeout(() => {
            app.quit();
        }, 3000);
        return;
    }

    // Create the menu
    createMenu();

    // IPC Handlers for API Key (using secure storage)
    ipcMain.handle('set-api-key', (event, provider, apiKey) => {
        // Normalize provider to match getSecureApiKey
        const normalizedProvider = provider.toLowerCase();
        const providerMap: Record<string, string> = {
            'openrouter': 'openrouter',
            'gemini': 'gemini',
            'artificialanalysis': 'artificialanalysis',
            'artificial_analysis': 'artificialanalysis',
        };
        const canonicalProvider = providerMap[normalizedProvider] || normalizedProvider;

        const encrypted = encryptApiKey(apiKey);
        store.set(`${canonicalProvider}ApiKey`, encrypted);
    });

    ipcMain.handle('get-api-key-configured', (event, provider) => {
        const key = getSecureApiKey(provider);
        return Boolean(key && key.trim().length > 0);
    });

    ipcMain.handle('set-window-dirty-state', (event, hasUnsavedChanges: boolean) => {
        const sourceWindow = BrowserWindow.fromWebContents(event.sender);
        if (!sourceWindow) return false;
        const lifecycle = getWindowLifecycleState(sourceWindow);
        lifecycle.hasUnsavedChanges = Boolean(hasUnsavedChanges);
        return true;
    });

    ipcMain.handle('respond-save-before-close', (_event, requestId: string, success: boolean) => {
        const resolver = pendingSaveBeforeClose.get(requestId);
        if (!resolver) return false;
        resolver(Boolean(success));
        return true;
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

    // File save handler — format-aware export.
    // format argument ('md' | 'html' | 'txt') is supplied by the submenu click.
    // The extension is pre-filled in defaultPath and appended if absent after dialog.
    ipcMain.handle('save-file', async (event, content, defaultName, format: 'md' | 'html' | 'txt' = 'md') => {
        const formatExt = format === 'html' ? 'html' : format === 'txt' ? 'txt' : 'md';
        // Runtime type guard: only call .replace() when defaultName is genuinely a non-empty string.
        const baseName = (typeof defaultName === 'string' && defaultName.length > 0)
            ? defaultName.replace(/\.[^.]+$/, '')
            : 'untitled';
        const defaultPath = `${baseName}.${formatExt}`;

        const formatFilters: Record<string, { name: string; extensions: string[] }> = {
            md: { name: 'Markdown', extensions: ['md'] },
            html: { name: 'HTML', extensions: ['html'] },
            txt: { name: 'Plain Text', extensions: ['txt'] },
        };

        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath,
            filters: [
                formatFilters[formatExt],
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (!result.canceled && result.filePath) {
            // Ensure the correct extension is present (Windows doesn't always add it)
            let savePath = result.filePath;
            if (!path.extname(savePath)) {
                savePath = `${savePath}.${formatExt}`;
            }

            let output = content as string;
            const ext = path.extname(savePath).toLowerCase();

            if (ext === '.html') {
                try {
                    const { marked } = await import('marked');
                    const body = await marked(output);
                    output = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Export</title>
  <style>
    body { font-family: Georgia, serif; max-width: 720px; margin: 3rem auto; line-height: 1.7; color: #222; }
    h1,h2,h3 { line-height: 1.3; margin-top: 2rem; }
    strong { font-weight: 700; }
    em { font-style: italic; }
    p { margin: 1em 0; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
                } catch (e) {
                    console.error('[Export HTML] marked failed:', e);
                    dialog.showErrorBox(
                        'Export Failed',
                        'Could not convert the document to HTML. The file was not saved.\n\n' +
                        (e instanceof Error ? e.message : String(e))
                    );
                    return null;
                }
            } else if (ext === '.txt') {
                try {
                    const { markdownToTxt } = await import('markdown-to-txt');
                    output = markdownToTxt(output);
                } catch (e) {
                    console.error('[Export TXT] markdown-to-txt failed:', e);
                    dialog.showErrorBox(
                        'Export Failed',
                        'Could not strip Markdown formatting for plain-text export. The file was not saved.\n\n' +
                        (e instanceof Error ? e.message : String(e))
                    );
                    return null;
                }
            }
            // .md and everything else: write as-is

            fs.writeFileSync(savePath, output, 'utf-8');
            return savePath;
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

    // Save image handler
    ipcMain.handle('save-image', async (event, base64Data: string, defaultName: string) => {
        try {
            const result = await dialog.showSaveDialog(mainWindow, {
                defaultPath: defaultName || 'generated-image.png',
                filters: [
                    { name: 'PNG Images', extensions: ['png'] },
                    { name: 'JPEG Images', extensions: ['jpg', 'jpeg'] },
                    { name: 'WebP Images', extensions: ['webp'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (!result.canceled && result.filePath) {
                // Extract base64 data from data URL if present
                let imageData = base64Data;
                if (base64Data.includes(',')) {
                    imageData = base64Data.split(',')[1];
                }

                // Write the image file
                const buffer = Buffer.from(imageData, 'base64');
                fs.writeFileSync(result.filePath, buffer);

                console.log('[SaveImage] Saved to:', result.filePath);
                return result.filePath;
            }
            return null;
        } catch (error) {
            console.error('[SaveImage] Error:', error);
            throw error;
        }
    });

    // Supported file extensions for project content
    const PROJECT_CONTENT_FILE = 'content.md';
    const DIFF_COMMIT_DIR = '.diff-commit';
    const COMMITS_FILE = 'commits.json';
    const METADATA_FILE = 'metadata.json';

    interface ProjectMetadata {
        createdAt: number;
        id?: string; // Stable UUID — persists across renames
    }

    /**
     * Read project metadata from .diff-commit/metadata.json
     */
    function readProjectMetadata(diffCommitPath: string): ProjectMetadata | null {
        const metadataPath = path.join(diffCommitPath, METADATA_FILE);
        try {
            if (fs.existsSync(metadataPath)) {
                const data = fs.readFileSync(metadataPath, 'utf-8');
                return JSON.parse(data) as ProjectMetadata;
            }
        } catch (e) {
            console.warn('Failed to read metadata:', e);
        }
        return null;
    }

    /**
     * Write project metadata to .diff-commit/metadata.json
     */
    function writeProjectMetadata(diffCommitPath: string, metadata: ProjectMetadata): void {
        const metadataPath = path.join(diffCommitPath, METADATA_FILE);
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    }

    /**
     * Generate a dynamic project name based on current timestamp
     * Format: 'MMM DD HH.mm' (e.g., 'Jan 13 14.30')
     * Using '.' instead of ':' for Windows filename compatibility
     */
    function getFormattedTimestamp(): string {
        const now = new Date();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[now.getMonth()];
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${month} ${day} ${hours}.${minutes}`;
    }

    function getReposRootPath(): string {
        return getFolderInitializer().getReposPath();
    }

    function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
        const relative = path.relative(rootPath, targetPath);
        if (!relative || relative.trim() === '') return false;
        return !relative.startsWith('..') && !path.isAbsolute(relative);
    }

    function assertRepositoryPath(repoPath: string): string {
        return assertRepositoryPathBase(repoPath, getReposRootPath(), isRepositoryFolder);
    }

    function assertProjectPath(projectPath: string): string {
        return assertProjectPathBase(projectPath, getReposRootPath(), isProjectFolder);
    }

    /**
     * Check if a directory is a valid project folder.
     * A project folder contains a .diff-commit directory.
     */
    function isProjectFolder(dirPath: string): boolean {
        const diffCommitPath = path.join(dirPath, DIFF_COMMIT_DIR);
        return fs.existsSync(diffCommitPath) && fs.statSync(diffCommitPath).isDirectory();
    }

    function isRepositoryFolder(dirPath: string): boolean {
        try {
            return hierarchyService.getNodeType(dirPath) === 'repository';
        } catch {
            return false;
        }
    }

    function getRepositoryInfo(repoPath: string): { name: string; path: string; projectCount: number; createdAt?: number; updatedAt?: number } | null {
        if (!fs.existsSync(repoPath)) return null;

        let projectCount = 0;
        let latestUpdatedAt: number | undefined = undefined;
        let createdAt: number | undefined = undefined;

        try {
            const stats = fs.statSync(repoPath);
            createdAt = stats.birthtimeMs;
            latestUpdatedAt = stats.mtimeMs;
        } catch {
            // Ignore stat errors
        }

        try {
            const items = fs.readdirSync(repoPath, { withFileTypes: true });
            for (const item of items) {
                if (!item.isDirectory() || item.name.startsWith('.')) continue;
                const projectPath = path.join(repoPath, item.name);
                if (isProjectFolder(projectPath)) {
                    projectCount++;
                    try {
                        const contentPath = path.join(projectPath, PROJECT_CONTENT_FILE);
                        if (fs.existsSync(contentPath)) {
                            const contentStats = fs.statSync(contentPath);
                            if (!latestUpdatedAt || contentStats.mtimeMs > latestUpdatedAt) {
                                latestUpdatedAt = contentStats.mtimeMs;
                            }
                        }
                    } catch {
                        // Ignore content stats errors
                    }
                }
            }
        } catch {
            // Ignore repository scan errors
        }

        return {
            name: path.basename(repoPath),
            path: repoPath,
            projectCount,
            createdAt,
            updatedAt: latestUpdatedAt
        };
    }

    // Open Repository (Select Folder) - scans for project folders
    ipcMain.handle('open-repository', async () => {
        const reposRootPath = getReposRootPath();
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory', 'createDirectory'],
            defaultPath: reposRootPath
        });

        if (result.canceled || result.filePaths.length === 0) return null;

        const repoPath = result.filePaths[0];
        if (!isPathInsideRoot(repoPath, reposRootPath)) {
            dialog.showErrorBox(
                'Invalid Repository Location',
                `Repositories must be inside the fixed root folder:\n${reposRootPath}\n\nChange the root location in Settings if needed.`
            );
            return null;
        }
        return await scanRepository(repoPath);
    });

    // List repositories from the fixed root
    ipcMain.handle('list-repositories', async () => {
        const reposRootPath = getReposRootPath();
        const repositories: Array<{ name: string; path: string; projectCount: number; createdAt?: number; updatedAt?: number }> = [];

        try {
            if (!fs.existsSync(reposRootPath)) {
                return [];
            }

            const entries = fs.readdirSync(reposRootPath, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

                const repoPath = path.join(reposRootPath, entry.name);
                if (!isRepositoryFolder(repoPath)) continue;
                const info = getRepositoryInfo(repoPath);
                if (info) repositories.push(info);
            }
        } catch (e) {
            console.error('Failed to list repositories:', e);
            return [];
        }

        repositories.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        return repositories;
    });

    ipcMain.handle('rename-repository', async (event, repoPath: string, newName: string) => {
        if (!repoPath || !newName) return null;

        const reposRootPath = getReposRootPath();
        if (!isPathInsideRoot(repoPath, reposRootPath)) {
            throw new Error('Repository is outside the fixed root');
        }

        const parentPath = path.dirname(repoPath);
        if (parentPath !== reposRootPath) {
            throw new Error('Repository must be directly inside the root');
        }

        if (!isRepositoryFolder(repoPath)) {
            throw new Error('Invalid repository folder');
        }

        const validation = hierarchyService.validateName(newName);
        if (!validation.valid) {
            throw new Error(validation.error || 'Invalid repository name');
        }

        const trimmedName = newName.trim();
        const newPath = path.join(parentPath, trimmedName);
        const isSamePath = repoPath.toLowerCase() === newPath.toLowerCase();
        if (!isSamePath && fs.existsSync(newPath)) {
            throw new Error(`A repository named "${trimmedName}" already exists`);
        }

        await fs.promises.rename(repoPath, newPath);

        const metaPath = path.join(newPath, '.hierarchy-meta.json');
        try {
            if (fs.existsSync(metaPath)) {
                const metaContent = await fs.promises.readFile(metaPath, 'utf-8');
                const meta = JSON.parse(metaContent);
                meta.name = trimmedName;
                await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
            } else {
                hierarchyService.writeHierarchyMeta(newPath, {
                    type: 'repository',
                    createdAt: Date.now(),
                    name: trimmedName
                });
            }
        } catch (e) {
            console.warn('Failed to update repository metadata:', e);
        }

        return getRepositoryInfo(newPath);
    });

    ipcMain.handle('delete-repository', async (event, repoPath: string) => {
        if (!repoPath) return false;

        const reposRootPath = getReposRootPath();
        if (!isPathInsideRoot(repoPath, reposRootPath)) {
            throw new Error('Repository is outside the fixed root');
        }

        const parentPath = path.dirname(repoPath);
        if (parentPath !== reposRootPath) {
            throw new Error('Repository must be directly inside the root');
        }

        if (!isRepositoryFolder(repoPath)) {
            throw new Error('Invalid repository folder');
        }

        await fs.promises.rm(repoPath, { recursive: true, force: true });
        return true;
    });

    /**
     * Scan a repository folder for project folders (subdirectories with .diff-commit)
     */
    async function scanRepository(repoPath: string) {
        const projects = [];

        // Scan for project folders (subdirectories with .diff-commit)
        try {
            const items = fs.readdirSync(repoPath, { withFileTypes: true });
            for (const item of items) {
                if (item.isDirectory() && !item.name.startsWith('.')) {
                    const projectPath = path.join(repoPath, item.name);

                    // Check if this is a project folder (has .diff-commit)
                    if (isProjectFolder(projectPath)) {
                        const contentPath = path.join(projectPath, PROJECT_CONTENT_FILE);
                        const diffCommitPath = path.join(projectPath, DIFF_COMMIT_DIR);
                        let content = '';

                        // Read content if exists
                        if (fs.existsSync(contentPath)) {
                            content = fs.readFileSync(contentPath, 'utf-8');
                        }

                        // Get timestamps - prefer metadata for createdAt, content file for updatedAt
                        const stats = fs.statSync(projectPath);
                        const contentStats = fs.existsSync(contentPath) ? fs.statSync(contentPath) : null;
                        const metadata = readProjectMetadata(diffCommitPath);

                        const createdAt = metadata?.createdAt || stats.birthtimeMs;
                        const updatedAt = contentStats?.mtimeMs || stats.mtimeMs;
                        // Prefer stable UUID from metadata; fall back to folder name for legacy projects
                        const projectId = metadata?.id || item.name;

                        projects.push({
                            id: projectId,
                            name: item.name,
                            content,
                            createdAt,
                            updatedAt,
                            path: projectPath,  // Full path to project folder
                            repositoryPath: repoPath
                        });
                    }
                }
            }
        } catch (e) {
            console.error('Failed to scan repository:', e);
            throw e;
        }

        return { path: repoPath, projects };
    }

    // Load Repository at specific path
    ipcMain.handle('load-repository-at-path', async (event, repoPath: string) => {
        if (!repoPath || !fs.existsSync(repoPath)) return null;
        const reposRootPath = getReposRootPath();
        if (!isPathInsideRoot(repoPath, reposRootPath)) {
            console.warn('[Repository] Blocked load outside root:', repoPath);
            return null;
        }
        try {
            return await scanRepository(repoPath);
        } catch (e) {
            console.error('Failed to load repository at path:', repoPath, e);
            return null;
        }
    });

    // Create New Project (create a folder with content.md and .diff-commit)
    ipcMain.handle('create-project', async (event, repoPath, projectName, initialContent = '') => {
        if (!repoPath || !projectName) return null;
        const validatedRepoPath = assertRepositoryPath(repoPath);
        const nameValidation = hierarchyService.validateName(projectName);
        if (!nameValidation.valid) {
            throw new Error(nameValidation.error || 'Invalid project name');
        }

        // HIERARCHY VALIDATION: Check if repoPath is actually a repository
        const parentType = hierarchyService.getNodeType(validatedRepoPath);

        if (parentType === 'root') {
            // Auto-promote root folder to repository
            console.log('[Hierarchy] Auto-promoting root folder to repository:', repoPath);
            hierarchyService.writeHierarchyMeta(validatedRepoPath, {
                type: 'repository',
                createdAt: Date.now(),
                name: path.basename(validatedRepoPath)
            });
        }

        if (parentType === 'project') {
            // Cannot create a project inside another project
            console.error('[Hierarchy] Blocked: Cannot create project inside project:', repoPath);
            throw new Error('Cannot create a project inside another project. Projects must be inside a Repository.');
        }

        const now = Date.now();
        const projectPath = path.join(validatedRepoPath, projectName);
        const contentPath = path.join(projectPath, PROJECT_CONTENT_FILE);
        const diffCommitPath = path.join(projectPath, DIFF_COMMIT_DIR);
        const commitsPath = path.join(diffCommitPath, COMMITS_FILE);

        try {
            // Create project folder
            fs.mkdirSync(projectPath, { recursive: true });

            // Write hierarchy metadata to mark this as a project
            hierarchyService.writeHierarchyMeta(projectPath, {
                type: 'project',
                createdAt: now,
                name: projectName
            });

            // Create .diff-commit folder
            fs.mkdirSync(diffCommitPath, { recursive: true });

            // Create content.md
            fs.writeFileSync(contentPath, initialContent, 'utf-8');

            // Create empty commits.json
            fs.writeFileSync(commitsPath, '[]', 'utf-8');

            // Create metadata.json with stable UUID + createdAt
            const projectId = crypto.randomUUID();
            writeProjectMetadata(diffCommitPath, { createdAt: now, id: projectId });

            console.log('[Hierarchy] Created project with metadata:', projectPath);
            return {
                id: projectId,
                name: projectName,
                content: initialContent,
                createdAt: now,
                updatedAt: now,
                path: projectPath,
                repositoryPath: validatedRepoPath
            };
        } catch (e) {
            console.error('Failed to create project:', e);
            throw e;
        }
    });

    // Rename Project (rename folder on disk)
    ipcMain.handle('rename-project', async (event, projectPath: string, newName: string) => {
        if (!projectPath || !newName) return null;
        const validatedProjectPath = assertProjectPath(projectPath);

        // Helper to check if path exists
        const pathExists = async (p: string): Promise<boolean> => {
            try {
                await fs.promises.access(p);
                return true;
            } catch {
                return false;
            }
        };

        // Validate that projectPath exists and is a directory
        if (!(await pathExists(validatedProjectPath))) {
            throw new Error('Project folder does not exist');
        }

        const stats = await fs.promises.stat(validatedProjectPath);
        if (!stats.isDirectory()) {
            throw new Error('Project path is not a directory');
        }

        // Validate this is actually a project folder by checking for project markers
        const [hasHierarchyMeta, hasDiffCommit, hasContentFile] = await Promise.all([
            pathExists(path.join(validatedProjectPath, '.hierarchy-meta.json')),
            pathExists(path.join(validatedProjectPath, '.diff-commit')),
            pathExists(path.join(validatedProjectPath, 'content.md'))
        ]);

        if (!hasHierarchyMeta && !hasDiffCommit && !hasContentFile) {
            throw new Error('Invalid project folder: missing project markers (.hierarchy-meta.json, .diff-commit, or content.md)');
        }
        const trimmedName = newName.trim();
        if (!trimmedName) return null;

        const parentPath = path.dirname(validatedProjectPath);
        const newPath = path.join(parentPath, trimmedName);

        // Check if new name already exists
        // Allow case-only rename on Windows/Mac (case-insensitive FS)
        const isSamePath = validatedProjectPath.toLowerCase() === newPath.toLowerCase();

        if (!isSamePath && (await pathExists(newPath))) {
            throw new Error(`A project named "${trimmedName}" already exists`);
        }

        try {
            // Rename the folder (async)
            await fs.promises.rename(validatedProjectPath, newPath);

            // Update hierarchy metadata with new name
            const metaPath = path.join(newPath, '.hierarchy-meta.json');
            let createdAt = Date.now();
            if (await pathExists(metaPath)) {
                const metaContent = await fs.promises.readFile(metaPath, 'utf-8');
                const meta = JSON.parse(metaContent);
                createdAt = meta.createdAt || createdAt;
                meta.name = trimmedName;
                await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
            }

            // Read project content from content.md
            const contentPath = path.join(newPath, PROJECT_CONTENT_FILE);
            let content = '';
            if (await pathExists(contentPath)) {
                content = await fs.promises.readFile(contentPath, 'utf-8');
            }

            // Read the stable UUID from the moved project's metadata (preserve it across rename)
            const diffCommitPath = path.join(newPath, DIFF_COMMIT_DIR);
            const renamedMetadata = readProjectMetadata(diffCommitPath);
            const renamedProjectId = renamedMetadata?.id || trimmedName;

            console.log('[Project] Renamed project:', validatedProjectPath, '->', newPath);

            // Return complete project object
            return {
                id: renamedProjectId,
                name: trimmedName,
                content,
                createdAt,
                updatedAt: Date.now(),
                path: newPath,
                repositoryPath: parentPath
            };
        } catch (e) {
            console.error('Failed to rename project:', e);
            throw e;
        }
    });

    // Move Project to another Repository (move folder on disk)
    ipcMain.handle('move-project-to-repository', async (event, projectPath: string, targetRepoPath: string) => {
        if (!projectPath || !targetRepoPath) return null;
        const validatedProjectPath = assertProjectPath(projectPath);
        const validatedTargetRepoPath = assertRepositoryPath(targetRepoPath);

        const pathExists = async (p: string): Promise<boolean> => {
            try {
                await fs.promises.access(p);
                return true;
            } catch {
                return false;
            }
        };

        if (!(await pathExists(validatedProjectPath))) {
            throw new Error('Project folder does not exist');
        }

        const sourceParentPath = path.dirname(validatedProjectPath);
        if (sourceParentPath.toLowerCase() === validatedTargetRepoPath.toLowerCase()) {
            // No move needed
            const projectName = path.basename(validatedProjectPath);
            const contentPath = path.join(validatedProjectPath, PROJECT_CONTENT_FILE);
            const content = (await pathExists(contentPath)) ? await fs.promises.readFile(contentPath, 'utf-8') : '';
            const metadata = readProjectMetadata(path.join(validatedProjectPath, DIFF_COMMIT_DIR));
            const stats = await fs.promises.stat(validatedProjectPath);
            return {
                id: metadata?.id || projectName,
                name: projectName,
                content,
                createdAt: metadata?.createdAt || stats.birthtimeMs,
                updatedAt: Date.now(),
                path: validatedProjectPath,
                repositoryPath: sourceParentPath
            };
        }

        const projectName = path.basename(validatedProjectPath);
        const targetProjectPath = path.join(validatedTargetRepoPath, projectName);
        if (await pathExists(targetProjectPath)) {
            throw new Error(`A project named "${projectName}" already exists in target repository`);
        }

        try {
            await fs.promises.rename(validatedProjectPath, targetProjectPath);

            const metaPath = path.join(targetProjectPath, '.hierarchy-meta.json');
            if (await pathExists(metaPath)) {
                const metaContent = await fs.promises.readFile(metaPath, 'utf-8');
                const meta = JSON.parse(metaContent);
                meta.type = 'project';
                meta.name = projectName;
                await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
            }

            const contentPath = path.join(targetProjectPath, PROJECT_CONTENT_FILE);
            const content = (await pathExists(contentPath))
                ? await fs.promises.readFile(contentPath, 'utf-8')
                : '';

            const diffCommitPath = path.join(targetProjectPath, DIFF_COMMIT_DIR);
            const metadata = readProjectMetadata(diffCommitPath);
            const stats = await fs.promises.stat(targetProjectPath);

            return {
                id: metadata?.id || projectName,
                name: projectName,
                content,
                createdAt: metadata?.createdAt || stats.birthtimeMs,
                updatedAt: Date.now(),
                path: targetProjectPath,
                repositoryPath: validatedTargetRepoPath
            };
        } catch (e) {
            console.error('Failed to move project:', e);
            throw e;
        }
    });

    // Save Project Content (write to content.md in project folder)
    ipcMain.handle('save-project-content', async (event, projectPath, content) => {
        if (!projectPath) return false;
        try {
            const validatedProjectPath = assertProjectPath(projectPath);
            const contentPath = path.join(validatedProjectPath, PROJECT_CONTENT_FILE);
            fs.writeFileSync(contentPath, content, 'utf-8');
            return true;
        } catch (e) {
            console.error('Failed to save project content:', e);
            return false;
        }
    });

    // Load Project Content (read from content.md in project folder)
    ipcMain.handle('load-project-content', async (event, projectPath) => {
        if (!projectPath) return '';
        try {
            const validatedProjectPath = assertProjectPath(projectPath);
            const contentPath = path.join(validatedProjectPath, PROJECT_CONTENT_FILE);
            if (fs.existsSync(contentPath)) {
                return fs.readFileSync(contentPath, 'utf-8');
            }
            return '';
        } catch (e) {
            console.error('Failed to load project content:', e);
            return '';
        }
    });

    // Load Project Commits (from projectPath/.diff-commit/commits.json)
    ipcMain.handle('load-project-commits', async (event, projectPath) => {
        if (!projectPath) return [];
        const validatedProjectPath = assertProjectPath(projectPath);

        const commitsPath = path.join(validatedProjectPath, DIFF_COMMIT_DIR, COMMITS_FILE);

        try {
            if (fs.existsSync(commitsPath)) {
                const data = fs.readFileSync(commitsPath, 'utf-8');
                return JSON.parse(data);
            }
            return [];
        } catch (e) {
            console.error('Failed to load commits:', e);
            return [];
        }
    });

    // Save Project Commits (to projectPath/.diff-commit/commits.json)
    ipcMain.handle('save-project-commits', async (event, projectPath, commits) => {
        if (!projectPath) return false;
        const validatedProjectPath = assertProjectPath(projectPath);

        const diffCommitPath = path.join(validatedProjectPath, DIFF_COMMIT_DIR);
        const commitsPath = path.join(diffCommitPath, COMMITS_FILE);

        try {
            if (!fs.existsSync(diffCommitPath)) {
                fs.mkdirSync(diffCommitPath, { recursive: true });
            }
            fs.writeFileSync(commitsPath, JSON.stringify(commits, null, 2), 'utf-8');
            return true;
        } catch (e) {
            console.error('Failed to save commits:', e);
            return false;
        }
    });

    // Delete Project (remove folder and all its contents from disk)
    ipcMain.handle('delete-project', async (event, projectPath: string) => {
        if (!projectPath) return false;
        try {
            const validatedProjectPath = assertProjectPath(projectPath);
            await fs.promises.rm(validatedProjectPath, { recursive: true, force: true });
            console.log('[Project] Deleted project:', validatedProjectPath);
            return true;
        } catch (e) {
            console.error('Failed to delete project:', e);
            return false;
        }
    });

    // ========================================
    // Hierarchy Enforcement System IPC Handlers
    // ========================================

    // Get the type of a directory node (root, repository, or project)
    ipcMain.handle('hierarchy-get-node-type', async (event, dirPath: string) => {
        if (!dirPath) return 'root';
        try {
            return hierarchyService.getNodeType(dirPath);
        } catch (e) {
            console.error('[Hierarchy] Failed to get node type:', e);
            return 'root';
        }
    });

    // Validate if a node can be created
    ipcMain.handle('hierarchy-validate-create', async (event, parentPath: string, name: string, childType: string) => {
        if (!parentPath || !name || !childType) {
            return { valid: false, error: 'Missing required parameters' };
        }
        try {
            return hierarchyService.validateCreate(parentPath, name, childType as NodeType);
        } catch (e) {
            console.error('[Hierarchy] Failed to validate create:', e);
            return { valid: false, error: String(e) };
        }
    });

    // Create a new node (repository or project) with hierarchy metadata
    ipcMain.handle('hierarchy-create-node', async (event, parentPath: string, name: string, nodeType: string) => {
        if (!parentPath || !name || !nodeType) {
            throw new Error('Missing required parameters');
        }
        try {
            const result = hierarchyService.createNode(parentPath, name, nodeType as NodeType);
            if (!result) throw new Error('Failed to create node');

            // Return the created node info
            return {
                path: result.path,
                type: result.meta.type,
                name: result.meta.name,
                createdAt: result.meta.createdAt
            };
        } catch (e) {
            console.error('[Hierarchy] Failed to create node:', e);
            throw e;
        }
    });

    // Get hierarchy information for a directory
    ipcMain.handle('hierarchy-get-info', async (event, dirPath: string) => {
        if (!dirPath) return null;
        try {
            return hierarchyService.getHierarchyInfo(dirPath);
        } catch (e) {
            console.error('[Hierarchy] Failed to get info:', e);
            return null;
        }
    });

    // Create Repository (Create a new folder on disk)
    ipcMain.handle('create-repository', async () => {
        const reposRootPath = getReposRootPath();
        const defaultPath = path.join(reposRootPath, 'New Repository');

        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Create New Repository Folder',
            defaultPath: defaultPath,
            buttonLabel: 'Create',
            nameFieldLabel: 'Folder Name'
        });

        if (result.canceled || !result.filePath) return null;

        const repoPath = result.filePath;
        if (!isPathInsideRoot(repoPath, reposRootPath)) {
            dialog.showErrorBox(
                'Invalid Repository Location',
                `Repositories must be inside the fixed root folder:\n${reposRootPath}\n\nChange the root location in Settings if needed.`
            );
            return null;
        }

        try {
            // HIERARCHY VALIDATION: Check if ANY ancestor is a repo or project
            // This catches cases where user types nested paths like "newFolder\subFolder\repo"
            const hierarchyCheck = hierarchyService.isInsideHierarchyNode(repoPath);

            if (hierarchyCheck.isInside) {
                const ancestorType = hierarchyCheck.ancestorType;
                const ancestorName = path.basename(hierarchyCheck.ancestorPath || '');

                if (ancestorType === 'repository') {
                    dialog.showErrorBox(
                        'Invalid Location',
                        `Cannot create a repository inside the repository "${ancestorName}".\n\n` +
                        'Repositories can only contain Projects. Please choose a location outside of any existing repository.'
                    );
                    console.log('[Hierarchy] Blocked: Path is inside repository:', hierarchyCheck.ancestorPath);
                    return null;
                }

                if (ancestorType === 'project') {
                    dialog.showErrorBox(
                        'Invalid Location',
                        `Cannot create a repository inside the project "${ancestorName}".\n\n` +
                        'Projects can only contain commits. Please choose a location outside of any existing project.'
                    );
                    console.log('[Hierarchy] Blocked: Path is inside project:', hierarchyCheck.ancestorPath);
                    return null;
                }
            }

            // Create the repository folder
            fs.mkdirSync(repoPath, { recursive: true });

            // Write hierarchy metadata to mark this as a repository
            const now = Date.now();
            hierarchyService.writeHierarchyMeta(repoPath, {
                type: 'repository',
                createdAt: now,
                name: path.basename(repoPath)
            });

            console.log('[Hierarchy] Created repository with metadata:', repoPath);

            // AUTO-CREATE dynamic project so user can start working immediately
            const defaultProjectName = getFormattedTimestamp();
            const projectPath = path.join(repoPath, defaultProjectName);
            const contentPath = path.join(projectPath, PROJECT_CONTENT_FILE);
            const diffCommitPath = path.join(projectPath, DIFF_COMMIT_DIR);
            const commitsPath = path.join(diffCommitPath, COMMITS_FILE);

            // Create project folder
            fs.mkdirSync(projectPath, { recursive: true });

            // Write hierarchy metadata for the project
            hierarchyService.writeHierarchyMeta(projectPath, {
                type: 'project',
                createdAt: now,
                name: defaultProjectName
            });

            // Create .diff-commit folder
            fs.mkdirSync(diffCommitPath, { recursive: true });

            // Create empty content.md
            fs.writeFileSync(contentPath, '', 'utf-8');

            // Create empty commits.json
            fs.writeFileSync(commitsPath, '[]', 'utf-8');

            // Create metadata.json
            writeProjectMetadata(diffCommitPath, { createdAt: now });

            console.log('[Hierarchy] Auto-created default project:', projectPath);

            const defaultProject = {
                id: defaultProjectName,
                name: defaultProjectName,
                content: '',
                createdAt: now,
                updatedAt: now,
                path: projectPath,
                repositoryPath: repoPath
            };

            return { path: repoPath, projects: [defaultProject] };
        } catch (e) {
            console.error('Failed to create repository:', e);
            throw e;
        }
    });

    // Save Project Bundle (Export project content + commits as folder)
    ipcMain.handle('save-project-bundle', async (event, projectPath) => {
        if (!projectPath) return null;
        const validatedProjectPath = assertProjectPath(projectPath);
        const bundleSource = readProjectBundleSource(
            validatedProjectPath,
            { existsSync: fs.existsSync, readFileSync: fs.readFileSync },
            PROJECT_CONTENT_FILE,
            DIFF_COMMIT_DIR,
            COMMITS_FILE
        );

        // Show save dialog for the bundle folder
        const docsPath = app.getPath('documents');
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Project Bundle',
            defaultPath: path.join(docsPath, `${bundleSource.projectName}-bundle`),
            buttonLabel: 'Save Bundle'
        });

        if (result.canceled || !result.filePath) return null;

        try {
            const bundleDir = result.filePath;
            fs.mkdirSync(bundleDir, { recursive: true });
            fs.writeFileSync(path.join(bundleDir, PROJECT_CONTENT_FILE), bundleSource.projectContent, 'utf-8');
            fs.writeFileSync(path.join(bundleDir, COMMITS_FILE), bundleSource.commitsContent, 'utf-8');
            return bundleDir;
        } catch (e) {
            console.error('Failed to save project bundle:', e);
            throw e;
        }
    });

    const GRAPH_FILE = 'project-graph.json';
    ipcMain.handle('graph:load', async (_event, repoPath: string) => {
        const validatedRepoPath = assertRepositoryPath(repoPath);
        const graphPath = path.join(validatedRepoPath, DIFF_COMMIT_DIR, GRAPH_FILE);

        if (!fs.existsSync(graphPath)) {
            return { nodes: [], edges: [] };
        }

        try {
            const raw = fs.readFileSync(graphPath, 'utf-8');
            const parsed = JSON.parse(raw);
            const nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
            const edges = Array.isArray(parsed?.edges) ? parsed.edges : [];
            return { nodes, edges };
        } catch (error) {
            console.warn('[Graph] Failed to parse graph file, returning empty graph:', error);
            return { nodes: [], edges: [] };
        }
    });

    ipcMain.handle('graph:save', async (_event, repoPath: string, data: {
        nodes?: Array<{ id?: unknown; x?: unknown; y?: unknown }>;
        edges?: Array<{ from?: unknown; to?: unknown }>;
    }) => {
        const validatedRepoPath = assertRepositoryPath(repoPath);
        const graphDir = path.join(validatedRepoPath, DIFF_COMMIT_DIR);
        const graphPath = path.join(graphDir, GRAPH_FILE);

        const nodes = Array.isArray(data?.nodes)
            ? data.nodes
                .filter((node): node is { id: string; x: number; y: number } =>
                    typeof node?.id === 'string' &&
                    typeof node?.x === 'number' &&
                    Number.isFinite(node.x) &&
                    typeof node?.y === 'number' &&
                    Number.isFinite(node.y))
                .map((node) => ({ id: node.id, x: node.x, y: node.y }))
            : [];
        const edges = Array.isArray(data?.edges)
            ? data.edges
                .filter((edge): edge is { from: string; to: string } =>
                    typeof edge?.from === 'string' &&
                    typeof edge?.to === 'string')
                .map((edge) => ({ from: edge.from, to: edge.to }))
            : [];

        fs.mkdirSync(graphDir, { recursive: true });
        fs.writeFileSync(graphPath, JSON.stringify({ nodes, edges }, null, 2), 'utf-8');
        return true;
    });

    // ========================================
    // OpenRouter API Handlers (Secure - key stays in main process)
    // ========================================

    const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
    const openRouterRequests = new Map<string, AbortController>();

    async function executeOpenRouterChatCompletion(
        payload: {
            model: string;
            messages: Array<{ role: string; content: unknown }>;
            temperature?: number;
            response_format?: unknown;
            generation_config?: unknown;
            plugins?: Array<{ id: string;[key: string]: unknown }>;
        },
        controller?: AbortController
    ): Promise<unknown> {
        const apiKey = getSecureApiKey('openrouter');
        if (!apiKey) {
            throw new Error('OpenRouter API key not configured. Please set your API key in Settings.');
        }

        if (!payload?.model || !Array.isArray(payload.messages) || payload.messages.length === 0) {
            throw new Error('Invalid OpenRouter payload');
        }
        if (payload.plugins !== undefined) {
            if (!Array.isArray(payload.plugins)) {
                throw new Error('Invalid OpenRouter plugins payload');
            }
            for (const plugin of payload.plugins) {
                if (!plugin || typeof plugin !== 'object' || typeof plugin.id !== 'string' || plugin.id.trim().length === 0) {
                    throw new Error('Invalid OpenRouter plugin entry');
                }
            }
        }

        const activeController = controller || new AbortController();
        let didTimeout = false;
        const timeoutId = setTimeout(() => {
            didTimeout = true;
            activeController.abort();
        }, 60000);

        try {
            const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: activeController.signal,
            });

            const contentType = response.headers.get('content-type') || '';
            const body = contentType.includes('application/json')
                ? await response.json()
                : await response.text();

            if (!response.ok) {
                const errorDetails = typeof body === 'string'
                    ? body
                    : JSON.stringify(body);
                throw new Error(`OpenRouter API error: ${response.status} - ${errorDetails}`);
            }

            return body;
        } catch (error) {
            if (didTimeout) {
                throw new Error('OpenRouter request timed out after 60 seconds');
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Fetch all available models from OpenRouter
     */
    ipcMain.handle('openrouter:fetch-models', async () => {
        const apiKey = getSecureApiKey('openrouter');
        if (!apiKey) {
            throw new Error('OpenRouter API key not configured. Please set your API key in the app settings or .env file.');
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            const response = await fetch(`${OPENROUTER_API_BASE}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
            }

            const data = await response.json();
            const models = Array.isArray(data?.data) ? data.data as OpenRouterModel[] : [];

            if (models.length === 0) {
                console.warn('[OpenRouter] No models returned from API');
            }

            return models.map(normalizeOpenRouterModel);
        } catch (e) {
            console.error('[OpenRouter] Failed to fetch models:', e);
            throw e;
        }
    });

    /**
     * Fetch pricing for a specific model
     */
    ipcMain.handle('openrouter:fetch-pricing', async (event, modelId: string) => {
        const apiKey = getSecureApiKey('openrouter');
        if (!apiKey) {
            throw new Error('OpenRouter API key not configured. Please set your API key in the app settings or .env file.');
        }

        if (!modelId) {
            throw new Error('Model ID is required');
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            const response = await fetch(`${OPENROUTER_API_BASE}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`OpenRouter API error: ${response.status}`);
            }

            const data = await response.json();
            const models = Array.isArray(data?.data) ? data.data as OpenRouterModel[] : [];
            const model = models.find((m) => m.id === modelId);

            if (!model) {
                throw new Error(`Model not found: ${modelId}`);
            }

            return {
                inputPrice: tokenPriceToMillionPrice(model.pricing?.prompt),
                outputPrice: tokenPriceToMillionPrice(model.pricing?.completion),
            };
        } catch (e) {
            console.error('[OpenRouter] Failed to fetch pricing:', e);
            throw e;
        }
    });

    ipcMain.handle('openrouter:chat-completions', async (_event, payload: {
        model: string;
        messages: Array<{ role: string; content: unknown }>;
        temperature?: number;
        response_format?: unknown;
        generation_config?: unknown;
        plugins?: Array<{ id: string;[key: string]: unknown }>;
    }) => executeOpenRouterChatCompletion(payload));

    ipcMain.handle('openrouter:chat-completions-start', async (_event, requestId: string, payload: {
        model: string;
        messages: Array<{ role: string; content: unknown }>;
        temperature?: number;
        response_format?: unknown;
        generation_config?: unknown;
        plugins?: Array<{ id: string;[key: string]: unknown }>;
    }) => {
        if (!requestId || typeof requestId !== 'string') {
            throw new Error('Invalid request ID');
        }
        if (openRouterRequests.has(requestId)) {
            throw new Error('Duplicate OpenRouter request ID');
        }

        const controller = new AbortController();
        openRouterRequests.set(requestId, controller);
        try {
            return await executeOpenRouterChatCompletion(payload, controller);
        } finally {
            openRouterRequests.delete(requestId);
        }
    });

    ipcMain.handle('openrouter:chat-completions-cancel', async (_event, requestId: string) => {
        if (!requestId || typeof requestId !== 'string') {
            return false;
        }
        const controller = openRouterRequests.get(requestId);
        if (!controller) {
            return false;
        }
        controller.abort();
        openRouterRequests.delete(requestId);
        return true;
    });

    // ========================================
    // Artificial Analysis API Handlers (Secure - key stays in main process)
    // ========================================

    const ARTIFICIAL_ANALYSIS_API_BASE = 'https://artificialanalysis.ai/api/v2';

    /**
     * Fetch model benchmarks from Artificial Analysis
     * Returns intelligence scores, speed metrics, and pricing data
     */
    ipcMain.handle('artificialanalysis:fetch-benchmarks', async () => {
        const apiKey = getSecureApiKey('artificialAnalysis');
        if (!apiKey) {
            throw new Error('Artificial Analysis API key not configured. Please set your API key in the app settings or .env file.');
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            const response = await fetch(`${ARTIFICIAL_ANALYSIS_API_BASE}/data/llms/models`, {
                method: 'GET',
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Artificial Analysis API error: ${response.status} - ${error}`);
            }

            const data = await response.json();

            // Debug logging to understand response structure
            console.log('[ArtificialAnalysis] Response type:', typeof data);
            console.log('[ArtificialAnalysis] Is array:', Array.isArray(data));
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                console.log('[ArtificialAnalysis] Object keys:', Object.keys(data));
                // Check for common data wrapper keys
                if (data.data) console.log('[ArtificialAnalysis] data.data length:', Array.isArray(data.data) ? data.data.length : 'not array');
                if (data.models) console.log('[ArtificialAnalysis] data.models length:', Array.isArray(data.models) ? data.models.length : 'not array');
            }

            return data;
        } catch (e) {
            console.error('[ArtificialAnalysis] Failed to fetch benchmarks:', e);
            throw e;
        }
    });

    // ========================================
    // Folder & Workspace IPC Handlers
    // ========================================

    ipcMain.handle('get-workspace-path', async () => {
        if (!folderInitializer) {
            throw new Error('Application not initialized');
        }
        return folderInitializer.getWorkspacePath();
    });

    ipcMain.handle('get-repos-path', async () => {
        if (!folderInitializer) {
            throw new Error('Application not initialized');
        }
        return folderInitializer.getDefaultRepoPath();
    });

    ipcMain.handle('set-custom-workspace', async (_, customPath: string) => {
        if (!folderInitializer) {
            throw new Error('Application not initialized');
        }
        try {
            folderInitializer.setWorkspacePath(customPath);
            const result = await folderInitializer.initializeDefaultFolders();
            return result;
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle('create-folder-at-path', async (_, folderPath: string) => {
        return await getFolderInitializer().createAtPath(folderPath);
    });

    createWindow();
});

/**
 * Get the initialized folder initializer.
 * Throws an error if called before initializeApp().
 */
export function getFolderInitializer(): AppFolderInitializer {
    if (!folderInitializer) {
        throw new Error('Application not initialized: folderInitializer is null');
    }
    return folderInitializer;
}

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
