import path from 'path';

export function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
    const resolvedRoot = path.resolve(rootPath);
    const resolvedTarget = path.resolve(targetPath);
    const relative = path.relative(resolvedRoot, resolvedTarget);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function assertPathInsideRoot(targetPath: string, rootPath: string): string {
    if (!targetPath || typeof targetPath !== 'string') {
        throw new Error('Invalid path');
    }
    if (!isPathInsideRoot(targetPath, rootPath)) {
        throw new Error('Path is outside the repositories root');
    }
    return path.resolve(targetPath);
}

export function assertRepositoryPath(
    repoPath: string,
    reposRootPath: string,
    isRepositoryFolder: (folderPath: string) => boolean
): string {
    const validatedPath = assertPathInsideRoot(repoPath, reposRootPath);
    if (!isRepositoryFolder(validatedPath)) {
        throw new Error('Invalid repository folder');
    }
    return validatedPath;
}

export function assertProjectPath(
    projectPath: string,
    reposRootPath: string,
    isProjectFolder: (folderPath: string) => boolean
): string {
    const validatedPath = assertPathInsideRoot(projectPath, reposRootPath);
    if (!isProjectFolder(validatedPath)) {
        throw new Error('Invalid project folder');
    }
    return validatedPath;
}
