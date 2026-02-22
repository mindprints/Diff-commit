import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type {
    RepoIntelAnswer,
    RepoIntelIndexStats,
    RepoIntelTask,
    RepoRedundancyReport,
} from '../../shared/repoIntelTypes';
import { useAI } from './AIContext';
import { useProject } from './ProjectContext';
import * as repoIntelService from '../services/repoIntelService';

interface RepoIntelState {
    activeRepoPath: string | null;
    indexStats: RepoIntelIndexStats | null;
    isBusy: boolean;
    activeTask: RepoIntelTask | null;
    lastAnswer: RepoIntelAnswer | null;
    history: RepoIntelAnswer[];
    lastRedundancyReport: RepoRedundancyReport | null;
    error: string | null;
}

interface RepoIntelContextType extends RepoIntelState {
    setActiveRepo: (repoPath: string | null) => void;
    ensureIndex: (repoPath?: string) => Promise<void>;
    summarizeRepo: (repoPath?: string) => Promise<RepoIntelAnswer | null>;
    askRepo: (question: string, repoPath?: string) => Promise<RepoIntelAnswer | null>;
    findRedundancy: (repoPath?: string) => Promise<RepoRedundancyReport | null>;
    mapTopics: (repoPath?: string) => Promise<RepoIntelAnswer | null>;
    clearError: () => void;
    clearHistory: () => void;
}

const RepoIntelContext = createContext<RepoIntelContextType | undefined>(undefined);

function toMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Repo intelligence request failed';
}

export function RepoIntelProvider({ children }: { children: React.ReactNode }) {
    const { selectedModel } = useAI();
    const { repositoryPath } = useProject();

    const [activeRepoPath, setActiveRepoPath] = useState<string | null>(null);
    const [indexStats, setIndexStats] = useState<RepoIntelIndexStats | null>(null);
    const [isBusy, setIsBusy] = useState(false);
    const [activeTask, setActiveTask] = useState<RepoIntelTask | null>(null);
    const [lastAnswer, setLastAnswer] = useState<RepoIntelAnswer | null>(null);
    const [history, setHistory] = useState<RepoIntelAnswer[]>([]);
    const [lastRedundancyReport, setLastRedundancyReport] = useState<RepoRedundancyReport | null>(null);
    const [error, setError] = useState<string | null>(null);

    const resolveRepoPath = useCallback((repoPath?: string) => {
        return repoPath || activeRepoPath || repositoryPath || null;
    }, [activeRepoPath, repositoryPath]);

    const ensureIndex = useCallback(async (repoPath?: string) => {
        const resolved = resolveRepoPath(repoPath);
        if (!resolved) throw new Error('No repository selected for repo intelligence.');
        setError(null);
        if (!window.electron?.repoIntel) {
            // Renderer fallback path: indexing is on-demand in repoIntelService
            setIndexStats({
                repoPath: resolved,
                schemaVersion: 1,
                builtAt: Date.now(),
                sourceCount: 0,
                chunkCount: 0,
                status: 'ready',
            });
            return;
        }
        const stats = await window.electron.repoIntel.getIndexStatus(resolved);
        if (stats.status !== 'ready') {
            const built = await window.electron.repoIntel.buildIndex(resolved, { includeProjects: true });
            setIndexStats(built);
            return;
        }
        setIndexStats(stats);
    }, [resolveRepoPath]);

    const runAnswerTask = useCallback(async (
        task: RepoIntelTask,
        runner: (repoPath: string) => Promise<RepoIntelAnswer>
    ): Promise<RepoIntelAnswer | null> => {
        const resolved = resolveRepoPath();
        if (!resolved) {
            setError('No repository selected for repo intelligence.');
            return null;
        }
        setIsBusy(true);
        setActiveTask(task);
        setError(null);
        try {
            const answer = await runner(resolved);
            setLastAnswer(answer);
            setHistory((prev) => [answer, ...prev]);
            return answer;
        } catch (e) {
            setError(toMessage(e));
            return null;
        } finally {
            setIsBusy(false);
            setActiveTask(null);
        }
    }, [resolveRepoPath]);

    const summarizeRepo = useCallback(async (repoPath?: string) => {
        const resolved = resolveRepoPath(repoPath);
        if (!resolved) {
            setError('No repository selected for repo intelligence.');
            return null;
        }
        return runAnswerTask('summarize_repo', (path) => repoIntelService.summarizeRepo(path, selectedModel));
    }, [resolveRepoPath, runAnswerTask, selectedModel]);

    const askRepo = useCallback(async (question: string, repoPath?: string) => {
        const resolved = resolveRepoPath(repoPath);
        if (!resolved) {
            setError('No repository selected for repo intelligence.');
            return null;
        }
        return runAnswerTask('ask_repo', (path) => repoIntelService.askRepo(path, question, selectedModel));
    }, [resolveRepoPath, runAnswerTask, selectedModel]);

    const mapTopics = useCallback(async (repoPath?: string) => {
        const resolved = resolveRepoPath(repoPath);
        if (!resolved) {
            setError('No repository selected for repo intelligence.');
            return null;
        }
        return runAnswerTask('map_topics', (path) => repoIntelService.mapRepoTopics(path, selectedModel));
    }, [resolveRepoPath, runAnswerTask, selectedModel]);

    const findRedundancy = useCallback(async (repoPath?: string) => {
        const resolved = resolveRepoPath(repoPath);
        if (!resolved) {
            setError('No repository selected for repo intelligence.');
            return null;
        }
        setIsBusy(true);
        setActiveTask('find_redundancy');
        setError(null);
        try {
            const report = await repoIntelService.findRepoRedundancy(resolved);
            setLastRedundancyReport(report);
            return report;
        } catch (e) {
            setError(toMessage(e));
            return null;
        } finally {
            setIsBusy(false);
            setActiveTask(null);
        }
    }, [resolveRepoPath]);

    const value = useMemo<RepoIntelContextType>(() => ({
        activeRepoPath,
        indexStats,
        isBusy,
        activeTask,
        lastAnswer,
        history,
        lastRedundancyReport,
        error,
        setActiveRepo: setActiveRepoPath,
        ensureIndex,
        summarizeRepo,
        askRepo,
        findRedundancy,
        mapTopics,
        clearError: () => setError(null),
        clearHistory: () => setHistory([]),
    }), [
        activeRepoPath,
        indexStats,
        isBusy,
        activeTask,
        lastAnswer,
        history,
        lastRedundancyReport,
        error,
        ensureIndex,
        summarizeRepo,
        askRepo,
        findRedundancy,
        mapTopics,
    ]);

    return (
        <RepoIntelContext.Provider value={value}>
            {children}
        </RepoIntelContext.Provider>
    );
}

export function useRepoIntel() {
    const context = useContext(RepoIntelContext);
    if (!context) {
        throw new Error('useRepoIntel must be used within a RepoIntelProvider');
    }
    return context;
}
