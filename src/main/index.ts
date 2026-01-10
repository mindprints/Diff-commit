import { app, BrowserWindow, ipcMain, Menu, dialog, MenuItemConstructorOptions, safeStorage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import dotenv from 'dotenv';
import fs from 'fs';
import * as hierarchyService from './hierarchyService';
import { AppFolderInitializer } from './AppFolderInitializer';
import { registerHierarchyHandlers } from './hierarchy-ipc-handlers';

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
    ipcMain.handle('get-api-key', (event, provider) => {
        return getSecureApiKey(provider);
    });

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

    /**
     * Check if a directory is a valid project folder.
     * A project folder contains a .diff-commit directory.
     */
    function isProjectFolder(dirPath: string): boolean {
        const diffCommitPath = path.join(dirPath, DIFF_COMMIT_DIR);
        return fs.existsSync(diffCommitPath) && fs.statSync(diffCommitPath).isDirectory();
    }

    // Open Repository (Select Folder) - scans for project folders
    ipcMain.handle('open-repository', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory', 'createDirectory']
        });

        if (result.canceled || result.filePaths.length === 0) return null;

        const repoPath = result.filePaths[0];
        return await scanRepository(repoPath);
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

                        projects.push({
                            id: item.name,  // Folder name
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

        // HIERARCHY VALIDATION: Check if repoPath is actually a repository
        const parentType = hierarchyService.getNodeType(repoPath);

        if (parentType === 'root') {
            // Cannot create a project at root level
            console.error('[Hierarchy] Blocked: Cannot create project at root level:', repoPath);
            throw new Error('Cannot create a project here. Please open or create a Repository first.');
        }

        if (parentType === 'project') {
            // Cannot create a project inside another project
            console.error('[Hierarchy] Blocked: Cannot create project inside project:', repoPath);
            throw new Error('Cannot create a project inside another project. Projects must be inside a Repository.');
        }

        const now = Date.now();
        const projectPath = path.join(repoPath, projectName);
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

            // Create metadata.json with createdAt
            writeProjectMetadata(diffCommitPath, { createdAt: now });

            console.log('[Hierarchy] Created project with metadata:', projectPath);
            return {
                id: projectName,
                name: projectName,
                content: initialContent,
                createdAt: now,
                updatedAt: now,
                path: projectPath,
                repositoryPath: repoPath
            };
        } catch (e) {
            console.error('Failed to create project:', e);
            throw e;
        }
    });

    // Rename Project (rename folder on disk)
    ipcMain.handle('rename-project', async (event, projectPath: string, newName: string) => {
        if (!projectPath || !newName) return null;

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
        if (!(await pathExists(projectPath))) {
            throw new Error('Project folder does not exist');
        }

        const stats = await fs.promises.stat(projectPath);
        if (!stats.isDirectory()) {
            throw new Error('Project path is not a directory');
        }

        // Validate this is actually a project folder by checking for project markers
        const [hasHierarchyMeta, hasDiffCommit, hasContentFile] = await Promise.all([
            pathExists(path.join(projectPath, '.hierarchy-meta.json')),
            pathExists(path.join(projectPath, '.diff-commit')),
            pathExists(path.join(projectPath, 'content.md'))
        ]);

        if (!hasHierarchyMeta && !hasDiffCommit && !hasContentFile) {
            throw new Error('Invalid project folder: missing project markers (.hierarchy-meta.json, .diff-commit, or content.md)');
        }
        const trimmedName = newName.trim();
        if (!trimmedName) return null;

        const parentPath = path.dirname(projectPath);
        const newPath = path.join(parentPath, trimmedName);

        // Check if new name already exists
        // Allow case-only rename on Windows/Mac (case-insensitive FS)
        const isSamePath = projectPath.toLowerCase() === newPath.toLowerCase();

        if (!isSamePath && (await pathExists(newPath))) {
            throw new Error(`A project named "${trimmedName}" already exists`);
        }

        try {
            // Rename the folder (async)
            await fs.promises.rename(projectPath, newPath);

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

            console.log('[Project] Renamed project:', projectPath, '->', newPath);

            // Return complete project object
            return {
                id: trimmedName,
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

    // Save Project Content (write to content.md in project folder)
    ipcMain.handle('save-project-content', async (event, projectPath, content) => {
        if (!projectPath) return false;
        try {
            const contentPath = path.join(projectPath, PROJECT_CONTENT_FILE);
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
            const contentPath = path.join(projectPath, PROJECT_CONTENT_FILE);
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

        const commitsPath = path.join(projectPath, DIFF_COMMIT_DIR, COMMITS_FILE);

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

        const diffCommitPath = path.join(projectPath, DIFF_COMMIT_DIR);
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
            return hierarchyService.validateCreate(parentPath, name, childType as any);
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
            const result = hierarchyService.createNode(parentPath, name, nodeType as any);
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
        const docsPath = app.getPath('documents');
        // Clear name that indicates this is a single repository for your projects
        const defaultPath = path.join(docsPath, 'My Writing Projects');

        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Create New Repository Folder',
            defaultPath: defaultPath,
            buttonLabel: 'Create',
            properties: ['createDirectory' as any],
            nameFieldLabel: 'Folder Name'
        });

        if (result.canceled || !result.filePath) return null;

        const repoPath = result.filePath;

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

    // ========================================
    // OpenRouter API Handlers (Secure - key stays in main process)
    // ========================================

    const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

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
            const models = Array.isArray(data?.data) ? data.data : [];

            if (models.length === 0) {
                console.warn('[OpenRouter] No models returned from API');
            }

            // Parse models for the renderer
            return models.map((model: {
                id: string;
                name: string;
                context_length?: number;
                pricing?: { prompt?: string; completion?: string };
                architecture?: { modality?: string };
                description?: string;
            }) => ({
                id: model.id,
                name: model.name,
                provider: extractProviderName(model.id),
                contextWindow: model.context_length,
                inputPrice: parseFloat(model.pricing?.prompt || '0') * 1_000_000,
                outputPrice: parseFloat(model.pricing?.completion || '0') * 1_000_000,
                modality: parseModality(model.architecture?.modality),
                description: model.description,
            }));
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
            const models = data.data || [];
            const model = models.find((m: any) => m.id === modelId);

            if (!model) {
                throw new Error(`Model not found: ${modelId}`);
            }

            return {
                inputPrice: parseFloat(model.pricing?.prompt || '0') * 1_000_000,
                outputPrice: parseFloat(model.pricing?.completion || '0') * 1_000_000,
            };
        } catch (e) {
            console.error('[OpenRouter] Failed to fetch pricing:', e);
            throw e;
        }
    });

    // Helper: Extract provider name from model ID
    function extractProviderName(modelId: string): string {
        const parts = modelId.split('/');
        if (parts.length < 2) return 'Unknown';

        const providerSlug = parts[0];
        const providerMap: Record<string, string> = {
            'openai': 'OpenAI',
            'anthropic': 'Anthropic',
            'google': 'Google',
            'meta-llama': 'Meta',
            'mistralai': 'Mistral',
            'cohere': 'Cohere',
            'deepseek': 'DeepSeek',
            'perplexity': 'Perplexity',
            'x-ai': 'xAI',
            'amazon': 'Amazon',
            'microsoft': 'Microsoft',
            'nvidia': 'NVIDIA',
            'qwen': 'Qwen',
        };

        return providerMap[providerSlug.toLowerCase()] ||
            providerSlug.charAt(0).toUpperCase() + providerSlug.slice(1);
    }

    // Helper: Parse modality string
    function parseModality(modality?: string): string {
        if (!modality) return 'text';
        const inputPart = modality.split('->')[0] || modality;
        return inputPart.toLowerCase();
    }

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