export type RepoIntelTask =
    | 'summarize_repo'
    | 'ask_repo'
    | 'find_redundancy'
    | 'map_topics'
    | 'compare_projects';

export type RepoIntelSourceType =
    | 'project_content'
    | 'project_commit_latest'
    | 'prompt'
    | 'file';

export interface RepoIntelSourceDocument {
    sourceId: string;
    repoPath: string;
    sourceType: RepoIntelSourceType;
    projectId?: string;
    projectName?: string;
    path?: string;
    title: string;
    updatedAt: number;
    contentHash: string;
    tokenEstimate: number;
}

export interface RepoIntelChunk {
    chunkId: string;
    sourceId: string;
    text: string;
    position: number;
    charStart: number;
    charEnd: number;
    tokenEstimate: number;
    heading?: string;
    keywords?: string[];
    embedding?: number[];
}

export interface RepoIntelCitation {
    chunkId: string;
    sourceId: string;
    repoPath: string;
    projectId?: string;
    projectName?: string;
    sourceType: RepoIntelSourceType;
    score: number;
    snippet: string;
    charStart?: number;
    charEnd?: number;
}

export interface RepoIntelAnswer {
    task: RepoIntelTask;
    question?: string;
    answerMarkdown: string;
    citations: RepoIntelCitation[];
    warnings?: string[];
    modelId: string;
    modelName: string;
    createdAt: number;
}

export interface RepoIntelIndexStats {
    repoPath: string;
    schemaVersion: number;
    builtAt: number | null;
    sourceCount: number;
    chunkCount: number;
    status: 'idle' | 'building' | 'ready' | 'error';
    error?: string;
}

export interface RepoIntelBuildOptions {
    includeProjects?: boolean;
    includeLatestCommits?: boolean;
    forceRebuild?: boolean;
}

export interface RepoIntelQueryOptions {
    topK?: number;
    sourceTypes?: RepoIntelSourceType[];
    includeChunks?: boolean;
    strategy?: 'lexical' | 'hybrid';
}

export interface RepoIntelRetrievedChunk extends RepoIntelChunk {
    score: number;
    source: RepoIntelSourceDocument;
}

export interface RepoIntelRetrievedContext {
    query: string;
    chunks: RepoIntelRetrievedChunk[];
}

export interface RedundancyPair {
    aSourceId: string;
    bSourceId: string;
    similarity: number;
    overlapType: 'exact' | 'near_duplicate' | 'semantic_overlap';
    rationale: string;
}

export interface RepoRedundancyReport {
    repoPath: string;
    pairs: RedundancyPair[];
    groups: Array<{
        groupId: string;
        sourceIds: string[];
        summary: string;
    }>;
    createdAt: number;
}

