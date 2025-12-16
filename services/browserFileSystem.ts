/**
 * Browser File System Access API wrapper.
 * Provides Electron-like file system access in Chromium browsers.
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
 * Each subfolder is treated as a project if it contains draft.txt
 */
export async function scanProjectFolders(repoHandle: FileSystemDirectoryHandle): Promise<Project[]> {
    const projects: Project[] = [];

    try {
        for await (const entry of repoHandle.values()) {
            if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
                const projectHandle = entry as FileSystemDirectoryHandle;

                let content = '';
                let createdAt = Date.now();
                let updatedAt = Date.now();

                // Try to read draft.txt
                try {
                    const draftHandle = await projectHandle.getFileHandle('draft.txt');
                    const file = await draftHandle.getFile();
                    content = await file.text();
                    createdAt = file.lastModified;
                    updatedAt = file.lastModified;
                } catch {
                    // No draft.txt yet - that's okay, project might be new
                }

                projects.push({
                    id: entry.name,
                    name: entry.name,
                    content,
                    createdAt,
                    updatedAt,
                    repositoryPath: repoHandle.name
                });
            }
        }
    } catch (error) {
        console.error('Failed to scan projects:', error);
    }

    return projects;
}

/**
 * Create a new project folder with draft.txt and .commits/
 */
export async function createProjectFolder(
    repoHandle: FileSystemDirectoryHandle,
    projectName: string,
    initialContent: string = ''
): Promise<Project | null> {
    try {
        // Create project directory
        const projectHandle = await repoHandle.getDirectoryHandle(projectName, { create: true });

        // Create .commits directory
        await projectHandle.getDirectoryHandle('.commits', { create: true });

        // Create draft.txt with initial content
        const draftHandle = await projectHandle.getFileHandle('draft.txt', { create: true });
        const writable = await draftHandle.createWritable();
        await writable.write(initialContent);
        await writable.close();

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
 * Save project draft content to draft.txt
 */
export async function saveProjectDraft(
    repoHandle: FileSystemDirectoryHandle,
    projectName: string,
    content: string
): Promise<boolean> {
    try {
        const projectHandle = await repoHandle.getDirectoryHandle(projectName);
        const draftHandle = await projectHandle.getFileHandle('draft.txt', { create: true });
        const writable = await draftHandle.createWritable();
        await writable.write(content);
        await writable.close();
        return true;
    } catch (error) {
        console.error('Failed to save draft:', error);
        return false;
    }
}

/**
 * Load commits from .commits/commits.json
 */
export async function loadProjectCommits(
    repoHandle: FileSystemDirectoryHandle,
    projectName: string
): Promise<any[]> {
    try {
        const projectHandle = await repoHandle.getDirectoryHandle(projectName);
        const commitsHandle = await projectHandle.getDirectoryHandle('.commits');
        const fileHandle = await commitsHandle.getFileHandle('commits.json');
        const file = await fileHandle.getFile();
        const text = await file.text();
        return JSON.parse(text);
    } catch {
        // No commits file yet
        return [];
    }
}

/**
 * Save commits to .commits/commits.json
 */
export async function saveProjectCommits(
    repoHandle: FileSystemDirectoryHandle,
    projectName: string,
    commits: any[]
): Promise<boolean> {
    try {
        const projectHandle = await repoHandle.getDirectoryHandle(projectName);
        const commitsHandle = await projectHandle.getDirectoryHandle('.commits', { create: true });
        const fileHandle = await commitsHandle.getFileHandle('commits.json', { create: true });
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
 * Delete a project folder
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
        // File System Access API doesn't support direct rename
        // We need to copy content and delete old folder
        const oldHandle = await repoHandle.getDirectoryHandle(oldName);

        // Read draft content
        let content = '';
        try {
            const draftHandle = await oldHandle.getFileHandle('draft.txt');
            const file = await draftHandle.getFile();
            content = await file.text();
        } catch {
            // No draft
        }

        // Read commits
        let commits: any[] = [];
        try {
            const commitsHandle = await oldHandle.getDirectoryHandle('.commits');
            const fileHandle = await commitsHandle.getFileHandle('commits.json');
            const file = await fileHandle.getFile();
            commits = JSON.parse(await file.text());
        } catch {
            // No commits
        }

        // Create new project
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
