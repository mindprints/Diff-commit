
import { AILogEntry } from './types';

export interface IElectronAPI {
    platform: string;
    getApiKey: (provider: string) => Promise<string>;
    setApiKey: (provider: string, apiKey: string) => Promise<void>;
    logUsage: (logEntry: AILogEntry) => Promise<boolean>;
    updateLogRating: (id: string, rating: number, feedback?: string) => Promise<boolean>;
    getLogs: () => Promise<AILogEntry[]>;
    clearLogs: () => Promise<boolean>;
}

declare global {
    interface Window {
        electron: IElectronAPI;
    }
}
