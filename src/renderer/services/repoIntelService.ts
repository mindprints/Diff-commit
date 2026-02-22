import type { Model } from '../constants/models';
import { requestOpenRouterChatCompletions } from './openRouterBridge';
import type {
    RepoIntelAnswer,
    RepoIntelCitation,
    RepoIntelQueryOptions,
    RepoIntelRetrievedContext,
    RepoIntelTask,
    RepoRedundancyReport,
} from '../../shared/repoIntelTypes';
import type { Project } from '../types';

function getRepoIntelApi() {
    return window.electron?.repoIntel;
}

interface OpenRouterChatCompletionResponse {
    choices?: Array<{
        message?: {
            content?: string | Array<{ type?: string; text?: string }>;
        };
    }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
    };
}

function extractResponseText(data: unknown): string {
    const response = (data || {}) as OpenRouterChatCompletionResponse;
    const content = response.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
        return content
            .map((part) => typeof part?.text === 'string' ? part.text : '')
            .join('\n')
            .trim();
    }
    return '';
}

function mapCitationsFromContext(ctx: RepoIntelRetrievedContext, topN = 8): RepoIntelCitation[] {
    return ctx.chunks.slice(0, topN).map((chunk) => ({
        chunkId: chunk.chunkId,
        sourceId: chunk.sourceId,
        repoPath: chunk.source.repoPath,
        projectId: chunk.source.projectId,
        projectName: chunk.source.projectName,
        sourceType: chunk.source.sourceType,
        score: chunk.score,
        snippet: chunk.text.slice(0, 240),
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
    }));
}

function buildFallbackAnswer(task: RepoIntelTask, model: Model, question?: string, warning?: string): RepoIntelAnswer {
    return {
        task,
        question,
        answerMarkdown: warning || 'Repo intelligence model response was empty.',
        citations: [],
        warnings: warning ? [warning] : ['Fallback response'],
        modelId: model.id,
        modelName: model.name,
        createdAt: Date.now(),
    };
}

function formatSourcesForPrompt(ctx: RepoIntelRetrievedContext, maxChunks = 12): string {
    return ctx.chunks.slice(0, maxChunks).map((chunk, index) => {
        const tag = `C${index + 1}`;
        const project = chunk.source.projectName || chunk.source.title || chunk.sourceId;
        return `[${tag}] Project: ${project}\nScore: ${chunk.score.toFixed(2)}\nExcerpt:\n${chunk.text}`;
    }).join('\n\n-----\n\n');
}

