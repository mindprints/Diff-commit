import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo, useEffect } from 'react';
import { useProjects } from '../hooks/useProjects';
import { useCommitHistory } from '../hooks/useCommitHistory';
import { useEditor } from './EditorContext';
import { useUI } from './UIContext';
import { TextCommit, ViewMode } from '../types';

interface ProjectContextType {
    // useProjects
    projects: any[];
    currentProject: any;
    loadProject: (id: string) => Promise<any>;
    saveCurrentProject: (content: string) => Promise<void>;
    createNewProject: (name: string, content: string) => Promise<any>;
    handleLoadProject: (id: string) => Promise<any>;
    handleCreateProject: (name: string) => Promise<any>;
    deleteProject: (id: string) => Promise<void>;
    renameProject: (id: string, newName: string) => Promise<any | null>;
    openRepository: () => Promise<void>;
    createRepository: () => Promise<void>;
    repositoryPath: string | null;
    getRepoHandle: () => FileSystemDirectoryHandle | null;
    refreshProjects: () => Promise<void>;

    // useCommitHistory
    commits: TextCommit[];
    setCommits: React.Dispatch<React.SetStateAction<TextCommit[]>>;
    handleCommit: (summary?: string) => Promise<string | undefined>;
    handleAccept: () => void;
    handleCommitClick: (e?: React.MouseEvent) => Promise<void>;
    handleDeleteCommit: (id: string) => Promise<void>;
    handleClearAllCommits: () => Promise<void>;
    handleClearAll: () => void;
    handleExportCommits: () => void;
    handleImportCommits: (content: string) => void;
    handleFileOpen: (content: string) => void;
    handleNewProject: () => void;

    // Additional state
    hasUnsavedChanges: boolean;
    setHasUnsavedChanges: (has: boolean) => void;

    // Derived handlers
    handleRestoreCommit: (commit: TextCommit) => void;
    handleCompareCommit: (commit: TextCommit) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
    const { setOriginalText, setPreviewText, setModifiedText, resetDiffState, mode, setMode, originalText, previewText, performDiff } = useEditor();
    const { setShowProjectsPanel, setErrorMessage, isShiftHeld } = useUI();
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    const {
        projects,
        currentProject,
        loadProject,
        saveCurrentProject,
        createNewProject,
        deleteProject,
        renameProject,
        openRepository,
        createRepository,
        repositoryPath,
        getRepoHandle,
        refreshProjects
    } = useProjects();

    const getCommitText = useCallback(() => {
        // Always commit the preview text (what user sees in the editor)
        // In DIFF mode, previewText still contains the editor content
        return previewText;
    }, [previewText]);

    const onAfterCommit = useCallback(async (committedText: string) => {
        setOriginalText(committedText);
        setPreviewText(committedText);
        setModifiedText('');
        resetDiffState();

        if (currentProject) {
            await saveCurrentProject(committedText);
        }
    }, [resetDiffState, currentProject, saveCurrentProject, setOriginalText, setPreviewText, setModifiedText]);

    const browserLoadCommits = useMemo(() => {
        if (!currentProject?.name) return undefined;
        return async () => {
            const handle = getRepoHandle();
            if (handle && currentProject.name) {
                const { loadProjectCommits } = await import('../services/browserFileSystem');
                return loadProjectCommits(handle, currentProject.name);
            }
            return [];
        };
    }, [currentProject?.name, getRepoHandle]);

    const browserSaveCommits = useMemo(() => {
        if (!currentProject?.name) return undefined;
        return async (commits: any[]) => {
            const handle = getRepoHandle();
            if (handle && currentProject.name) {
                const { saveProjectCommits } = await import('../services/browserFileSystem');
                return saveProjectCommits(handle, currentProject.name, commits);
            }
            return false;
        };
    }, [currentProject?.name, getRepoHandle]);

    const {
        commits,
        setCommits,
        handleCommit,
        handleDeleteCommit,
        handleClearAllCommits,
    } = useCommitHistory({
        getCommitText,
        onAfterCommit,
        currentProjectPath: currentProject?.path,
        currentProjectName: currentProject?.name,
        browserLoadCommits,
        browserSaveCommits,
    });

    const handleRestoreCommit = useCallback((commit: TextCommit) => {
        setOriginalText(commit.content);
        setPreviewText(commit.content);
        setModifiedText('');
        resetDiffState();
    }, [setOriginalText, setPreviewText, setModifiedText, resetDiffState]);

    const handleAccept = useCallback(() => {
        setOriginalText(previewText);
        setModifiedText('');
        resetDiffState();
    }, [previewText, setOriginalText, setModifiedText, resetDiffState]);

    const handleCommitClick = useCallback(async (e?: React.MouseEvent) => {
        // Check shiftKey directly from event for reliable first-click detection
        const shiftPressed = e?.shiftKey ?? isShiftHeld;
        if (shiftPressed) {
            await handleCommit();
            setHasUnsavedChanges(false);
        } else {
            handleAccept();
        }
    }, [isShiftHeld, handleCommit, handleAccept, setHasUnsavedChanges]);

