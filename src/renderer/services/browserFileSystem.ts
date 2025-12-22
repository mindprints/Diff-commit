/**
 * Browser File System Access API wrapper.
 * Provides Electron-like file system access in Chromium browsers.
 * 
 * ARCHITECTURE:
 * - Repository = folder containing project folders
 * - Project = folder containing content.md and .diff-commit/commits.json
 * 
 * Note: Only works in Chrome, Edge, Opera. Falls back gracefully in other browsers.
 */

import { Project } from '../types';

// Type declarations for File System Access API
declare global {
    interface Window {
        showDirectoryPicker?: (options?: {
            mode?: 'read' | 'readwrite';
            startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
        }) => Promise<FileSystemDirectoryHandle>;
    }

    interface FileSystemDirectoryHandle {
        values(): AsyncIterableIterator<FileSystemHandle>;
        getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
        getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
        removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
    }

    interface FileSystemFileHandle {
        getFile(): Promise<File>;
        createWritable(): Promise<FileSystemWritableFileStream>;
    }

    interface FileSystemWritableFileStream extends WritableStream {
        write(data: string | Blob | ArrayBuffer | ArrayBufferView): Promise<void>;
        close(): Promise<void>;
    }
}

// Constants
const PROJECT_CONTENT_FILE = 'content.md';
const DIFF_COMMIT_DIR = '.diff-commit';
const COMMITS_FILE = 'commits.json';

// Store the current directory handle
let currentRepoHandle: FileSystemDirectoryHandle | null = null;

/**
 * Check if File System Access API is available
 */
export function isFileSystemAccessSupported(): boolean {
    return typeof window !== 'undefined' &&
        typeof window.showDirectoryPicker === 'function';
}

/**
 * Check if a directory handle contains a .diff-commit folder (is a project)
 */
async function isProjectFolder(dirHandle: FileSystemDirectoryHandle): Promise<boolean> {
    try {
        await dirHandle.getDirectoryHandle(DIFF_COMMIT_DIR);
        return true;
    } catch {
        return false;
    }
}

/**
 * Open a directory picker for repository selection.
 * Returns the handle and scanned projects.
 */
export async function openBrowserDirectory(): Promise<{
    path: string;
    projects: Project[];
    handle: FileSystemDirectoryHandle
} | null> {
    if (!isFileSystemAccessSupported()) {
        console.warn('File System Access API not supported');
        return null;
    }

    try {
        const handle = await window.showDirectoryPicker!({ mode: 'readwrite' });
        currentRepoHandle = handle;

        const projects = await scanProjectFolders(handle);

        return {
            path: handle.name,
            projects,
            handle
        };
    } catch (error) {
        if ((error as Error).name === 'AbortError') {
            // User cancelled the picker
            return null;
        }
        console.error('Failed to open directory:', error);
        throw error;
    }
}

/**
 * Scan directory for project folders.
 * Each subdirectory containing a .diff-commit folder is treated as a project.
 */
export async function scanProjectFolders(repoHandle: FileSystemDirectoryHandle): Promise<Project[]> {
    const projects: Project[] = [];

    try {
        for await (const entry of repoHandle.values()) {
            // Look for subdirectories (skip hidden folders)
            if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
                const dirHandle = entry as FileSystemDirectoryHandle;

                // Check if this is a project folder
                if (await isProjectFolder(dirHandle)) {
                    let content = '';
                    let createdAt = Date.now();
                    let updatedAt = Date.now();

                    // Read content.md if exists
                    try {
                        const contentHandle = await dirHandle.getFileHandle(PROJECT_CONTENT_FILE);
                        const file = await contentHandle.getFile();
                        content = await file.text();
                        createdAt = file.lastModified;
                        updatedAt = file.lastModified;
                    } catch {
                        // No content.md yet
                    }

                    projects.push({
                        id: entry.name,  // Folder name
                        name: entry.name,
                        content,
                        createdAt,
                        updatedAt,
                        repositoryPath: repoHandle.name
                    });
                }
            }
        }
    } catch (error) {
        console.error('Failed to scan projects:', error);
    }

    return projects;
}

/**
 * Create a new project folder with content.md and .diff-commit/commits.json
 */
