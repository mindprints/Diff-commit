import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const isDev = process.env.NODE_ENV === 'development';
const store = new Store();

function createWindow() {
    const mainWindow = new BrowserWindow({
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

app.whenReady().then(() => {
    // IPC Handlers for API Key
    ipcMain.handle('get-api-key', (event, provider) => {
        // Check store first, then environment variable
        const storeKey = `${provider}ApiKey`; // e.g., geminiApiKey

        // Map providers to env vars
        let envVar = undefined;
        if (provider === 'gemini') envVar = process.env.GEMINI_API_KEY;
        if (provider === 'openRouter') envVar = process.env.OPENROUTER_API_KEY;
        // Handle casing difference if user passes 'openrouter' vs 'openRouter'
        if (provider === 'openrouter') envVar = process.env.OPENROUTER_API_KEY;

        return store.get(storeKey) || envVar;
    });

    ipcMain.handle('set-api-key', (event, provider, apiKey) => {
        store.set(`${provider}ApiKey`, apiKey);
    });

    // Logging Handlers
    ipcMain.handle('log-usage', (event, logEntry) => {
        const logs = store.get('aiLogs') || [];
        // Limit logs to last 1000 entries to prevent infinite growth
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