    // Track unsaved changes: set hasUnsavedChanges when previewText differs from last commit
    useEffect(() => {
        const lastCommit = commits[commits.length - 1];
        const baseContent = lastCommit?.content || originalText;
        const hasChanges = previewText.trim() !== '' && previewText !== baseContent;
        setHasUnsavedChanges(hasChanges);
    }, [previewText, commits, originalText, setHasUnsavedChanges]);

    const handleLoadProject = useCallback(async (id: string) => {
        // Auto-save current project before switching
        if (currentProject) {
            // Persist current state
            try {
                await saveCurrentProject(previewText);
            } catch (e) {
                console.error('Failed to auto-save before switch:', e);
                setErrorMessage("Auto-save failed — changes may be lost. Aborting switch.");
                return; // Abort switch to prevent data loss
            }
        }

        const project = await loadProject(id);
        if (project) {
            let contentToLoad = project.content || '';

            // If draft content is empty, try to load the latest commit
            if (!contentToLoad.trim()) {
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

            setOriginalText(contentToLoad);
            setPreviewText(contentToLoad);
            setModifiedText('');
            resetDiffState();
        }
        return project;
    }, [loadProject, getRepoHandle, setOriginalText, setPreviewText, setModifiedText, resetDiffState, currentProject, saveCurrentProject, previewText]);

    const handleCreateProject = useCallback(async (name: string) => {
        // Auto-save current project before creating new one
        if (currentProject) {
            try {
                await saveCurrentProject(previewText);
            } catch (e) {
                console.error('Failed to auto-save before create:', e);
            }
        }

        const newProject = await createNewProject(name, '');
        setOriginalText('');
        setPreviewText('');
        setModifiedText('');
        resetDiffState();
        return newProject;
    }, [createNewProject, setOriginalText, setPreviewText, setModifiedText, resetDiffState, currentProject, saveCurrentProject, previewText]);

    const handleClearAll = useCallback(() => {
        setOriginalText('');
        setPreviewText('');
        setModifiedText('');
        resetDiffState();
        setMode(ViewMode.INPUT);
    }, [setOriginalText, setPreviewText, setModifiedText, resetDiffState, setMode]);

    const handleExportCommits = useCallback(() => {
        if (commits.length === 0) return;
        const blob = new Blob([JSON.stringify(commits, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentProject?.name || 'project'}-commits.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [commits, currentProject]);

    const handleImportCommits = useCallback((content: string) => {
        try {
            const imported = JSON.parse(content);
            if (!Array.isArray(imported)) {
                setErrorMessage('Failed to import commits: Invalid format (not an array)');
                return;
            }

            const isValidCommit = (obj: any): obj is TextCommit => {
                return (
                    obj &&
                    typeof obj.id === 'string' &&
                    typeof obj.commitNumber === 'number' &&
                    typeof obj.content === 'string' &&
                    typeof obj.timestamp === 'number'
                );
            };

            if (imported.every(isValidCommit)) {
                setCommits(prev => [...prev, ...imported]);
            } else {
                setErrorMessage('Failed to import commits: Invalid format');
            }
        } catch (e) {
            setErrorMessage('Failed to import commits: Invalid JSON');
        }
    }, [setCommits, setErrorMessage]);

    const handleFileOpen = useCallback((content: string) => {
        setOriginalText(content);
        setPreviewText(content);
        setModifiedText('');
        resetDiffState();
    }, [setOriginalText, setPreviewText, setModifiedText, resetDiffState]);

    const handleNewProject = useCallback(() => {
        setShowProjectsPanel(true);
    }, [setShowProjectsPanel]);

    const handleCompareCommit = useCallback((commit: TextCommit) => {
        setOriginalText(commit.content);
        setModifiedText(originalText);
        performDiff(commit.content, originalText);
        setMode(ViewMode.DIFF);
    }, [setOriginalText, setModifiedText, originalText, performDiff, setMode]);

    const contextValue = useMemo(() => ({
        projects, currentProject, loadProject, saveCurrentProject, createNewProject,
        handleLoadProject, handleCreateProject,
        handleAccept, handleCommitClick,
        deleteProject, renameProject,
        openRepository, createRepository, repositoryPath, getRepoHandle, refreshProjects,
        commits, setCommits, handleCommit, handleDeleteCommit, handleClearAllCommits,
        handleClearAll, handleExportCommits, handleImportCommits, handleFileOpen, handleNewProject,
        hasUnsavedChanges, setHasUnsavedChanges,
        handleRestoreCommit, handleCompareCommit
    }), [
        projects, currentProject, loadProject, saveCurrentProject, createNewProject,
        handleLoadProject, handleCreateProject, handleAccept, handleCommitClick,
        deleteProject, renameProject, openRepository, createRepository, repositoryPath,
        getRepoHandle, refreshProjects, commits, setCommits, handleCommit, handleDeleteCommit,
        handleClearAllCommits, handleClearAll, handleExportCommits, handleImportCommits,
        handleFileOpen, handleNewProject, hasUnsavedChanges, setHasUnsavedChanges,
        handleRestoreCommit, handleCompareCommit
    ]);

    return (
        <ProjectContext.Provider value={contextValue}>
            {children}
        </ProjectContext.Provider>
    );
}

export function useProject() {
    const context = useContext(ProjectContext);
    if (context === undefined) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
}
