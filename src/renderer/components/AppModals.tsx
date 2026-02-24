import React from 'react';
import { RatingPrompt } from './RatingPrompt';
import { CommitHistoryModal } from './CommitHistoryModal';
import { ContextMenu } from './ContextMenu';
import { SavePromptDialog } from './SavePromptDialog';
import { PromptGraphModal } from './PromptGraphModal';
import { ModelsModal } from './ModelsModal';
import { ProjectsPanel } from './ProjectsPanel';
import { WelcomeModal } from './WelcomeModal';
import { HelpModal } from './HelpModal';
import { LogsModal } from './LogsModal';
import { SettingsModal } from './SettingsModal';
import { UniversalGraphModal } from './UniversalGraphModal';
import { RepoPickerDialog } from './RepoPickerDialog';
import { RepoIntelPanel } from './RepoIntelPanel';
import { X, Volume2, Shield, Save, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import type { AIPrompt } from '../types';
import {
    getRepoIntelPromptConfigs,
    resetRepoIntelPromptConfig,
    updateRepoIntelPromptConfig,
} from '../services/repoIntelPromptConfig';

import { useUI, useProject, useAI, useEditor, useModels } from '../contexts';

const REPO_INTEL_PROMPT_PREFIX = 'repo-intel:';
const MODEL_PING_AUDIT_EVENT = 'run-model-selection-ping-audit';
const AUTO_MODEL_PING_AUDIT_KEY = 'diff-commit-auto-model-ping-audit-enabled';

interface ModelPingAuditRow {
    modelId: string;
    modelName: string;
    ok: boolean;
    latencyMs: number | null;
    message: string;
}

interface ModelPingAuditReport {
    startedAt: number;
    finishedAt: number;
    rows: ModelPingAuditRow[];
}

function isRepoIntelPromptId(id: string): boolean {
    return id.startsWith(REPO_INTEL_PROMPT_PREFIX);
}

function toRepoIntelPromptNodeOrder(index: number, aiPromptCount: number): number {
    return aiPromptCount + 100 + index;
}

export function AppModals() {
    const [projectsPanelStartInCreateMode, setProjectsPanelStartInCreateMode] = React.useState(false);
    const [repoIntelPromptVersion, setRepoIntelPromptVersion] = React.useState(0);
    const [isRunningModelPingAudit, setIsRunningModelPingAudit] = React.useState(false);
    const [modelPingAuditReport, setModelPingAuditReport] = React.useState<ModelPingAuditReport | null>(null);
    const hasAutoRunModelPingAuditRef = React.useRef(false);
    const {
        showHelp, setShowHelp,
        showLogs, setShowLogs,
        showProjectsPanel, setShowProjectsPanel,
        showPromptsModal, setShowPromptsModal,
        showModelsModal, setShowModelsModal,
        showCommitHistory, setShowCommitHistory,
        savePromptDialogOpen, setSavePromptDialogOpen,
        contextMenu, setContextMenu,
        errorMessage, setErrorMessage,
        activeLogId, setActiveLogId,
        showSettingsModal, setShowSettingsModal,
        showGraphModal, setShowGraphModal,
        showRepoPicker, setShowRepoPicker,
        showRepoIntelModal, setShowRepoIntelModal
    } = useUI();

    const {
        originalText
    } = useEditor();

    const {
        projects, currentProject, deleteProject, renameProject, moveProjectToRepository, createNewProject,
        openRepository, loadRepositoryByPath, createRepository, repositoryPath,
        commits, handleDeleteCommit, handleClearAllCommits,
        handleLoadProject, handleCreateProject,
        handleRestoreCommit, handleCompareCommit
    } = useProject();

    const {
        aiPrompts, createPrompt, updatePrompt, deletePrompt, resetBuiltIn,
        handleFactCheck, handleReadAloud,
        handleSaveAsPrompt, handleSavePromptSubmit, handleRate,
        pendingPromptText, setPendingPromptText,
        selectedModel, setDefaultModel,
        selectedImageModel, setDefaultImageModel,
        activePromptId, setDefaultPrompt
    } = useAI();
    const { models, pingModel } = useModels();

    const runModelSelectionPingAudit = React.useCallback(async () => {
        if (isRunningModelPingAudit) return;
        if (models.length === 0) return;

        setIsRunningModelPingAudit(true);
        const startedAt = Date.now();

        try {
            const targets = [...models];
            const rows: ModelPingAuditRow[] = [];

            for (const target of targets) {
                let result: { ok: boolean; latencyMs: number | null; message: string };
                try {
                    const ping = await pingModel(target.id);
                    result = { ok: ping.ok, latencyMs: ping.latencyMs, message: ping.message };
                } catch (error) {
                    result = {
                        ok: false,
                        latencyMs: null,
                        message: error instanceof Error ? error.message : 'Ping failed',
                    };
                }
                rows.push({
                    modelId: target.id,
                    modelName: target.name,
                    ok: result.ok,
                    latencyMs: result.latencyMs,
                    message: result.message,
                });
            }

            rows.sort((a, b) => {
                if (a.ok !== b.ok) return a.ok ? -1 : 1; // successes first
                if (!a.ok && !b.ok) return a.modelName.localeCompare(b.modelName);

                const aLatency = a.latencyMs ?? Number.POSITIVE_INFINITY;
                const bLatency = b.latencyMs ?? Number.POSITIVE_INFINITY;
                if (aLatency !== bLatency) return aLatency - bLatency; // fastest first

                return a.modelName.localeCompare(b.modelName);
            });

            setModelPingAuditReport({
                startedAt,
                finishedAt: Date.now(),
                rows,
            });
        } finally {
            setIsRunningModelPingAudit(false);
        }
    }, [isRunningModelPingAudit, models, pingModel]);

    React.useEffect(() => {
        const handler = () => {
            void runModelSelectionPingAudit();
        };
        window.addEventListener(MODEL_PING_AUDIT_EVENT, handler);
        return () => window.removeEventListener(MODEL_PING_AUDIT_EVENT, handler);
    }, [runModelSelectionPingAudit]);

    React.useEffect(() => {
        if (hasAutoRunModelPingAuditRef.current) return;
        if (models.length === 0) return;

        let enabled = true;
        try {
            const stored = localStorage.getItem(AUTO_MODEL_PING_AUDIT_KEY);
            enabled = stored !== 'false';
        } catch (error) {
            console.warn('Failed to read auto model ping audit preference:', error);
        }

        hasAutoRunModelPingAuditRef.current = true;
        if (!enabled) return;
        void runModelSelectionPingAudit();
    }, [models.length, runModelSelectionPingAudit]);

    const promptGraphPrompts = React.useMemo<AIPrompt[]>(() => {
        const repoIntelPromptNodes: AIPrompt[] = getRepoIntelPromptConfigs().map((prompt, index) => ({
            id: `${REPO_INTEL_PROMPT_PREFIX}${prompt.task}`,
            name: prompt.name,
            systemInstruction: prompt.systemInstruction,
            promptTask: prompt.promptTask,
            isBuiltIn: true,
            order: toRepoIntelPromptNodeOrder(index, aiPrompts.length),
            color: 'bg-yellow-400',
            isImageMode: false,
            pinned: false,
        }));
        return [...aiPrompts, ...repoIntelPromptNodes];
    }, [aiPrompts, repoIntelPromptVersion]);

    const handlePromptGraphUpdate = React.useCallback(async (id: string, updates: Partial<AIPrompt>) => {
        if (isRepoIntelPromptId(id)) {
            const task = id.replace(REPO_INTEL_PROMPT_PREFIX, '') as 'summarize_repo' | 'ask_repo' | 'map_topics';
            if (updates.name || updates.systemInstruction || updates.promptTask) {
                updateRepoIntelPromptConfig(task, {
                    ...(typeof updates.name === 'string' ? { name: updates.name } : {}),
                    ...(typeof updates.systemInstruction === 'string' ? { systemInstruction: updates.systemInstruction } : {}),
                    ...(typeof updates.promptTask === 'string' ? { promptTask: updates.promptTask } : {}),
                });
                setRepoIntelPromptVersion((v) => v + 1);
            }
            return;
        }
        await updatePrompt(id, updates);
    }, [updatePrompt]);

    const handlePromptGraphResetBuiltIn = React.useCallback(async (id: string) => {
        if (isRepoIntelPromptId(id)) {
            const task = id.replace(REPO_INTEL_PROMPT_PREFIX, '') as 'summarize_repo' | 'ask_repo' | 'map_topics';
            resetRepoIntelPromptConfig(task);
            setRepoIntelPromptVersion((v) => v + 1);
            return;
        }
        await resetBuiltIn(id);
    }, [resetBuiltIn]);

    const handlePromptGraphDelete = React.useCallback(async (id: string) => {
        if (isRepoIntelPromptId(id)) return;
        await deletePrompt(id);
    }, [deletePrompt]);

    const handlePromptGraphSetDefault = React.useCallback((id: string) => {
        if (isRepoIntelPromptId(id)) return;
        setDefaultPrompt(id);
    }, [setDefaultPrompt]);

    const failedModelPings = modelPingAuditReport?.rows.filter((row) => !row.ok) ?? [];
    const totalModelPings = modelPingAuditReport?.rows.length ?? 0;
    const durationMs = modelPingAuditReport
        ? modelPingAuditReport.finishedAt - modelPingAuditReport.startedAt
        : 0;

    return (
        <>
            {/* Hidden-trigger model ping audit status + report */}
            {isRunningModelPingAudit && (
                <div className="fixed top-6 right-6 z-[70] animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg px-4 py-3 flex items-center gap-3">
                        <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                        <div className="text-sm text-gray-800 dark:text-slate-200">
                            Running model ping audit...
                        </div>
                    </div>
                </div>
            )}

            {modelPingAuditReport && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={() => setModelPingAuditReport(null)}
                    />
                    <div className="relative w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-2xl">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-800">
                            <div>
                                <div className="flex items-center gap-2">
                                    {failedModelPings.length === 0 ? (
                                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                    ) : (
                                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                                    )}
                                    <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">
                                        AI Model Ping Audit
                                    </h3>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                                    {totalModelPings} available models checked in {durationMs}ms
                                    {failedModelPings.length > 0 ? ` • ${failedModelPings.length} failed` : ' • all passed'}
                                </p>
                            </div>
                            <button
                                onClick={() => setModelPingAuditReport(null)}
                                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                                title="Close"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="max-h-[65vh] overflow-y-auto p-4 space-y-2">
                            {modelPingAuditReport.rows.map((row, index) => (
                                <div
                                    key={`${row.modelId}-${index}`}
                                    className={`rounded-xl border p-3 ${row.ok
                                        ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/20'
                                        : 'border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/20'
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                {row.ok ? (
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                                ) : (
                                                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                                                )}
                                                <span className="text-sm font-medium text-gray-900 dark:text-slate-100">
                                                    {row.modelName}
                                                </span>
                                            </div>
                                            <div className="text-[11px] text-gray-500 dark:text-slate-400 font-mono truncate">
                                                {row.modelId}
                                            </div>
                                            {!row.ok && (
                                                <div className="text-xs text-red-700 dark:text-red-300 mt-2">
                                                    {row.message}
                                                </div>
                                            )}
                                        </div>
                                        <div className={`text-sm font-semibold shrink-0 ${row.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                                            {row.ok ? `${row.latencyMs ?? '-'}ms` : 'Failed'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Rating Prompt Toast */}
            {activeLogId && (
                <div className="fixed bottom-6 right-6 z-50">
                    <RatingPrompt
                        logId={String(activeLogId)}
                        onRate={handleRate}
                        onDismiss={() => setActiveLogId(null)}
                    />
                </div>
            )}

            {/* Error Toast */}
            {errorMessage && (
                <div className="fixed bottom-6 left-6 z-50 max-w-md animate-in slide-in-from-bottom-2 duration-200">
                    <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg shadow-lg p-4 flex items-start gap-3">
                        <div className="flex-shrink-0 w-5 h-5 text-red-500 dark:text-red-400 mt-0.5">
                            <X className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm text-red-800 dark:text-red-200">{errorMessage}</p>
                        </div>
                        <button
                            onClick={() => setErrorMessage(null)}
                            className="flex-shrink-0 text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-300 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Commit History Modal */}
            <CommitHistoryModal
                isOpen={showCommitHistory}
                onClose={() => setShowCommitHistory(false)}
                commits={commits}
                onRestore={handleRestoreCommit}
                onCompare={handleCompareCommit}
                onDelete={handleDeleteCommit}
                onClearAll={handleClearAllCommits}
                currentOriginalText={originalText}
            />

            {/* Context Menu for text selection */}
            <ContextMenu
                x={contextMenu?.x ?? 0}
                y={contextMenu?.y ?? 0}
                isOpen={!!contextMenu}
                onClose={() => setContextMenu(null)}
                actions={[
                    {
                        label: 'Read Selected',
                        icon: <Volume2 className="w-4 h-4" />,
                        onClick: handleReadAloud,
                        disabled: !contextMenu?.selection,
                        divider: true
                    },
                    {
                        label: 'Fact Check',
                        icon: <Shield className="w-4 h-4 text-cyan-500" />,
                        onClick: handleFactCheck,
                        disabled: !contextMenu?.selection,
                        subLabel: '$$$$'
                    },
                    {
                        label: 'Save as Prompt',
                        icon: <Save className="w-4 h-4 text-indigo-500" />,
                        onClick: handleSaveAsPrompt,
                        disabled: !contextMenu?.selection
                    }
                ]}
            />

            {/* Save as Prompt Dialog */}
            <SavePromptDialog
                isOpen={savePromptDialogOpen}
                onClose={() => {
                    setSavePromptDialogOpen(false);
                    setPendingPromptText('');
                }}
                selectedText={pendingPromptText}
                onSave={handleSavePromptSubmit}
            />

            {/* Prompts Management Modal */}
            <PromptGraphModal
                isOpen={showPromptsModal}
                onClose={() => setShowPromptsModal(false)}
                prompts={promptGraphPrompts}
                onCreatePrompt={createPrompt}
                onUpdatePrompt={handlePromptGraphUpdate}
                onDeletePrompt={handlePromptGraphDelete}
                onResetBuiltIn={handlePromptGraphResetBuiltIn}
                defaultPromptId={activePromptId}
                onSetDefault={handlePromptGraphSetDefault}
                selectedModel={selectedModel}
                selectedImageModel={selectedImageModel}
                onEditInEditor={(prompt) => {
                    const detail = isRepoIntelPromptId(prompt.id)
                        ? {
                            prompt,
                            onSavePromptEdits: async (promptId: string, updates: Partial<AIPrompt>) => {
                                await handlePromptGraphUpdate(promptId, updates);
                            },
                        }
                        : { prompt };
                    const content = `[PROMPT: ${prompt.name}]\n\n--- System Instruction ---\n${prompt.systemInstruction}\n\n--- Task ---\n${prompt.promptTask}`;
                    const event = new CustomEvent('load-prompt-to-editor', { detail: { ...detail, content } });
                    window.dispatchEvent(event);
                }}
            />

            {/* Models Manager Modal */}
            <ModelsModal
                isOpen={showModelsModal}
                onClose={() => setShowModelsModal(false)}
                selectedModel={selectedModel}
                selectedImageModel={selectedImageModel}
                onSetDefault={setDefaultModel}
                onSetImageDefault={setDefaultImageModel}
            />

            {/* Projects Panel */}
            <ProjectsPanel
                isOpen={showProjectsPanel}
                onClose={() => {
                    setShowProjectsPanel(false);
                    setProjectsPanelStartInCreateMode(false);
                }}
                onExitToEditor={() => {
                    setProjectsPanelStartInCreateMode(false);
                    setShowGraphModal(false);
                }}
                startInCreateMode={projectsPanelStartInCreateMode}
                projects={projects}
                currentProject={currentProject}
                onLoadProject={handleLoadProject}
                onCreateProject={handleCreateProject}
                onDeleteProject={deleteProject}
                onRenameProject={renameProject}
                onOpenRepository={openRepository}
                onCreateRepository={createRepository}
                repositoryPath={repositoryPath}
            />

            {/* Help & Logs Modals */}
            <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
            <LogsModal isOpen={showLogs} onClose={() => setShowLogs(false)} />

            {/* Welcome Gate - mothballed for now to open directly in the app */}
            <WelcomeModal
                isOpen={false}
                onCreateRepository={createRepository}
                onOpenRepository={openRepository}
            />

            {/* Settings Modal */}
            <SettingsModal
                isOpen={showSettingsModal}
                onClose={() => setShowSettingsModal(false)}
            />

            <RepoPickerDialog
                isOpen={showRepoPicker}
                onClose={() => setShowRepoPicker(false)}
                onSelect={async (repo) => {
                    await loadRepositoryByPath(repo.path);
                    setShowRepoPicker(false);
                }}
                onCreateRepository={async () => {
                    await createRepository();
                }}
            />

            <RepoIntelPanel
                isOpen={showRepoIntelModal}
                onClose={() => setShowRepoIntelModal(false)}
                onOpenProject={async (projectId) => {
                    await handleLoadProject(projectId);
                    setShowRepoIntelModal(false);
                    setShowGraphModal(false);
                }}
            />

            {/* Universal Graph Modal */}
            <UniversalGraphModal
                isOpen={showGraphModal}
                onClose={() => setShowGraphModal(false)}
                projects={projects}
                repositoryPath={repositoryPath}
                currentProjectId={currentProject?.id}
                onOpenProject={async (projectId) => {
                    await handleLoadProject(projectId);
                    setShowGraphModal(false);
                }}
                onCreateProject={async (name, content, open) => {
                    return await createNewProject(name, content, open);
                }}
                onSwitchRepository={async (repoPath) => {
                    await loadRepositoryByPath(repoPath);
                }}
                onMoveProject={async (projectId, targetRepoPath) => {
                    try {
                        const moved = await moveProjectToRepository(projectId, targetRepoPath);
                        return Boolean(moved);
                    } catch (error) {
                        const message = error instanceof Error ? error.message : 'Failed to move project';
                        setErrorMessage(message);
                        return false;
                    }
                }}
                onDeleteProject={async (projectId) => {
                    try {
                        await deleteProject(projectId);
                    } catch (error) {
                        const message = error instanceof Error ? error.message : 'Failed to delete project';
                        setErrorMessage(message);
                    }
                }}
                onNewProject={() => {
                    setProjectsPanelStartInCreateMode(true);
                    setShowProjectsPanel(true);
                }}
                onOpenRepoIntel={() => {
                    setShowRepoIntelModal(true);
                }}
            />
        </>
    );
}
