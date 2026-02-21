import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, RepositoryInfo } from '../types';
import {
    clearLegacyStorage,
    createProject,
    createRepository,
    deleteProject,
    getProjects,
    listRepositories,
    openRepository,
    renameProject,
    renameRepository,
    saveProject,
} from './projectStorage';

interface ElectronApiMock {
    openRepository?: () => Promise<{ path: string; projects: Project[] } | null>;
    createProject?: (repoPath: string, name: string, content?: string) => Promise<Project | null>;
    createRepository?: () => Promise<{ path: string; projects: Project[] } | null>;
    listRepositories?: () => Promise<RepositoryInfo[]>;
    renameRepository?: (repoPath: string, newName: string) => Promise<RepositoryInfo | null>;
    saveProjectContent?: (projectPath: string, content: string) => Promise<unknown>;
    renameProject?: (projectPath: string, newName: string) => Promise<Project | null>;
}

function setWindowElectron(electron?: ElectronApiMock): void {
    (globalThis as unknown as { window: { electron?: ElectronApiMock } }).window = electron ? { electron } : {};
}

const PROJECTS_KEY = 'diff-commit-projects';
const REPO_KEY = 'diff-commit-repository';
const LEGACY_COMMITS_KEY = 'diff-commit-commits';

describe('projectStorage I/O', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        setWindowElectron(undefined);
        localStorage.clear();
    });

    it('creates and opens a browser repository, filtering projects by repositoryPath', async () => {
        vi.spyOn(globalThis, 'prompt').mockReturnValue('Repo Alpha');
        const created = await createRepository();
        expect(created).toEqual({ path: 'Repo Alpha', projects: [] });

        localStorage.setItem(PROJECTS_KEY, JSON.stringify([
            { id: '1', name: 'A', content: '', createdAt: 1, updatedAt: 5, repositoryPath: 'Repo Alpha' },
            { id: '2', name: 'B', content: '', createdAt: 2, updatedAt: 7, repositoryPath: 'Repo Beta' },
        ]));

        await expect(openRepository()).resolves.toEqual({
            path: 'Repo Alpha',
            projects: [{ id: '1', name: 'A', content: '', createdAt: 1, updatedAt: 5, repositoryPath: 'Repo Alpha' }],
        });
    });

    it('lists browser repository summary with computed project count and latest updatedAt', async () => {
        localStorage.setItem(REPO_KEY, JSON.stringify({
            name: 'Repo One',
            path: 'Repo One',
            createdAt: 100,
        }));
        localStorage.setItem(PROJECTS_KEY, JSON.stringify([
            { id: 'p1', name: 'First', content: '', createdAt: 10, updatedAt: 120, repositoryPath: 'Repo One' },
            { id: 'p2', name: 'Second', content: '', createdAt: 11, updatedAt: 180, repositoryPath: 'Repo One' },
            { id: 'p3', name: 'Else', content: '', createdAt: 12, updatedAt: 999, repositoryPath: 'Other' },
        ]));

        await expect(listRepositories()).resolves.toEqual([{
            name: 'Repo One',
            path: 'Repo One',
            projectCount: 2,
            createdAt: 100,
            updatedAt: 180,
        }]);
    });

    it('uses Electron IPC for createProject and saveProject when APIs and path are present', async () => {
        const createProjectMock = vi.fn(async () => ({
            id: 'fs-id',
            name: 'Disk Project',
            content: 'from-disk',
            createdAt: 1000,
            updatedAt: 1000,
            path: 'C:/repo/Disk Project',
            repositoryPath: 'C:/repo',
        } satisfies Project));
        const saveProjectContentMock = vi.fn(async () => true);

        setWindowElectron({
            openRepository: vi.fn(async () => null),
            createProject: createProjectMock,
            saveProjectContent: saveProjectContentMock,
        });

        const created = await createProject('Disk Project', 'from-disk', 'C:/repo');
        expect(createProjectMock).toHaveBeenCalledWith('C:/repo', 'Disk Project', 'from-disk');
        expect(created.path).toBe('C:/repo/Disk Project');

        await saveProject({
            ...created,
            content: 'changed',
        });
        expect(saveProjectContentMock).toHaveBeenCalledWith('C:/repo/Disk Project', 'changed');
    });

    it('falls back to localStorage project create/update/delete in browser mode', async () => {
        vi.spyOn(crypto, 'randomUUID').mockReturnValue('33333333-3333-3333-3333-333333333333');
        vi.spyOn(Date, 'now').mockReturnValue(5000);

        const created = await createProject('Local Name', 'body');
        expect(created).toMatchObject({
            id: '33333333-3333-3333-3333-333333333333',
            name: 'Local Name',
            content: 'body',
            createdAt: 5000,
            updatedAt: 5000,
        });

        await saveProject({ ...created, content: 'body-2' });
        let stored = await getProjects();
        expect(stored).toHaveLength(1);
        expect(stored[0].content).toBe('body-2');

        await deleteProject('33333333-3333-3333-3333-333333333333');
        stored = await getProjects();
        expect(stored).toEqual([]);
    });

    it('renames projects via Electron IPC when project path is provided', async () => {
        const renameProjectMock = vi.fn(async () => ({
            id: 'stable-id',
            name: 'Renamed',
            content: 'kept',
            createdAt: 10,
            updatedAt: 20,
            path: 'C:/repo/Renamed',
            repositoryPath: 'C:/repo',
        } satisfies Project));
        setWindowElectron({
            renameProject: renameProjectMock,
        });

        await expect(renameProject('ignored-id', 'Renamed', 'C:/repo/Old')).resolves.toEqual({
            id: 'stable-id',
            name: 'Renamed',
            content: 'kept',
            createdAt: 10,
            updatedAt: 20,
            path: 'C:/repo/Renamed',
            repositoryPath: 'C:/repo',
        });
        expect(renameProjectMock).toHaveBeenCalledWith('C:/repo/Old', 'Renamed');
    });

    it('renames repositories via Electron IPC only when full Electron project API is present', async () => {
        const renameRepositoryMock = vi.fn(async () => ({
            name: 'Renamed Repo',
            path: 'C:/repos/Renamed Repo',
            projectCount: 2,
        } satisfies RepositoryInfo));

        // Missing openRepository/createProject => hasElectronProjectAPI false => null
        setWindowElectron({ renameRepository: renameRepositoryMock });
        await expect(renameRepository('C:/repos/Old', 'Renamed Repo')).resolves.toBeNull();

        // Add required APIs => IPC branch enabled
        setWindowElectron({
            openRepository: vi.fn(async () => null),
            createProject: vi.fn(async () => null),
            renameRepository: renameRepositoryMock,
        });
        await expect(renameRepository('C:/repos/Old', 'Renamed Repo')).resolves.toEqual({
            name: 'Renamed Repo',
            path: 'C:/repos/Renamed Repo',
            projectCount: 2,
        });
    });

    it('clearLegacyStorage removes project/repo/legacy commit keys', () => {
        localStorage.setItem(PROJECTS_KEY, 'x');
        localStorage.setItem(REPO_KEY, 'y');
        localStorage.setItem(LEGACY_COMMITS_KEY, 'z');

        clearLegacyStorage();

        expect(localStorage.getItem(PROJECTS_KEY)).toBeNull();
        expect(localStorage.getItem(REPO_KEY)).toBeNull();
        expect(localStorage.getItem(LEGACY_COMMITS_KEY)).toBeNull();
    });
});
