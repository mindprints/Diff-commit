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

import { useUI, useProject, useAI, useEditor } from '../contexts';

export function AppModals() {
    const {
        showHelp, setShowHelp,
        showLogs, setShowLogs,
        showProjectsPanel, setShowProjectsPanel,
        showPromptsModal, setShowPromptsModal,
        showCommitHistory, setShowCommitHistory,
        savePromptDialogOpen, setSavePromptDialogOpen,
        contextMenu, setContextMenu,
        errorMessage, setErrorMessage,
        activeLogId, setActiveLogId
    } = useUI();

    const {
        originalText
    } = useEditor();

    const {
        projects, currentProject, deleteProject, renameProject,
        openRepository, createRepository, repositoryPath,
        commits, handleDeleteCommit, handleClearAllCommits,
        handleLoadProject, handleCreateProject,
        handleRestoreCommit, handleCompareCommit
    } = useProject();

    const {
        aiPrompts, createPrompt, updatePrompt, deletePrompt, resetBuiltIn,
        handleFactCheck, handleReadAloud,
        handlePolishSelection, handleSaveAsPrompt, handleSavePromptSubmit, handleRate,
        pendingPromptText, setPendingPromptText
    } = useAI();

    return (
        <>
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
            <PromptsModal
                isOpen={showPromptsModal}
                onClose={() => setShowPromptsModal(false)}
                prompts={aiPrompts}
                onCreatePrompt={createPrompt}
                onUpdatePrompt={(id, updates) => updatePrompt({ ...updates, id })}
                onDeletePrompt={deletePrompt}
                onResetBuiltIn={resetBuiltIn}
            />

            {/* Projects Panel */}
            <ProjectsPanel
                isOpen={showProjectsPanel}
                onClose={() => setShowProjectsPanel(false)}
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

            {/* Welcome Gate - forces users to select a repository before using the app */}
            <WelcomeModal
                isOpen={!repositoryPath}
                onCreateRepository={createRepository}
                onOpenRepository={openRepository}
            />
        </>
    );
}
