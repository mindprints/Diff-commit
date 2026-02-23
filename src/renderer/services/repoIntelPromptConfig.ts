import type { RepoIntelTask } from '../../shared/repoIntelTypes';

export type RepoIntelPromptTask = Extract<RepoIntelTask, 'summarize_repo' | 'ask_repo' | 'map_topics'>;

export interface RepoIntelPromptConfig {
    task: RepoIntelPromptTask;
    name: string;
    systemInstruction: string;
    promptTask: string;
}

const STORAGE_KEY = 'repo-intel-prompts-v1';

const DEFAULT_REPO_INTEL_PROMPTS: RepoIntelPromptConfig[] = [
    {
        task: 'summarize_repo',
        name: 'Repo Intel: Summarize Repo',
        systemInstruction: [
            'You are a repository analysis assistant.',
            'Use only the provided source excerpts.',
            'Do not invent facts.',
            'Cite concrete claims with citation markers like [C1], [C2].',
            'If evidence is insufficient, say so explicitly.',
            'Return concise markdown.',
        ].join(' '),
        promptTask: 'Summarize what this repository contains, major themes, and likely project categories.',
    },
    {
        task: 'ask_repo',
        name: 'Repo Intel: Ask Repo',
        systemInstruction: [
            'You are a repository analysis assistant.',
            'Use only the provided source excerpts.',
            'Do not invent facts.',
            'Cite concrete claims with citation markers like [C1], [C2].',
            'If evidence is insufficient, say so explicitly.',
            'Return concise markdown.',
        ].join(' '),
        promptTask: 'Answer the user question using only the provided excerpts.',
    },
    {
        task: 'map_topics',
        name: 'Repo Intel: Map Topics',
        systemInstruction: [
            'You are a repository analysis assistant.',
            'Use only the provided source excerpts.',
            'Do not invent facts.',
            'Cite concrete claims with citation markers like [C1], [C2].',
            'If evidence is insufficient, say so explicitly.',
            'Return concise markdown.',
        ].join(' '),
        promptTask: 'Produce a topic map of the repository with bullet groups and cite sources.',
    },
];

function hasLocalStorage(): boolean {
    try {
        return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
    } catch {
        return false;
    }
}

function cloneDefaults(): RepoIntelPromptConfig[] {
    return DEFAULT_REPO_INTEL_PROMPTS.map((p) => ({ ...p }));
}

function sanitizePrompt(value: unknown): RepoIntelPromptConfig | null {
    const raw = value as Partial<RepoIntelPromptConfig> | null | undefined;
    const task = raw?.task;
    if (task !== 'summarize_repo' && task !== 'ask_repo' && task !== 'map_topics') return null;
    if (typeof raw?.name !== 'string' || typeof raw?.systemInstruction !== 'string' || typeof raw?.promptTask !== 'string') return null;
    return {
        task,
        name: raw.name,
        systemInstruction: raw.systemInstruction,
        promptTask: raw.promptTask,
    };
}

export function getRepoIntelPromptConfigs(): RepoIntelPromptConfig[] {
    if (!hasLocalStorage()) return cloneDefaults();

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return cloneDefaults();

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return cloneDefaults();

        const sanitized = parsed.map(sanitizePrompt).filter((p): p is RepoIntelPromptConfig => Boolean(p));
        const byTask = new Map(sanitized.map((p) => [p.task, p] as const));

        return DEFAULT_REPO_INTEL_PROMPTS.map((defaults) => ({
            ...defaults,
            ...(byTask.get(defaults.task) ?? {}),
        }));
    } catch {
        return cloneDefaults();
    }
}

function saveRepoIntelPromptConfigs(prompts: RepoIntelPromptConfig[]): void {
    if (!hasLocalStorage()) return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
    } catch {
        // Ignore storage write errors in restricted environments.
    }
}

export function getRepoIntelPromptConfig(task: RepoIntelPromptTask): RepoIntelPromptConfig {
    return getRepoIntelPromptConfigs().find((p) => p.task === task) ?? cloneDefaults().find((p) => p.task === task)!;
}

export function getDefaultRepoIntelPromptConfig(task: RepoIntelPromptTask): RepoIntelPromptConfig {
    return cloneDefaults().find((p) => p.task === task)!;
}

export function updateRepoIntelPromptConfig(
    task: RepoIntelPromptTask,
    updates: Partial<Pick<RepoIntelPromptConfig, 'name' | 'systemInstruction' | 'promptTask'>>
): RepoIntelPromptConfig {
    const prompts = getRepoIntelPromptConfigs();
    const next = prompts.map((p) => p.task === task ? {
        ...p,
        ...(typeof updates.name === 'string' ? { name: updates.name } : {}),
        ...(typeof updates.systemInstruction === 'string' ? { systemInstruction: updates.systemInstruction } : {}),
        ...(typeof updates.promptTask === 'string' ? { promptTask: updates.promptTask } : {}),
    } : p);
    saveRepoIntelPromptConfigs(next);
    return next.find((p) => p.task === task)!;
}

export function resetRepoIntelPromptConfig(task: RepoIntelPromptTask): RepoIntelPromptConfig {
    const prompts = getRepoIntelPromptConfigs();
    const defaults = cloneDefaults().find((p) => p.task === task)!;
    const next = prompts.map((p) => p.task === task ? defaults : p);
    saveRepoIntelPromptConfigs(next);
    return defaults;
}
