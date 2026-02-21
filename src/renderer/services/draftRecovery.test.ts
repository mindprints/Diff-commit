import { beforeEach, describe, expect, it } from 'vitest';
import {
    getDraftSnapshot,
    getDraftSnapshotKey,
    removeDraftSnapshot,
    upsertDraftSnapshot,
} from './draftRecovery';

describe('draftRecovery', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('builds stable keys from project identity', () => {
        expect(getDraftSnapshotKey(null)).toBeNull();
        expect(getDraftSnapshotKey({
            id: 'id-1',
            name: 'N',
            content: '',
            createdAt: 1,
            updatedAt: 1,
            path: 'C:/repo/P',
        })).toBe('path:C:/repo/P');
        expect(getDraftSnapshotKey({
            id: 'id-2',
            name: 'Name',
            content: '',
            createdAt: 1,
            updatedAt: 1,
            repositoryPath: 'Repo',
        })).toBe('repo:Repo::name:Name');
    });

    it('upserts and removes snapshots', () => {
        const snapshot = {
            key: 'path:C:/repo/P',
            content: 'draft',
            updatedAt: 123,
            projectId: 'id-1',
        };

        upsertDraftSnapshot(snapshot);
        expect(getDraftSnapshot(snapshot.key)).toEqual(snapshot);

        removeDraftSnapshot(snapshot.key);
        expect(getDraftSnapshot(snapshot.key)).toBeNull();
    });
});
