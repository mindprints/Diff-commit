import { describe, expect, it } from 'vitest';
import path from 'path';
import { readProjectBundleSource } from './projectBundle';

describe('projectBundle', () => {
    it('reads content.md and commits.json from project directory', () => {
        const projectPath = path.join('C:', 'repos', 'repo-a', 'project-x');
        const contentPath = path.join(projectPath, 'content.md');
        const commitsPath = path.join(projectPath, '.diff-commit', 'commits.json');
        const files = new Map<string, string>([
            [contentPath, '# draft'],
            [commitsPath, '[{"id":"1"}]'],
        ]);

        const result = readProjectBundleSource(projectPath, {
            existsSync: (filePath) => files.has(filePath),
            readFileSync: (filePath) => files.get(filePath) || '',
        });

        expect(result.projectName).toBe('project-x');
        expect(result.projectContent).toBe('# draft');
        expect(result.commitsContent).toBe('[{"id":"1"}]');
    });

    it('falls back to empty content and empty commits array when files are missing', () => {
        const projectPath = path.join('C:', 'repos', 'repo-a', 'project-y');
        const result = readProjectBundleSource(projectPath, {
            existsSync: () => false,
            readFileSync: () => '',
        });

        expect(result.projectName).toBe('project-y');
        expect(result.projectContent).toBe('');
        expect(result.commitsContent).toBe('[]');
    });
});
