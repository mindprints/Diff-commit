import type { Project } from '../types';

const DRAFT_SNAPSHOT_STORAGE_KEY = 'diff-commit-draft-snapshots-v1';

export interface DraftSnapshot {
    key: string;
    content: string;
    updatedAt: number;
    projectId?: string;
    projectPath?: string;
    repositoryPath?: string;
    projectName?: string;
}

type DraftSnapshotMap = Record<string, DraftSnapshot>;

function readSnapshotMap(): DraftSnapshotMap {
    try {
        const raw = localStorage.getItem(DRAFT_SNAPSHOT_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object') return {};
        return parsed as DraftSnapshotMap;
    } catch {
        return {};
    }
}

function writeSnapshotMap(map: DraftSnapshotMap): void {
    localStorage.setItem(DRAFT_SNAPSHOT_STORAGE_KEY, JSON.stringify(map));
}

export function getDraftSnapshotKey(project: Project | null): string | null {
    if (!project) return null;
    if (project.path && project.path.trim().length > 0) {
        return `path:${project.path}`;
    }
    if (project.repositoryPath && project.name) {
        return `repo:${project.repositoryPath}::name:${project.name}`;
    }
    if (project.id) {
        return `id:${project.id}`;
    }
    return null;
}

export function getDraftSnapshot(key: string): DraftSnapshot | null {
    const map = readSnapshotMap();
    return map[key] ?? null;
}

export function upsertDraftSnapshot(snapshot: DraftSnapshot): void {
    const map = readSnapshotMap();
    map[snapshot.key] = snapshot;
    writeSnapshotMap(map);
}

export function removeDraftSnapshot(key: string): void {
    const map = readSnapshotMap();
    if (!(key in map)) return;
    delete map[key];
    writeSnapshotMap(map);
}
