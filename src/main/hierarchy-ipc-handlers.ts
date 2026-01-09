import { ipcMain } from 'electron';

/**
 * Register hierarchy-related IPC handlers
 * @param reposPath The path to the repositories folder
 */
export function registerHierarchyHandlers(reposPath: string) {
    console.log(`[Hierarchy] Initializing handlers with repos path: ${reposPath}`);

    // This could be used for path-based hierarchy rules in the future
    // For now it just ensures the repos path is logged and available if needed
}
