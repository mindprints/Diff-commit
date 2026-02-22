import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
    RepoIntelBuildOptions,
    RepoIntelIndexStats,
    RepoIntelQueryOptions,
    RepoIntelRetrievedContext,
    RepoRedundancyReport,
} from '../shared/repoIntelTypes';

const REPO_INTEL_SCHEMA_VERSION = 1;
const PROJECT_CONTENT_FILE = 'content.md';
const DIFF_COMMIT_DIR = '.diff-commit';
const MAX_CHUNK_CHARS = 1200;

interface RepoIndexCacheEntry {
    stats: RepoIntelIndexStats;
    sources: import('../shared/repoIntelTypes').RepoIntelSourceDocument[];
    chunks: import('../shared/repoIntelTypes').RepoIntelChunk[];
}

function sha1(input: string): string {
    return crypto.createHash('sha1').update(input).digest('hex');
}

function normalizeText(input: string): string {
    return input.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenize(input: string): string[] {
    return normalizeText(input)
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 1);
}

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

function chunkText(text: string): Array<{ text: string; charStart: number; charEnd: number }> {
    const normalized = text || '';
    if (!normalized.trim()) {
        return [{ text: '', charStart: 0, charEnd: 0 }];
    }

    const chunks: Array<{ text: string; charStart: number; charEnd: number }> = [];
    let cursor = 0;
    while (cursor < normalized.length) {
        let end = Math.min(normalized.length, cursor + MAX_CHUNK_CHARS);
        if (end < normalized.length) {
            const breakIdx = normalized.lastIndexOf('\n', end);
            if (breakIdx > cursor + 200) end = breakIdx;
        }
        const slice = normalized.slice(cursor, end).trim();
        if (slice) {
            const charStart = cursor;
            const charEnd = end;
            chunks.push({ text: slice, charStart, charEnd });
        }
        cursor = Math.max(end, cursor + 1);
    }
    return chunks.length > 0 ? chunks : [{ text: '', charStart: 0, charEnd: 0 }];
}

function emptyStats(repoPath: string): RepoIntelIndexStats {
    return {
        repoPath,
        schemaVersion: REPO_INTEL_SCHEMA_VERSION,
        builtAt: null,
        sourceCount: 0,
        chunkCount: 0,
        status: 'idle',
    };
}

export class RepoIntelIndexService {
    private cache = new Map<string, RepoIndexCacheEntry>();

    async buildIndex(repoPath: string, _options: RepoIntelBuildOptions = {}): Promise<RepoIntelIndexStats> {
        const sources: RepoIndexCacheEntry['sources'] = [];
        const chunks: RepoIndexCacheEntry['chunks'] = [];

        const entries = fs.existsSync(repoPath) ? fs.readdirSync(repoPath, { withFileTypes: true }) : [];
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
            const projectPath = path.join(repoPath, entry.name);
            if (!fs.existsSync(path.join(projectPath, DIFF_COMMIT_DIR))) continue;

            const contentPath = path.join(projectPath, PROJECT_CONTENT_FILE);
            const content = fs.existsSync(contentPath) ? fs.readFileSync(contentPath, 'utf-8') : '';
            const stats = fs.statSync(projectPath);
            const sourceId = `project:${sha1(projectPath)}`;
            const source = {
                sourceId,
                repoPath,
                sourceType: 'project_content' as const,
                projectId: entry.name,
                projectName: entry.name,
                path: projectPath,
                title: entry.name,
                updatedAt: stats.mtimeMs,
                contentHash: sha1(content),
                tokenEstimate: estimateTokens(content),
            };
            sources.push(source);

            const sourceChunks = chunkText(content);
            sourceChunks.forEach((chunk, index) => {
                chunks.push({
                    chunkId: `${sourceId}:chunk:${index}`,
                    sourceId,
                    text: chunk.text,
                    position: index,
                    charStart: chunk.charStart,
                    charEnd: chunk.charEnd,
                    tokenEstimate: estimateTokens(chunk.text),
                    keywords: Array.from(new Set(tokenize(chunk.text))).slice(0, 24),
                });
            });
        }

