import React from 'react';
import { RatingPrompt } from './RatingPrompt';
import { CommitHistoryModal } from './CommitHistoryModal';
import { ContextMenu } from './ContextMenu';
import { SavePromptDialog } from './SavePromptDialog';
import { PromptsModal } from './PromptsModal';
import { ProjectsPanel } from './ProjectsPanel';
import { WelcomeModal } from './WelcomeModal';
import { HelpModal } from './HelpModal';
import { LogsModal } from './LogsModal';
import { X, Volume2, Wand2, Shield, Save } from 'lucide-react';
import { TextCommit, AIPrompt, ViewMode, PolishMode, Project } from '../types';

interface AppModalsProps {
    // Rating Prompt
    activeLogId: string | number | null;
    handleRate: (id: string | number, rating: number, feedback: string) => void;
    setActiveLogId: (id: string | number | null) => void;

    // Error Toast
    errorMessage: string | null;
    setErrorMessage: (msg: string | null) => void;

    // Commit History
    showCommitHistory: boolean;
    setShowCommitHistory: (show: boolean) => void;
    commits: TextCommit[];
    handleRestoreCommit: (commit: TextCommit) => void;
    handleCompareCommit: (commit: TextCommit) => void;
    handleDeleteCommit: (id: string) => void;
    handleClearAllCommits: () => void;
    originalText: string;

    // Context Menu
    contextMenu: { x: number; y: number; selection?: string } | null;
    setContextMenu: (menu: { x: number; y: number; selection?: string } | null) => void;
    handleReadAloud: () => void;
    handlePolishSelection: (mode: PolishMode) => void;
    handleFactCheck: () => void;
    handleSaveAsPrompt: () => void;

    // Save Prompt Dialog
    savePromptDialogOpen: boolean;
    setSavePromptDialogOpen: (open: boolean) => void;
    pendingPromptText: string;
    setPendingPromptText: (text: string) => void;
    handleSavePromptSubmit: (prompt: AIPrompt) => Promise<void>;

    // Prompts Management
    showPromptsModal: boolean;
    setShowPromptsModal: (show: boolean) => void;
    aiPrompts: AIPrompt[];
    createPrompt: (data: Partial<AIPrompt>) => Promise<void>;
    updatePrompt: (id: string, updates: Partial<AIPrompt>) => Promise<void>;
    deletePrompt: (id: string) => Promise<void>;
    resetBuiltIn: (id: string) => Promise<void>;

    // Projects Panel
    showProjectsPanel: boolean;
    setShowProjectsPanel: (show: boolean) => void;
    projects: Project[];
    currentProject: Project | null;
    loadProject: (id: string) => Promise<Project | null>;
    setOriginalText: (content: string) => void;
    setPreviewText: (content: string) => void;
    setModifiedText: (content: string) => void;
    resetDiffState: () => void;
    createNewProject: (name: string, content: string) => Promise<Project>;
    deleteProjectById: (id: string) => Promise<void>;
    renameProjectById: (id: string, newName: string) => Promise<Project | null>;
    openRepository: () => Promise<void>;
    createRepository: () => Promise<void>;
    repositoryPath: string | null;
    getRepoHandle: () => FileSystemDirectoryHandle | null;

    // Help & Logs
    showHelp: boolean;
    setShowHelp: (show: boolean) => void;
    showLogs: boolean;
    setShowLogs: (show: boolean) => void;

    // Welcome Modal
    handleCreateRepository: () => Promise<void>;
    handleOpenRepository: () => Promise<void>;
}