export async function createProjectFolder(
    repoHandle: FileSystemDirectoryHandle,
    projectName: string,
    initialContent: string = ''
): Promise<Project | null> {
    try {
        // Create project folder
        const projectHandle = await repoHandle.getDirectoryHandle(projectName, { create: true });

        // Create .diff-commit folder
        const diffCommitHandle = await projectHandle.getDirectoryHandle(DIFF_COMMIT_DIR, { create: true });

        // Create content.md
        const contentHandle = await projectHandle.getFileHandle(PROJECT_CONTENT_FILE, { create: true });
        const contentWritable = await contentHandle.createWritable();
        await contentWritable.write(initialContent);
        await contentWritable.close();

        // Create commits.json
        const commitsHandle = await diffCommitHandle.getFileHandle(COMMITS_FILE, { create: true });
        const commitsWritable = await commitsHandle.createWritable();
        await commitsWritable.write('[]');
        await commitsWritable.close();

        return {
            id: projectName,
            name: projectName,
            content: initialContent,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            repositoryPath: repoHandle.name
        };
    } catch (error) {
        console.error('Failed to create project folder:', error);
        throw error;
    }
}

/**
 * Save project content to content.md
 */
export async function saveProjectDraft(
    repoHandle: FileSystemDirectoryHandle,
    projectName: string,
    content: string
): Promise<boolean> {
    try {
        const projectHandle = await repoHandle.getDirectoryHandle(projectName);
        const contentHandle = await projectHandle.getFileHandle(PROJECT_CONTENT_FILE, { create: true });
        const writable = await contentHandle.createWritable();
        await writable.write(content);
        await writable.close();
        return true;
    } catch (error) {
        console.error('Failed to save project:', error);
        return false;
    }
}

/**
 * Load commits from project's .diff-commit/commits.json
 */
export async function loadProjectCommits(
    repoHandle: FileSystemDirectoryHandle,
    projectName: string
): Promise<any[]> {
    try {
        const projectHandle = await repoHandle.getDirectoryHandle(projectName);
        const diffCommitHandle = await projectHandle.getDirectoryHandle(DIFF_COMMIT_DIR);
        const fileHandle = await diffCommitHandle.getFileHandle(COMMITS_FILE);
        const file = await fileHandle.getFile();
        const text = await file.text();
        return JSON.parse(text);
    } catch {
        // No commits file yet
        return [];
    }
}

/**
 * Save commits to project's .diff-commit/commits.json
 */
export async function saveProjectCommits(
    repoHandle: FileSystemDirectoryHandle,
    projectName: string,
    commits: any[]
): Promise<boolean> {
    try {
        const projectHandle = await repoHandle.getDirectoryHandle(projectName);
        const diffCommitHandle = await projectHandle.getDirectoryHandle(DIFF_COMMIT_DIR, { create: true });
        const fileHandle = await diffCommitHandle.getFileHandle(COMMITS_FILE, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(commits, null, 2));
        await writable.close();
        return true;
    } catch (error) {
        console.error('Failed to save commits:', error);
        return false;
    }
}

/**
 * Delete a project folder and all its contents
 */
export async function deleteProjectFolder(
    repoHandle: FileSystemDirectoryHandle,
    projectName: string
): Promise<boolean> {
    try {
        await repoHandle.removeEntry(projectName, { recursive: true });
        return true;
    } catch (error) {
        console.error('Failed to delete project:', error);
        return false;
    }
}

/**
 * Rename a project folder
 */
export async function renameProjectFolder(
    repoHandle: FileSystemDirectoryHandle,
    oldName: string,
    newName: string
): Promise<Project | null> {
    try {
        // Get old project data
        const oldHandle = await repoHandle.getDirectoryHandle(oldName);

        // Read content
        let content = '';
        try {
            const contentHandle = await oldHandle.getFileHandle(PROJECT_CONTENT_FILE);
            const file = await contentHandle.getFile();
            content = await file.text();
        } catch {
            // No content
        }

        // Read commits
        const commits = await loadProjectCommits(repoHandle, oldName);

        // Create new project with data
        const newProject = await createProjectFolder(repoHandle, newName, content);
        if (!newProject) throw new Error('Failed to create new project folder');

        // Save commits to new location
        if (commits.length > 0) {
            await saveProjectCommits(repoHandle, newName, commits);
        }

        // Delete old folder
        await deleteProjectFolder(repoHandle, oldName);

        return newProject;
    } catch (error) {
        console.error('Failed to rename project:', error);
        return null;
    }
}

/**
 * Get the current repo handle (if available)
 */
export function getCurrentRepoHandle(): FileSystemDirectoryHandle | null {
    return currentRepoHandle;
}

/**
 * Set the current repo handle (for restoration)
 */
export function setCurrentRepoHandle(handle: FileSystemDirectoryHandle | null): void {
    currentRepoHandle = handle;
}