async function runGroundedTask(params: {
    task: RepoIntelTask;
    repoPath: string;
    model: Model;
    question?: string;
    retrieved: RepoIntelRetrievedContext;
    taskInstruction: string;
}): Promise<RepoIntelAnswer> {
    const { task, repoPath, model, question, retrieved, taskInstruction } = params;

    const sourceBlock = formatSourcesForPrompt(retrieved, 12);
    if (!sourceBlock.trim()) {
        return {
            ...buildFallbackAnswer(task, model, question, 'No indexed source content found for this repository.'),
            citations: [],
        };
    }

    const systemPrompt = [
        'You are a repository analysis assistant.',
        'Use only the provided source excerpts.',
        'Do not invent facts.',
        'Cite concrete claims with citation markers like [C1], [C2].',
        'If evidence is insufficient, say so explicitly.',
        'Return concise markdown.',
    ].join(' ');

    const userPrompt = [
        `Repository path: ${repoPath}`,
        `Task: ${taskInstruction}`,
        question ? `Question: ${question}` : '',
        '',
        'Sources:',
        sourceBlock,
    ].filter(Boolean).join('\n');

    try {
        const raw = await requestOpenRouterChatCompletions({
            model: model.id,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
        });
        const text = extractResponseText(raw);
        return {
            task,
            question,
            answerMarkdown: text || 'No response generated.',
            citations: mapCitationsFromContext(retrieved),
            warnings: text ? undefined : ['Empty model response'],
            modelId: model.id,
            modelName: model.name,
            createdAt: Date.now(),
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Repo intelligence model request failed.';
        return {
            ...buildFallbackAnswer(task, model, question, `Request failed: ${message}`),
            citations: mapCitationsFromContext(retrieved),
        };
    }
}

export async function ensureRepoIndex(repoPath: string): Promise<void> {
    const api = getRepoIntelApi();
    if (api) {
        const status = await api.getIndexStatus(repoPath);
        if (status.status !== 'ready') {
            await api.buildIndex(repoPath, { includeProjects: true });
        }
        return;
    }

    if (!window.electron?.loadRepositoryAtPath) {
        throw new Error('Repo intelligence API is unavailable in this environment.');
    }

    // Renderer fallback path: no-op index build. Retrieval scans current repo on demand.
}

export async function retrieveRepoContext(
    repoPath: string,
    query: string,
    options?: RepoIntelQueryOptions
): Promise<RepoIntelRetrievedContext> {
    const api = getRepoIntelApi();
    if (api) {
        return api.queryIndex(repoPath, query, options);
    }

    if (!window.electron?.loadRepositoryAtPath) {
        throw new Error('Repo intelligence API is unavailable in this environment.');
    }

    const repo = await window.electron.loadRepositoryAtPath(repoPath);
    const projects = repo?.projects || [];
    return fallbackRetrieveRepoContext(repoPath, projects, query, options);
}

export async function summarizeRepo(repoPath: string, model: Model): Promise<RepoIntelAnswer> {
    await ensureRepoIndex(repoPath);
    const retrieved = await retrieveRepoContext(repoPath, 'overview summary purpose architecture topics', {
        topK: 12,
        includeChunks: true,
        strategy: 'lexical',
    });
    return runGroundedTask({
        task: 'summarize_repo',
        repoPath,
        model,
        retrieved,
        taskInstruction: 'Summarize what this repository contains, major themes, and likely project categories.',
    });
}

export async function askRepo(repoPath: string, question: string, model: Model): Promise<RepoIntelAnswer> {
    await ensureRepoIndex(repoPath);
    const retrieved = await retrieveRepoContext(repoPath, question, { topK: 12, includeChunks: true, strategy: 'lexical' });
    return runGroundedTask({
        task: 'ask_repo',
        repoPath,
        model,
        question,
        retrieved,
        taskInstruction: 'Answer the user question using only the provided excerpts.',
    });
}

export async function mapRepoTopics(repoPath: string, model: Model): Promise<RepoIntelAnswer> {
    await ensureRepoIndex(repoPath);
    const retrieved = await retrieveRepoContext(repoPath, 'topics themes categories concepts', {
        topK: 16,
        includeChunks: true,
        strategy: 'lexical',
    });
    return runGroundedTask({
        task: 'map_topics',
        repoPath,
        model,
        retrieved,
        taskInstruction: 'Produce a topic map of the repository with bullet groups and cite sources.',
    });
}

export async function findRepoRedundancy(repoPath: string): Promise<RepoRedundancyReport> {
    await ensureRepoIndex(repoPath);
    const api = getRepoIntelApi();
    if (api) {
        return api.findRedundancy(repoPath, { threshold: 0.65, topK: 50 });
    }
    if (!window.electron?.loadRepositoryAtPath) {
        throw new Error('Repo intelligence API is unavailable in this environment.');
    }
    const repo = await window.electron.loadRepositoryAtPath(repoPath);
    return fallbackFindRepoRedundancy(repoPath, repo?.projects || []);
}

function normalizeText(input: string): string {
    return input.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenize(input: string): string[] {
    return normalizeText(input).split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}

function estimateTokens(text: string): number {
    return Math.ceil((text || '').length / 4);
}

function fallbackChunkProject(project: Project) {
    const text = project.content || '';
    const chunks: Array<{ text: string; charStart: number; charEnd: number }> = [];
    const maxChars = 1200;
    let cursor = 0;
    while (cursor < text.length || (text.length === 0 && cursor === 0)) {
        if (text.length === 0) {
            chunks.push({ text: '', charStart: 0, charEnd: 0 });
            break;
        }
        let end = Math.min(text.length, cursor + maxChars);
        const breakIdx = text.lastIndexOf('\n', end);
        if (breakIdx > cursor + 200) end = breakIdx;
        const slice = text.slice(cursor, end).trim();
        if (slice) chunks.push({ text: slice, charStart: cursor, charEnd: end });
        cursor = Math.max(end, cursor + 1);
    }
    return chunks;
}

function fallbackRetrieveRepoContext(
    repoPath: string,
    projects: Project[],
    query: string,
    options?: RepoIntelQueryOptions
): RepoIntelRetrievedContext {
    const qTokens = new Set(tokenize(query));
    const rows: RepoIntelRetrievedContext['chunks'] = [];

    for (const project of projects) {
        const sourceId = `project:${project.id}`;
        const source = {
            sourceId,
            repoPath,
            sourceType: 'project_content' as const,
            projectId: project.id,
            projectName: project.name,
            path: project.path,
            title: project.name,
            updatedAt: project.updatedAt,
            contentHash: `fallback-${project.id}-${project.updatedAt}`,
            tokenEstimate: estimateTokens(project.content || ''),
        };

        const chunks = fallbackChunkProject(project);
        chunks.forEach((chunk, index) => {
            const chunkTokens = tokenize(chunk.text);
            const tokenHits = chunkTokens.reduce((acc, token) => acc + (qTokens.has(token) ? 1 : 0), 0);
            const phraseBoost = query && chunk.text.toLowerCase().includes(query.toLowerCase()) ? 3 : 0;
            const score = tokenHits + phraseBoost;
            rows.push({
                chunkId: `${sourceId}:chunk:${index}`,
                sourceId,
                text: chunk.text,
                position: index,
                charStart: chunk.charStart,
                charEnd: chunk.charEnd,
                tokenEstimate: estimateTokens(chunk.text),
                keywords: Array.from(new Set(chunkTokens)).slice(0, 24),
                score,
                source,
            });
        });
    }

    rows.sort((a, b) => b.score - a.score || b.source.updatedAt - a.source.updatedAt);
    return {
        query,
        chunks: rows.slice(0, Math.max(1, options?.topK ?? 12)),
    };
}

function fallbackFindRepoRedundancy(repoPath: string, projects: Project[]): RepoRedundancyReport {
    const pairs: RepoRedundancyReport['pairs'] = [];
    const threshold = 0.65;
    for (let i = 0; i < projects.length; i++) {
        for (let j = i + 1; j < projects.length; j++) {
            const a = projects[i];
            const b = projects[j];
            const aNorm = normalizeText(a.content || '');
            const bNorm = normalizeText(b.content || '');
            if (!aNorm || !bNorm) continue;
            let similarity = 0;
            let overlapType: 'exact' | 'near_duplicate' | 'semantic_overlap' = 'near_duplicate';
            let rationale = 'Overlap detected by lexical similarity (renderer fallback).';
            if (aNorm === bNorm) {
                similarity = 1;
                overlapType = 'exact';
                rationale = 'Exact duplicate normalized text.';
            } else {
                const aSet = new Set(tokenize(aNorm));
                const bSet = new Set(tokenize(bNorm));
                const intersection = [...aSet].filter((t) => bSet.has(t)).length;
                const union = new Set([...aSet, ...bSet]).size || 1;
                similarity = intersection / union;
            }
            if (similarity >= threshold) {
                pairs.push({
                    aSourceId: `project:${a.id}`,
                    bSourceId: `project:${b.id}`,
                    similarity,
                    overlapType,
                    rationale,
                });
            }
        }
    }
    pairs.sort((a, b) => b.similarity - a.similarity);
    const limited = pairs.slice(0, 50);
    return {
        repoPath,
        pairs: limited,
        groups: limited.map((pair, idx) => ({
            groupId: `group-${idx + 1}`,
            sourceIds: [pair.aSourceId, pair.bSourceId],
            summary: `${pair.overlapType} overlap (${Math.round(pair.similarity * 100)}%)`,
        })),
        createdAt: Date.now(),
    };
}