export function AppModals({
    activeLogId,
    handleRate,
    setActiveLogId,
    errorMessage,
    setErrorMessage,
    showCommitHistory,
    setShowCommitHistory,
    commits,
    handleRestoreCommit,
    handleCompareCommit,
    handleDeleteCommit,
    handleClearAllCommits,
    originalText,
    contextMenu,
    setContextMenu,
    handleReadAloud,
    handlePolishSelection,
    handleFactCheck,
    handleSaveAsPrompt,
    savePromptDialogOpen,
    setSavePromptDialogOpen,
    pendingPromptText,
    setPendingPromptText,
    handleSavePromptSubmit,
    showPromptsModal,
    setShowPromptsModal,
    aiPrompts,
    createPrompt,
    updatePrompt,
    deletePrompt,
    resetBuiltIn,
    showProjectsPanel,
    setShowProjectsPanel,
    projects,
    currentProject,
    loadProject,
    setOriginalText,
    setPreviewText,
    setModifiedText,
    resetDiffState,
    createNewProject,
    deleteProjectById,
    renameProjectById,
    openRepository,
    createRepository,
    repositoryPath,
    getRepoHandle,
    showHelp,
    setShowHelp,
    showLogs,
    setShowLogs,
    handleCreateRepository,
    handleOpenRepository
}: AppModalsProps) {
    return (
        <>
            {/* Rating Prompt Toast */}
            {activeLogId && (
                <div className="fixed bottom-6 right-6 z-50">
                    <RatingPrompt
                        logId={activeLogId as string}
                        onRate={(id, rating, feedback) => {
                            handleRate(id, rating, feedback);
                            setActiveLogId(null);
                        }}
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
                        disabled: !contextMenu?.selection
                    },
                    {
                        label: 'Spelling Only',
                        icon: <Wand2 className="w-4 h-4 text-blue-500" />,
                        onClick: () => handlePolishSelection('spelling'),
                        disabled: !contextMenu?.selection,
                        divider: true
                    },
                    {
                        label: 'Grammar & Spelling',
                        icon: <Wand2 className="w-4 h-4 text-emerald-500" />,
                        onClick: () => handlePolishSelection('grammar'),
                        disabled: !contextMenu?.selection
                    },
                    {
                        label: 'Full Polish',
                        icon: <Wand2 className="w-4 h-4 text-purple-500" />,
                        onClick: () => handlePolishSelection('polish'),
                        disabled: !contextMenu?.selection,
                        subLabel: '$$'
                    },
                    {
                        label: 'Prompt Expansion',
                        icon: <Wand2 className="w-4 h-4 text-amber-500" />,
                        onClick: () => handlePolishSelection('prompt'),
                        disabled: !contextMenu?.selection,
                        divider: true
                    },
                    {
                        label: 'Execute Prompt',
                        icon: <Wand2 className="w-4 h-4 text-rose-500" />,
                        onClick: () => handlePolishSelection('execute'),
                        disabled: !contextMenu?.selection
                    },
                    {
                        label: 'Fact Check',
                        icon: <Shield className="w-4 h-4 text-cyan-500" />,
                        onClick: handleFactCheck,
                        disabled: !contextMenu?.selection,
                        subLabel: '$$$$',
                        divider: true
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
            <PromptsModal
                isOpen={showPromptsModal}
                onClose={() => setShowPromptsModal(false)}
                prompts={aiPrompts}
                onCreatePrompt={async (data) => { await createPrompt(data); }}
                onUpdatePrompt={async (id, updates) => { await updatePrompt(id, updates); }}
                onDeletePrompt={async (id) => { await deletePrompt(id); }}
                onResetBuiltIn={async (id) => { await resetBuiltIn(id); }}
            />

            {/* Projects Panel */}
            <ProjectsPanel
                isOpen={showProjectsPanel}
                onClose={() => setShowProjectsPanel(false)}
                projects={projects}
                currentProject={currentProject}
                onLoadProject={async (id) => {
                    const project = await loadProject(id);
                    if (project) {
                        let contentToLoad = project.content || '';

                        // If draft content is empty, try to load the latest commit
                        if (!contentToLoad.trim()) {
                            // Try Electron first
                            if (window.electron?.loadProjectCommits && project.path) {
                                try {
                                    const commits = await window.electron.loadProjectCommits(project.path);
                                    if (commits && commits.length > 0) {
                                        contentToLoad = commits[commits.length - 1].content;
                                    }
                                } catch (e) {
                                    console.warn('Failed to load commits for initial content:', e);
                                }
                            } else {
                                // Try browser file system
                                const handle = getRepoHandle();
                                if (handle && project.name) {
                                    try {
                                        const { loadProjectCommits } = await import('../services/browserFileSystem');
                                        const commits = await loadProjectCommits(handle, project.name);
                                        if (commits && commits.length > 0) {
                                            contentToLoad = commits[commits.length - 1].content;
                                        }
                                    } catch (e) {
                                        console.warn('Failed to load commits from browser FS:', e);
                                    }
                                }
                            }
                        }

                        // Load project content into the editor - always reset all panels
                        setOriginalText(contentToLoad);
                        setPreviewText(contentToLoad);
                        setModifiedText('');
                        resetDiffState();
                    }
                    return project;
                }}
                onCreateProject={async (name) => {
                    // Always create with empty content - don't inherit from previous project
                    const newProject = await createNewProject(name, '');
                    // Clear editor state for new project
                    setOriginalText('');
                    setPreviewText('');
                    setModifiedText('');
                    resetDiffState();
                    return newProject;
                }}
                onDeleteProject={deleteProjectById}
                onRenameProject={renameProjectById}
                onOpenRepository={openRepository}
                onCreateRepository={createRepository}
                repositoryPath={repositoryPath}
            />

            {/* Help & Logs Modals */}
            <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
            <LogsModal isOpen={showLogs} onClose={() => setShowLogs(false)} />

            {/* Welcome Gate - forces users to select a repository before using the app */}
            <WelcomeModal
                isOpen={!repositoryPath}
                onCreateRepository={handleCreateRepository}
                onOpenRepository={handleOpenRepository}
            />
        </>
    );
}
