import { ipcMain } from 'electron';
import { RepoIntelIndexService } from './repoIntelIndexService';
import type { RepoIntelBuildOptions, RepoIntelQueryOptions } from '../shared/repoIntelTypes';

export function registerRepoIntelHandlers(service: RepoIntelIndexService = new RepoIntelIndexService()): void {
    ipcMain.removeHandler('repo-intel:build-index');
    ipcMain.handle('repo-intel:build-index', async (_event, repoPath: string, options?: RepoIntelBuildOptions) => {
        return service.buildIndex(repoPath, options);
    });

    ipcMain.removeHandler('repo-intel:get-index-status');
    ipcMain.handle('repo-intel:get-index-status', async (_event, repoPath: string) => {
        return service.getIndexStatus(repoPath);
    });

    ipcMain.removeHandler('repo-intel:clear-index');
    ipcMain.handle('repo-intel:clear-index', async (_event, repoPath: string) => {
        return service.clearIndex(repoPath);
    });

    ipcMain.removeHandler('repo-intel:query-index');
    ipcMain.handle('repo-intel:query-index', async (_event, repoPath: string, query: string, options?: RepoIntelQueryOptions) => {
        return service.queryIndex(repoPath, query, options);
    });

    ipcMain.removeHandler('repo-intel:find-redundancy');
    ipcMain.handle('repo-intel:find-redundancy', async (_event, repoPath: string, options?: { threshold?: number; topK?: number }) => {
        return service.findRedundancy(repoPath, options);
    });
}

