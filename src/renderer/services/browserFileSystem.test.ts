import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createProjectFolder,
    deleteProjectFolder,
    getCurrentRepoHandle,
    isFileSystemAccessSupported,
    loadProjectCommits,
    loadProjectContent,
    openBrowserDirectory,
    renameProjectFolder,
    saveProjectCommits,
    saveProjectDraft,
    scanProjectFolders,
    setCurrentRepoHandle,
} from './browserFileSystem';

type WritableData = string | Blob | ArrayBuffer | ArrayBufferView;

class InMemoryFileHandle {
    readonly kind = 'file' as const;
    readonly name: string;
    private content = '';
    private lastModified = Date.now();

    constructor(name: string, content = '') {
        this.name = name;
        this.content = content;
    }

    async getFile(): Promise<File> {
        return {
            text: async () => this.content,
            lastModified: this.lastModified,
            name: this.name,
        } as unknown as File;
    }

    async createWritable(): Promise<{ write: (data: WritableData) => Promise<void>; close: () => Promise<void> }> {
        return {
            write: async (data: WritableData) => {
                this.content = stringifyWritable(data);
                this.lastModified = Date.now();
            },
            close: async () => undefined,
        };
    }
}

class InMemoryDirectoryHandle {
    readonly kind = 'directory' as const;
    readonly name: string;
    private readonly dirs = new Map<string, InMemoryDirectoryHandle>();
    private readonly files = new Map<string, InMemoryFileHandle>();

    constructor(name: string) {
        this.name = name;
    }

    async *values(): AsyncIterableIterator<InMemoryDirectoryHandle | InMemoryFileHandle> {
        for (const dir of this.dirs.values()) yield dir;
        for (const file of this.files.values()) yield file;
    }

    async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<InMemoryDirectoryHandle> {
        const existing = this.dirs.get(name);
        if (existing) return existing;
        if (options?.create) {
            const created = new InMemoryDirectoryHandle(name);
            this.dirs.set(name, created);
            return created;
        }
        throw new Error(`Directory not found: ${name}`);
    }

    async getFileHandle(name: string, options?: { create?: boolean }): Promise<InMemoryFileHandle> {
        const existing = this.files.get(name);
        if (existing) return existing;
        if (options?.create) {
            const created = new InMemoryFileHandle(name);
            this.files.set(name, created);
            return created;
        }
        throw new Error(`File not found: ${name}`);
    }

    async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
        if (this.files.delete(name)) return;
        const dir = this.dirs.get(name);
        if (!dir) {
            throw new Error(`Entry not found: ${name}`);
        }
        if (!options?.recursive) {
            throw new Error(`Recursive flag required to remove directory: ${name}`);
        }
        this.dirs.delete(name);
    }
}

function stringifyWritable(data: WritableData): string {
    if (typeof data === 'string') return data;
    if (data instanceof Blob) return '[blob]';
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf-8');
    if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer).toString('utf-8');
    return String(data);
}

async function writeText(dir: InMemoryDirectoryHandle, fileName: string, text: string): Promise<void> {
    const file = await dir.getFileHandle(fileName, { create: true });
    const writable = await file.createWritable();
    await writable.write(text);
    await writable.close();
}

