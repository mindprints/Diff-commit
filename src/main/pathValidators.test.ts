import { describe, expect, it } from 'vitest';
import path from 'path';
import {
    assertPathInsideRoot,
    assertProjectPath,
    assertRepositoryPath,
    isPathInsideRoot,
} from './pathValidators';

describe('pathValidators', () => {
    const root = path.join('C:', 'repos');

    it('treats root path as inside root', () => {
        expect(isPathInsideRoot(root, root)).toBe(true);
    });

    it('rejects path outside root', () => {
        const outside = path.join('C:', 'other', 'repo');
        expect(() => assertPathInsideRoot(outside, root)).toThrow('outside the repositories root');
    });

    it('asserts repository path with validator', () => {
        const repoPath = path.join(root, 'repo-a');
        const isRepo = (candidate: string) => candidate === path.resolve(repoPath);
        expect(assertRepositoryPath(repoPath, root, isRepo)).toBe(path.resolve(repoPath));
    });

    it('asserts project path with validator', () => {
        const projectPath = path.join(root, 'repo-a', 'project-1');
        const isProject = (candidate: string) => candidate === path.resolve(projectPath);
        expect(assertProjectPath(projectPath, root, isProject)).toBe(path.resolve(projectPath));
    });
});
