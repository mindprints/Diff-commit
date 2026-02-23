import React, { useEffect, useMemo, useState } from 'react';
import { Brain, FileSearch, Sparkles, X } from 'lucide-react';
import { Button } from './Button';
import { useProject, useRepoIntel } from '../contexts';
import type { AIPrompt } from '../types';
import type { RepoIntelPromptTask } from '../services/repoIntelPromptConfig';
import { getDefaultRepoIntelPromptConfig, updateRepoIntelPromptConfig } from '../services/repoIntelPromptConfig';

interface RepoIntelPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenProject?: (projectId: string) => Promise<void>;
}

export function RepoIntelPanel({ isOpen, onClose, onOpenProject }: RepoIntelPanelProps) {
    const { repositoryPath } = useProject();
    const {
        setActiveRepo,
        ensureIndex,
        summarizeRepo,
        askRepo,
        findRedundancy,
        isBusy,
        activeTask,
        lastAnswer,
        lastRedundancyReport,
        error,
        clearError,
        history,
    } = useRepoIntel();
    const [question, setQuestion] = useState('');
    const [newPromptTask, setNewPromptTask] = useState<RepoIntelPromptTask>('ask_repo');

    useEffect(() => {
        if (isOpen && repositoryPath) {
            setActiveRepo(repositoryPath);
        }
    }, [isOpen, repositoryPath, setActiveRepo]);

    const repoLabel = useMemo(() => {
        if (!repositoryPath) return 'No repository selected';
        const parts = repositoryPath.split(/[\\/]/).filter(Boolean);
        return parts[parts.length - 1] || repositoryPath;
    }, [repositoryPath]);

    if (!isOpen) return null;

    const openRepoIntelPromptTemplateInEditor = (task: RepoIntelPromptTask) => {
        const template = getDefaultRepoIntelPromptConfig(task);
        const promptLike: AIPrompt = {
            id: `repo-intel:${task}`,
            name: template.name,
            systemInstruction: template.systemInstruction,
            promptTask: template.promptTask,
            isBuiltIn: true,
            order: 0,
            color: 'bg-yellow-400',
            isImageMode: false,
        };

        const event = new CustomEvent('load-prompt-to-editor', {
            detail: {
                prompt: promptLike,
                onSavePromptEdits: async (_promptId: string, updates: Partial<AIPrompt>) => {
                    updateRepoIntelPromptConfig(task, {
                        ...(typeof updates.name === 'string' ? { name: updates.name } : {}),
                        ...(typeof updates.systemInstruction === 'string' ? { systemInstruction: updates.systemInstruction } : {}),
                        ...(typeof updates.promptTask === 'string' ? { promptTask: updates.promptTask } : {}),
                    });
                },
            },
        });
        window.dispatchEvent(event);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-[min(1000px,calc(100vw-2rem))] h-[min(760px,calc(100vh-2rem))] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                            <Brain className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Repo Intelligence (Prototype)</div>
                            <div className="text-xs text-gray-500 dark:text-slate-400">Analyzing repo: {repoLabel}</div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[320px_1fr]">
                    <div className="border-r border-gray-200 dark:border-slate-800 p-4 flex flex-col gap-4 overflow-y-auto">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-600 dark:text-slate-300">Repo Intel Prompt</label>
                            <select
                                value={newPromptTask}
                                onChange={(e) => setNewPromptTask(e.target.value as RepoIntelPromptTask)}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
                            >
                                <option value="ask_repo">Ask Repo</option>
                                <option value="summarize_repo">Summarize Repo</option>
                                <option value="map_topics">Map Topics</option>
                            </select>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { clearError(); openRepoIntelPromptTemplateInEditor(newPromptTask); }}
                                disabled={isBusy}
                                className="w-full justify-start"
                            >
                                Create New
                            </Button>
                            <div className="text-[11px] text-gray-500 dark:text-slate-400">
                                Opens a fresh template and saves into the selected Repo Intel task prompt.
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => { clearError(); await ensureIndex(); }}
                                disabled={!repositoryPath || isBusy}
                                className="w-full justify-start"
                                icon={<FileSearch className="w-3.5 h-3.5" />}
                            >
                                Build / Refresh Index
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => { clearError(); await summarizeRepo(); }}
                                disabled={!repositoryPath || isBusy}
                                className="w-full justify-start"
                                icon={<Sparkles className="w-3.5 h-3.5" />}
                            >
                                Summarize Repo
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => { clearError(); await findRedundancy(); }}
                                disabled={!repositoryPath || isBusy}
                                className="w-full justify-start"
                                icon={<Brain className="w-3.5 h-3.5" />}
                            >
                                Find Redundancy
                            </Button>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-600 dark:text-slate-300">Ask Repo</label>
                            <textarea
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                rows={4}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 resize-none"
                                placeholder="What projects overlap on onboarding? What does this repo cover?"
                            />
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={async () => { if (question.trim()) { clearError(); await askRepo(question.trim()); } }}
                                disabled={!repositoryPath || isBusy || !question.trim()}
                                className="w-full"
                            >
                                Ask
                            </Button>
                        </div>

                        {error && (
                            <div className="text-xs rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 p-3">
                                {error}
                            </div>
                        )}

                        <div>
                            <div className="text-xs font-semibold text-gray-600 dark:text-slate-300 mb-2">History</div>
                            <div className="space-y-2">
                                {history.length === 0 && (
                                    <div className="text-xs text-gray-500 dark:text-slate-400">No analyses yet.</div>
                                )}
                                {history.slice(0, 6).map((item, idx) => (
                                    <div key={`${item.createdAt}-${idx}`} className="rounded-lg border border-gray-200 dark:border-slate-700 p-2">
                                        <div className="text-xs font-medium text-gray-800 dark:text-slate-200">{item.task}</div>
                                        {item.question && <div className="text-xs text-gray-500 dark:text-slate-400 truncate">{item.question}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="p-4 overflow-y-auto space-y-4">
                        <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800/40">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Result</div>
                                {isBusy && (
                                    <div className="text-xs text-indigo-600 dark:text-indigo-300">
                                        Running {activeTask || 'task'}...
                                    </div>
                                )}
                            </div>
                            {lastAnswer ? (
                                <>
                                    <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">
                                        {lastAnswer.task}{lastAnswer.question ? ` • ${lastAnswer.question}` : ''}
                                    </div>
                                    <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-slate-200 font-sans">
                                        {lastAnswer.answerMarkdown}
                                    </pre>
                                </>
                            ) : (
                                <div className="text-sm text-gray-500 dark:text-slate-400">
                                    Run a repo analysis task to see results here.
                                </div>
                            )}
                        </div>

                        <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800/40">
                            <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-2">Citations</div>
                            <div className="space-y-2">
                                {lastAnswer?.citations?.length ? lastAnswer.citations.map((c) => (
                                    <div key={`${c.sourceId}-${c.chunkId}`} className="rounded-lg border border-gray-200 dark:border-slate-700 p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="text-xs font-medium text-gray-800 dark:text-slate-200">
                                                {c.projectName || c.sourceId}
                                            </div>
                                            {c.projectId && onOpenProject && (
                                                <button
                                                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                                                    onClick={() => { void onOpenProject(c.projectId!); }}
                                                >
                                                    Open
                                                </button>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{c.snippet}</div>
                                    </div>
                                )) : (
                                    <div className="text-sm text-gray-500 dark:text-slate-400">No citations yet (placeholder until AI grounding output is wired).</div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800/40">
                            <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-2">Redundancy Report</div>
                            {lastRedundancyReport ? (
                                <div className="space-y-2">
                                    {lastRedundancyReport.pairs.length === 0 && (
                                        <div className="text-sm text-gray-500 dark:text-slate-400">No overlap pairs above threshold.</div>
                                    )}
                                    {lastRedundancyReport.pairs.slice(0, 20).map((pair, idx) => (
                                        <div key={`${pair.aSourceId}-${pair.bSourceId}-${idx}`} className="text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-3">
                                            <div className="font-medium text-gray-800 dark:text-slate-200">
                                                {pair.overlapType} ({Math.round(pair.similarity * 100)}%)
                                            </div>
                                            <div className="text-gray-500 dark:text-slate-400 mt-1 break-all">
                                                {pair.aSourceId} ↔ {pair.bSourceId}
                                            </div>
                                            <div className="text-gray-500 dark:text-slate-400 mt-1">{pair.rationale}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-sm text-gray-500 dark:text-slate-400">Run “Find Redundancy” to inspect overlap across projects.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
