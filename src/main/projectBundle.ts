import path from 'path';

export interface ProjectBundleSource {
    projectName: string;
    projectContent: string;
    commitsContent: string;
}

interface BundleFileReader {
    existsSync: (filePath: string) => boolean;
    readFileSync: (filePath: string, encoding: BufferEncoding) => string;
}

export function readProjectBundleSource(
    projectPath: string,
    reader: BundleFileReader,
    contentFilename = 'content.md',
    commitsDirName = '.diff-commit',
    commitsFilename = 'commits.json'
): ProjectBundleSource {
    const projectName = path.basename(projectPath);
    const contentPath = path.join(projectPath, contentFilename);
    const commitsPath = path.join(projectPath, commitsDirName, commitsFilename);

    const projectContent = reader.existsSync(contentPath)
        ? reader.readFileSync(contentPath, 'utf-8')
        : '';
    const commitsContent = reader.existsSync(commitsPath)
        ? reader.readFileSync(commitsPath, 'utf-8')
        : '[]';

    return {
        projectName,
        projectContent,
        commitsContent,
    };
}