        const stats: RepoIntelIndexStats = {
            repoPath,
            schemaVersion: REPO_INTEL_SCHEMA_VERSION,
            builtAt: Date.now(),
            sourceCount: sources.length,
            chunkCount: chunks.length,
            status: 'ready',
        };
        this.cache.set(repoPath, { stats, sources, chunks });
        return stats;
    }

    async getIndexStatus(repoPath: string): Promise<RepoIntelIndexStats> {
        return this.cache.get(repoPath)?.stats ?? emptyStats(repoPath);
    }

    async clearIndex(repoPath: string): Promise<boolean> {
        this.cache.delete(repoPath);
        return true;
    }

    async queryIndex(repoPath: string, query: string, _options: RepoIntelQueryOptions = {}): Promise<RepoIntelRetrievedContext> {
        let entry = this.cache.get(repoPath);
        if (!entry) {
            await this.buildIndex(repoPath);
            entry = this.cache.get(repoPath);
        }
        if (!entry) {
            return { query, chunks: [] };
        }

        const qTokens = tokenize(query);
        const qTokenSet = new Set(qTokens);
        const scored = entry.chunks
            .map((chunk) => {
                const tokenHits = (chunk.keywords || []).reduce((acc, token) => acc + (qTokenSet.has(token) ? 1 : 0), 0);
                const textLower = chunk.text.toLowerCase();
                const phraseBoost = query && textLower.includes(query.toLowerCase()) ? 3 : 0;
                const score = tokenHits + phraseBoost;
                const source = entry!.sources.find((s) => s.sourceId === chunk.sourceId);
                if (!source) return null;
                return { ...chunk, score, source };
            })
            .filter((row): row is NonNullable<typeof row> => Boolean(row))
            .sort((a, b) => b.score - a.score || b.source.updatedAt - a.source.updatedAt)
            .slice(0, Math.max(1, _options.topK ?? 12));

        return {
            query,
            chunks: scored,
        };
    }

    async findRedundancy(repoPath: string, _options: { threshold?: number; topK?: number } = {}): Promise<RepoRedundancyReport> {
        let entry = this.cache.get(repoPath);
        if (!entry) {
            await this.buildIndex(repoPath);
            entry = this.cache.get(repoPath);
        }
        if (!entry) {
            return { repoPath, pairs: [], groups: [], createdAt: Date.now() };
        }

        const threshold = _options.threshold ?? 0.65;
        const maxPairs = _options.topK ?? 50;
        const contentBySource = new Map<string, string>();
        for (const source of entry.sources) {
            const text = entry.chunks
                .filter((c) => c.sourceId === source.sourceId)
                .sort((a, b) => a.position - b.position)
                .map((c) => c.text)
                .join('\n');
            contentBySource.set(source.sourceId, text);
        }

        const tokenSets = new Map<string, Set<string>>();
        for (const source of entry.sources) {
            tokenSets.set(source.sourceId, new Set(tokenize(contentBySource.get(source.sourceId) || '')));
        }

        const pairs: RepoRedundancyReport['pairs'] = [];
        for (let i = 0; i < entry.sources.length; i++) {
            for (let j = i + 1; j < entry.sources.length; j++) {
                const a = entry.sources[i];
                const b = entry.sources[j];
                const aText = normalizeText(contentBySource.get(a.sourceId) || '');
                const bText = normalizeText(contentBySource.get(b.sourceId) || '');
                if (!aText || !bText) continue;

                let similarity = 0;
                let overlapType: 'exact' | 'near_duplicate' | 'semantic_overlap' = 'near_duplicate';
                let rationale = 'Overlap detected by lexical similarity.';

                if (a.contentHash === b.contentHash) {
                    similarity = 1;
                    overlapType = 'exact';
                    rationale = 'Exact duplicate normalized content hash.';
                } else {
                    const aTokens = tokenSets.get(a.sourceId) || new Set<string>();
                    const bTokens = tokenSets.get(b.sourceId) || new Set<string>();
                    const intersection = [...aTokens].filter((t) => bTokens.has(t)).length;
                    const union = new Set([...aTokens, ...bTokens]).size || 1;
                    similarity = intersection / union;
                }

                if (similarity >= threshold) {
                    pairs.push({
                        aSourceId: a.sourceId,
                        bSourceId: b.sourceId,
                        similarity,
                        overlapType,
                        rationale,
                    });
                }
            }
        }

        pairs.sort((a, b) => b.similarity - a.similarity);
        const limitedPairs = pairs.slice(0, maxPairs);

        return {
            repoPath,
            pairs: limitedPairs,
            groups: limitedPairs.map((pair, index) => ({
                groupId: `group-${index + 1}`,
                sourceIds: [pair.aSourceId, pair.bSourceId],
                summary: `${pair.overlapType} overlap (${Math.round(pair.similarity * 100)}%)`,
            })),
            createdAt: Date.now(),
        };
    }
}
