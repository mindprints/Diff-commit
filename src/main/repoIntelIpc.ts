import { ipcMain } from 'electron';
import { RepoIntelIndexService } from './repoIntelIndexService';
import type { RepoIntelBuildOptions, RepoIntelQueryOptions } from '../shared/repoIntelTypes';

export function registerRepoIntelHandlers(service: RepoIntelIndexService = new RepoIntelIndexService()): void {
    ipcMain.handle('repo-intel:build-index', async (_event, repoPath: string, options?: RepoIntelBuildOptions) => {
        return service.buildIndex(repoPath, options);
    });

    ipcMain.handle('repo-intel:get-index-status', async (_event, repoPath: string) => {
        return service.getIndexStatus(repoPath);
    });

    ipcMain.handle('repo-intel:clear-index', async (_event, repoPath: string) => {
        return service.clearIndex(repoPath);
    });

    ipcMain.handle('repo-intel:query-index', async (_event, repoPath: string, query: string, options?: RepoIntelQueryOptions) => {
        return service.queryIndex(repoPath, query, options);
    });

    ipcMain.handle('repo-intel:find-redundancy', async (_event, repoPath: string, options?: { threshold?: number; topK?: number }) => {
        return service.findRedundancy(repoPath, options);
    });
}

