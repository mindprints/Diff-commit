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
    try {
        localStorage.setItem(DRAFT_SNAPSHOT_STORAGE_KEY, JSON.stringify(map));
    } catch (e) {
        const isQuotaError = e instanceof Error && (
            e.name === 'QuotaExceededError' ||
            e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || // Firefox
            e.name === 'QuotaExceeded' // Older browsers/Electron
        );

        if (isQuotaError) {
            console.warn('[DraftRecovery] LocalStorage quota exceeded. Pruning old draft snapshots.');

            // Prune: Sort by updatedAt and remove the oldest 20%
            const entries = Object.entries(map).sort((a, b) => a[1].updatedAt - b[1].updatedAt);
            if (entries.length > 1) {
                const pruneCount = Math.max(1, Math.floor(entries.length * 0.2));
                for (let i = 0; i < pruneCount; i++) {
                    delete map[entries[i][0]];
                }

                // Retry write
                try {
                    localStorage.setItem(DRAFT_SNAPSHOT_STORAGE_KEY, JSON.stringify(map));
                    console.log(`[DraftRecovery] Successfully prunned ${pruneCount} snapshots and recovered.`);
                } catch (retryError) {
                    console.error('[DraftRecovery] Failed to save draft snapshots even after pruning:', retryError);
                }
            } else if (entries.length === 1) {
                // Single snapshot is too huge? Just clear it as a last resort
                localStorage.removeItem(DRAFT_SNAPSHOT_STORAGE_KEY);
                console.error('[DraftRecovery] Single snapshot exceeds quota. Cleared storage.');
            }
        } else {
            console.error('[DraftRecovery] Failed to write snapshot map:', e);
        }
    }
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
