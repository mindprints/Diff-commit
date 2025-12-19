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
 * Supported file extensions for projects
 */
const PROJECT_FILE_EXTENSIONS = ['.md', '.txt', '.html', '.htm'];

/**
 * Check if a filename is a supported project file
 */
function isProjectFile(filename: string): boolean {
    const lower = filename.toLowerCase();
    return PROJECT_FILE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Scan directory for project files.
 * Each supported file (.md, .txt, .html) is treated as a project.
 */
export async function scanProjectFolders(repoHandle: FileSystemDirectoryHandle): Promise<Project[]> {
    const projects: Project[] = [];

    try {
        for await (const entry of repoHandle.values()) {
            // Look for files with supported extensions (skip hidden files and folders)
            if (entry.kind === 'file' && !entry.name.startsWith('.') && isProjectFile(entry.name)) {
                const fileHandle = entry as FileSystemFileHandle;

                let content = '';
                let createdAt = Date.now();
                let updatedAt = Date.now();

                try {
                    const file = await fileHandle.getFile();
                    content = await file.text();
                    createdAt = file.lastModified;
                    updatedAt = file.lastModified;
                } catch {
                    // Could not read file
                }

                // Use filename (without extension) as display name, full filename as id
                const displayName = entry.name.replace(/\.[^/.]+$/, '');

                projects.push({
                    id: entry.name,  // Full filename including extension
                    name: displayName,
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
 * Create a new project file (defaults to .md extension)
 */
export async function createProjectFolder(
    repoHandle: FileSystemDirectoryHandle,
    projectName: string,
    initialContent: string = ''
): Promise<Project | null> {
    try {
        // Add .md extension if no extension provided
        const filename = projectName.includes('.') ? projectName : `${projectName}.md`;

        // Create the file directly in the repository
        const fileHandle = await repoHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(initialContent);
        await writable.close();

        // Use filename (without extension) as display name
        const displayName = filename.replace(/\.[^/.]+$/, '');

        return {
            id: filename,  // Full filename including extension
            name: displayName,
            content: initialContent,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            repositoryPath: repoHandle.name
        };
    } catch (error) {
        console.error('Failed to create project file:', error);
        throw error;
    }
}

/**
 * Save project content directly to the file
 */
export async function saveProjectDraft(
    repoHandle: FileSystemDirectoryHandle,
    projectName: string,  // This is now the filename (e.g., "essay.md")
    content: string
): Promise<boolean> {
    try {
        const fileHandle = await repoHandle.getFileHandle(projectName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        return true;
    } catch (error) {
        console.error('Failed to save project:', error);
        return false;
    }
}

/**
 * Get or create the .diff-commit directory
 */
async function getDiffCommitDir(repoHandle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
    return await repoHandle.getDirectoryHandle('.diff-commit', { create: true });
}

/**
 * Load commits from .diff-commit/{filename}.commits.json
 */
export async function loadProjectCommits(
    repoHandle: FileSystemDirectoryHandle,
    projectName: string  // This is the filename (e.g., "essay.md")
): Promise<any[]> {
    try {
        const diffCommitDir = await getDiffCommitDir(repoHandle);
        const commitsFilename = `${projectName}.commits.json`;
        const fileHandle = await diffCommitDir.getFileHandle(commitsFilename);
        const file = await fileHandle.getFile();
        const text = await file.text();
        return JSON.parse(text);
    } catch {
        // No commits file yet
        return [];
    }
}

/**
 * Save commits to .diff-commit/{filename}.commits.json
 */
export async function saveProjectCommits(
    repoHandle: FileSystemDirectoryHandle,
    projectName: string,  // This is the filename (e.g., "essay.md")
    commits: any[]
): Promise<boolean> {
    try {
        const diffCommitDir = await getDiffCommitDir(repoHandle);
        const commitsFilename = `${projectName}.commits.json`;
        const fileHandle = await diffCommitDir.getFileHandle(commitsFilename, { create: true });
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
 * Delete a project file and its commits
 */
export async function deleteProjectFolder(
    repoHandle: FileSystemDirectoryHandle,
    projectName: string  // This is the filename (e.g., "essay.md")
): Promise<boolean> {
    try {
        // Delete the project file
        await repoHandle.removeEntry(projectName);

        // Also try to delete the commits file
        try {
            const diffCommitDir = await getDiffCommitDir(repoHandle);
            const commitsFilename = `${projectName}.commits.json`;
            await diffCommitDir.removeEntry(commitsFilename);
        } catch {
            // No commits file - that's okay
        }

        return true;
    } catch (error) {
        console.error('Failed to delete project:', error);
        return false;
    }
}

/**
 * Rename a project file (and its commits file)
 */
export async function renameProjectFolder(
    repoHandle: FileSystemDirectoryHandle,
    oldName: string,  // Old filename (e.g., "essay.md")
    newName: string   // New display name (will add extension)
): Promise<Project | null> {
    try {
        // Get extension from old file
        const extension = oldName.includes('.') ? oldName.substring(oldName.lastIndexOf('.')) : '.md';
        const newFilename = newName.includes('.') ? newName : `${newName}${extension}`;

        // Read old file content
        const oldFileHandle = await repoHandle.getFileHandle(oldName);
        const oldFile = await oldFileHandle.getFile();
        const content = await oldFile.text();

        // Read old commits
        const commits = await loadProjectCommits(repoHandle, oldName);

        // Create new file with content
        const newProject = await createProjectFolder(repoHandle, newFilename, content);
        if (!newProject) throw new Error('Failed to create new project file');

        // Save commits to new location
        if (commits.length > 0) {
            await saveProjectCommits(repoHandle, newFilename, commits);
        }

        // Delete old file and commits
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
