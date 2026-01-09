import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { NodeType, HIERARCHY_META_FILE } from './hierarchyTypes';

/**
 * Initialize application folders on startup
 */
export class AppFolderInitializer {
    private appDataPath: string;
    private workspacePath: string;

    constructor() {
        // Get platform-specific app data directory
        // On Windows: C:\Users\<username>\AppData\Roaming\<app-name>
        this.appDataPath = app.getPath('userData');

        // Set your main workspace folder path
        this.workspacePath = path.join(this.appDataPath, 'workspace');
    }

    /**
     * Helper to check if a path exists asynchronously
     */
    private async existsAsync(p: string): Promise<boolean> {
        try {
            await fs.promises.access(p);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Create default folder structure
     */
    async initializeDefaultFolders(): Promise<{ success: boolean; paths: string[]; error?: string }> {
        const createdPaths: string[] = [];

        try {
            // Create main workspace folder
            if (!(await this.existsAsync(this.workspacePath))) {
                await fs.promises.mkdir(this.workspacePath, { recursive: true });
                console.log(`Created workspace folder: ${this.workspacePath}`);
                createdPaths.push(this.workspacePath);
            }

            // Create additional default folders
            const reposPath = path.join(this.workspacePath, 'repos');
            const defaultFolders = [
                reposPath,                                   // For repositories
                path.join(this.workspacePath, 'temp'),       // Temporary files
                path.join(this.workspacePath, 'exports'),    // Export directory
                path.join(this.workspacePath, 'backups'),    // Backups
            ];

            for (const folder of defaultFolders) {
                if (!(await this.existsAsync(folder))) {
                    await fs.promises.mkdir(folder, { recursive: true });
                    console.log(`Created folder: ${folder}`);
                    createdPaths.push(folder);
                }
            }

            // HIERARCHY FIX: Create a "Default" repository folder and mark it correctly
            const defaultRepoPath = path.join(reposPath, 'Default');
            if (!(await this.existsAsync(defaultRepoPath))) {
                await fs.promises.mkdir(defaultRepoPath, { recursive: true });
                console.log(`Created default repository folder: ${defaultRepoPath}`);
                createdPaths.push(defaultRepoPath);

                // Mark it as a repository so projects can be created inside it
                await this.writeRepoMeta(defaultRepoPath, 'Default');
            }

            // Create a welcome README file
            const readmePath = path.join(this.workspacePath, 'README.txt');
            if (!(await this.existsAsync(readmePath))) {
                const welcomeText = `Welcome to Your Application!

This folder contains all your application data.

Directory Structure:
- repos/    : Your repositories
  - Default/: Default repository for your projects
- temp/     : Temporary files (safe to delete)
- exports/  : Exported data
- backups/  : Backup files

Created: ${new Date().toLocaleString()}
`;
                await fs.promises.writeFile(readmePath, welcomeText, 'utf-8');
                createdPaths.push(readmePath);
            }

            return {
                success: true,
                paths: createdPaths
            };

        } catch (error) {
            console.error('Error creating folders:', error);
            return {
                success: false,
                paths: createdPaths,
                error: (error as Error).message
            };
        }
    }

    /**
     * Write hierarchy metadata for a repository (async)
     */
    private async writeRepoMeta(repoPath: string, name: string): Promise<void> {
        try {
            const metaPath = path.join(repoPath, HIERARCHY_META_FILE);
            const meta = {
                type: 'repository' as NodeType,
                createdAt: Date.now(),
                name: name
            };
            await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
            console.log(`[Hierarchy] Initialized repository metadata at: ${repoPath}`);
        } catch (error) {
            console.error(`[Hierarchy] Failed to write repository metadata at ${repoPath}:`, error);
            // We don't re-throw here to allow initialization to continue if possible,
            // but the error is logged.
        }
    }

    /**
     * Create folder in a custom location (e.g., Documents)
     */
    async createInDocuments(folderName: string = 'MyApp'): Promise<{ success: boolean; path?: string; error?: string }> {
        try {
            const documentsPath = app.getPath('documents');
            const customPath = path.join(documentsPath, folderName);

            if (!(await this.existsAsync(customPath))) {
                await fs.promises.mkdir(customPath, { recursive: true });
                console.log(`Created folder in Documents: ${customPath}`);
                return { success: true, path: customPath };
            }

            return { success: true, path: customPath };

        } catch (error) {
            return {
                success: false,
                error: (error as Error).message
            };
        }
    }

    /**
     * Create folder at a specific path with validation (async)
     */
    async createAtPath(folderPath: string): Promise<{ success: boolean; path?: string; error?: string }> {
        try {
            // Validate path
            if (!folderPath || folderPath.trim() === '') {
                return { success: false, error: 'Invalid path provided' };
            }

            // Resolve to absolute path
            const absolutePath = path.resolve(folderPath);

            try {
                // Check if path exists using stat
                const stats = await fs.promises.stat(absolutePath);

                if (stats.isDirectory()) {
                    // Already a directory, return success with no error message
                    return { success: true, path: absolutePath };
                } else {
                    // Path exists but is not a directory
                    return { success: false, error: 'Path exists and is not a directory' };
                }
            } catch (err) {
                // If it doesn't exist (ENOENT), we create it
                if ((err as any).code === 'ENOENT') {
                    await fs.promises.mkdir(absolutePath, { recursive: true });
                    console.log(`Created folder: ${absolutePath}`);
                    return { success: true, path: absolutePath };
                }

                // Re-throw other errors to be caught by outer try-catch
                throw err;
            }
        } catch (error) {
            console.error('Error in createAtPath:', error);
            return {
                success: false,
                error: (error as Error).message
            };
        }
    }

    /**
     * Check if folders exist asynchronously
     */
    async checkFoldersExistAsync(): Promise<{ workspace: boolean; repos: boolean }> {
        return {
            workspace: await this.existsAsync(this.workspacePath),
            repos: await this.existsAsync(path.join(this.workspacePath, 'repos'))
        };
    }

    /**
     * Get workspace path
     */
    getWorkspacePath(): string {
        return this.workspacePath;
    }

    /**
     * Get repos path
     */
    getReposPath(): string {
        return path.join(this.workspacePath, 'repos');
    }

    /**
     * Get the default repository folder path (inside repos)
     */
    getDefaultRepoPath(): string {
        return path.join(this.workspacePath, 'repos', 'Default');
    }

    /**
     * Set custom workspace location
     */
    setWorkspacePath(customPath: string): void {
        this.workspacePath = path.resolve(customPath);
    }
}