describe('browserFileSystem I/O', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        setCurrentRepoHandle(null);
        (globalThis as unknown as { window: Record<string, unknown> }).window = {};
    });

    it('detects File System Access API support from window.showDirectoryPicker', () => {
        expect(isFileSystemAccessSupported()).toBe(false);
        (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = vi.fn();
        expect(isFileSystemAccessSupported()).toBe(true);
    });

    it('creates project files, saves draft, and round-trips content + commits', async () => {
        const repo = new InMemoryDirectoryHandle('repo-a');
        vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-1111-1111-111111111111');

        const project = await createProjectFolder(repo as unknown as FileSystemDirectoryHandle, 'Alpha', 'seed');
        expect(project).toMatchObject({
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Alpha',
            content: 'seed',
            repositoryPath: 'repo-a',
        });

        await saveProjectDraft(repo as unknown as FileSystemDirectoryHandle, 'Alpha', 'updated');
        const content = await loadProjectContent(repo as unknown as FileSystemDirectoryHandle, 'Alpha');
        expect(content).toBe('updated');

        const commits = [{ id: 'c1', commitNumber: 1, content: 'updated', timestamp: 111 }];
        await saveProjectCommits(repo as unknown as FileSystemDirectoryHandle, 'Alpha', commits);
        await expect(loadProjectCommits(repo as unknown as FileSystemDirectoryHandle, 'Alpha')).resolves.toEqual(commits);
    });

    it('scans projects using metadata id/createdAt and ignores hidden directories', async () => {
        const repo = new InMemoryDirectoryHandle('repo-b');
        const visible = await repo.getDirectoryHandle('Visible', { create: true });
        const hidden = await repo.getDirectoryHandle('.hidden', { create: true });

        const visibleDiff = await visible.getDirectoryHandle('.diff-commit', { create: true });
        await writeText(visible, 'content.md', 'hello world');
        await writeText(visibleDiff, 'metadata.json', JSON.stringify({ createdAt: 1000, id: 'stable-id' }));
        await writeText(visibleDiff, 'commits.json', '[]');

        const hiddenDiff = await hidden.getDirectoryHandle('.diff-commit', { create: true });
        await writeText(hiddenDiff, 'metadata.json', JSON.stringify({ createdAt: 5, id: 'do-not-load' }));

        const projects = await scanProjectFolders(repo as unknown as FileSystemDirectoryHandle);
        expect(projects).toHaveLength(1);
        expect(projects[0]).toMatchObject({
            id: 'stable-id',
            name: 'Visible',
            content: 'hello world',
            createdAt: 1000,
            repositoryPath: 'repo-b',
        });
    });

    it('renames a project while preserving metadata and commits', async () => {
        const repo = new InMemoryDirectoryHandle('repo-c');
        vi.spyOn(crypto, 'randomUUID').mockReturnValue('22222222-2222-2222-2222-222222222222');
        vi.spyOn(Date, 'now').mockReturnValue(2000);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const oldProject = await repo.getDirectoryHandle('OldName', { create: true });
        const oldDiff = await oldProject.getDirectoryHandle('.diff-commit', { create: true });
        await writeText(oldProject, 'content.md', 'before');
        await writeText(oldDiff, 'metadata.json', JSON.stringify({ createdAt: 444, id: 'original-id' }));
        await writeText(oldDiff, 'commits.json', JSON.stringify([{ id: 'k1', commitNumber: 1, content: 'before', timestamp: 333 }]));

        const renamed = await renameProjectFolder(
            repo as unknown as FileSystemDirectoryHandle,
            'OldName',
            'NewName'
        );

        expect(renamed).toMatchObject({
            id: 'original-id',
            name: 'NewName',
            content: 'before',
            createdAt: 444,
        });
        await expect(loadProjectContent(repo as unknown as FileSystemDirectoryHandle, 'NewName')).resolves.toBe('before');
        await expect(loadProjectCommits(repo as unknown as FileSystemDirectoryHandle, 'NewName')).resolves.toEqual([
            { id: 'k1', commitNumber: 1, content: 'before', timestamp: 333 },
        ]);
        await expect(loadProjectContent(repo as unknown as FileSystemDirectoryHandle, 'OldName')).resolves.toBe('');
        expect(warnSpy).toHaveBeenCalled();
    });

    it('returns null on directory picker cancel and tracks selected handle on success', async () => {
        const repo = new InMemoryDirectoryHandle('repo-d');
        const picker = vi.fn()
            .mockRejectedValueOnce(Object.assign(new Error('cancelled'), { name: 'AbortError' }))
            .mockResolvedValueOnce(repo);
        (window as unknown as { showDirectoryPicker: typeof picker }).showDirectoryPicker = picker;

        await expect(openBrowserDirectory()).resolves.toBeNull();
        expect(getCurrentRepoHandle()).toBeNull();

        await expect(openBrowserDirectory()).resolves.toMatchObject({ path: 'repo-d' });
        expect(getCurrentRepoHandle()).toBe(repo);
    });

    it('deletes a project folder and reports the result', async () => {
        const repo = new InMemoryDirectoryHandle('repo-e');
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await repo.getDirectoryHandle('DeleteMe', { create: true });
        await expect(deleteProjectFolder(repo as unknown as FileSystemDirectoryHandle, 'DeleteMe')).resolves.toBe(true);
        await expect(deleteProjectFolder(repo as unknown as FileSystemDirectoryHandle, 'DeleteMe')).resolves.toBe(false);
        expect(errorSpy).toHaveBeenCalled();
    });
});
