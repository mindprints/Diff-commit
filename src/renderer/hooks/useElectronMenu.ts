import { useEffect } from 'react';
import { useUI, useProject, useAI, useEditor } from '../contexts';
import { FontSize } from '../constants/ui';
import { FontFamily } from '../types';

export function useElectronMenu() {
    const {
        isDarkMode, setIsDarkMode, setShowHelp, setShowLogs,
        setShowCommitHistory, setShowPromptsModal, setShowProjectsPanel,
        setShowModelsModal, setShowSettingsModal, setShowRepoPicker, setErrorMessage
    } = useUI();

    const {
        commits, setCommits, handleFileOpen, currentProject,
        handleClearAll, createRepository, handleNewProject, saveCurrentProject
    } = useProject();

    const {
        handleAIEdit, handleFactCheck,
        hasStagedPromptChanges, saveStagedPrompts, discardStagedPrompts
    } = useAI();

    const {
        mode, previewText, originalText, setFontSize, setFontFamily
    } = useEditor();

    const getSaveText = () => mode === 'diff' ? previewText : originalText;

    useEffect(() => {
        if (!window.electron) return;
        const unsubscribers: Array<() => void> = [];

        // File menu handlers
        unsubscribers.push(window.electron.onFileOpened((content, _path) => {
            handleFileOpen(content);
        }));

        unsubscribers.push(window.electron.onRequestSave(async (format) => {
            const textToSave = getSaveText();
            if (textToSave.trim()) {
                await window.electron.saveFile(textToSave, 'document', format || 'md');
            }
        }));

        unsubscribers.push(window.electron.onRequestExportVersions(async () => {
            if (commits.length > 0) {
                await window.electron.exportVersions(commits);
            }
        }));

        unsubscribers.push(window.electron.onVersionsImported((importedCommits) => {
            if (Array.isArray(importedCommits)) {
                setCommits(prev => [...prev, ...importedCommits]);
            }
        }));

        unsubscribers.push(window.electron.onMenuNewProject(() => handleNewProject()));
        unsubscribers.push(window.electron.onMenuCreateRepository?.(() => {
            createRepository();
            setShowProjectsPanel(true);
        }) || (() => { }));
        unsubscribers.push(window.electron.onMenuOpenRepository(() => {
            setShowRepoPicker(true);
            setShowProjectsPanel(true);
        }));
        unsubscribers.push(window.electron.onMenuSaveProject?.(async () => {
            if (!currentProject) return;
            try {
                const success = await saveCurrentProject(previewText);
                if (!success) {
                    setErrorMessage('Failed to save project changes to disk.');
                }
            } catch (error) {
                console.error('Error in menu-save-project handler:', error);
                setErrorMessage('An unexpected error occurred while saving the project.');
            }
        }) || (() => { }));
        unsubscribers.push(window.electron.onMenuExportProjectBundle?.(async () => {
            if (currentProject?.path && window.electron?.saveProjectBundle) {
                try {
                    const result = await window.electron.saveProjectBundle(currentProject.path);
                    if (!result) {
                        // cancelled or failed
                        console.log('[Menu] Project bundle export cancelled or failed');
                    }
                } catch (error) {
                    console.error('Error in menu-export-project-bundle handler:', error);
                    setErrorMessage('Failed to export project bundle.');
                }
            }
        }) || (() => { }));
        unsubscribers.push(window.electron.onRequestSaveBeforeClose?.(async (requestId) => {
            let success = false;
            try {
                if (currentProject) {
                    await saveCurrentProject(previewText);
                }
                if (hasStagedPromptChanges) {
                    await saveStagedPrompts();
                }
                success = true;
            } catch (error) {
                console.error('Failed to save before close:', error);
            } finally {
                if (window.electron?.respondSaveBeforeClose) {
                    await window.electron.respondSaveBeforeClose(requestId, success);
                }
            }
        }) || (() => { }));
        unsubscribers.push(window.electron.onDiscardPromptsBeforeClose?.(() => {
            discardStagedPrompts();
        }) || (() => { }));

        // Edit menu handlers
        unsubscribers.push(window.electron.onMenuClearAll(() => handleClearAll()));

        // View menu handlers
        unsubscribers.push(window.electron.onMenuToggleDark(() => setIsDarkMode(!isDarkMode)));
        unsubscribers.push(window.electron.onMenuFontSize((size) => {
            if (['sm', 'base', 'lg', 'xl'].includes(size)) {
                setFontSize(size as FontSize);
            }
        }));
        unsubscribers.push(window.electron.onMenuFontFamily((family) => {
            if (['sans', 'serif', 'mono'].includes(family)) {
                setFontFamily(family as FontFamily);
            }
        }));

        // Help menu handlers
        unsubscribers.push(window.electron.onMenuShowHelp(() => setShowHelp(true)));
        unsubscribers.push(window.electron.onMenuShowLogs(() => setShowLogs(true)));
        unsubscribers.push(window.electron.onMenuShowVersions(() => setShowCommitHistory(true)));

        // Tools menu handlers (Web features triggered from native menu)
        unsubscribers.push(window.electron.onMenuToolsSpellingLocal(() => handleAIEdit('spelling_local')));
        unsubscribers.push(window.electron.onMenuToolsSpellingAI(() => handleAIEdit('spelling_ai')));
        unsubscribers.push(window.electron.onMenuToolsGrammar(() => handleAIEdit('grammar')));
        unsubscribers.push(window.electron.onMenuToolsPolish(() => handleAIEdit('polish')));
        unsubscribers.push(window.electron.onMenuToolsFactCheck(() => handleFactCheck()));
        unsubscribers.push(window.electron.onMenuToolsPrompts(() => setShowPromptsModal(true)));
        unsubscribers.push(window.electron.onMenuToolsProjects(() => setShowProjectsPanel(true)));
        unsubscribers.push(window.electron.onMenuToolsModels(() => setShowModelsModal(true)));
        unsubscribers.push(window.electron.onMenuToolsSettings?.(() => setShowSettingsModal(true)) || (() => { }));

        // Cleanup listeners on unmount
        return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    }, [mode, previewText, originalText, commits, isDarkMode, setIsDarkMode, setShowHelp, setShowLogs, setShowCommitHistory, handleAIEdit, handleFactCheck, hasStagedPromptChanges, saveStagedPrompts, discardStagedPrompts, setShowPromptsModal, setShowProjectsPanel, setShowModelsModal, setShowSettingsModal, setShowRepoPicker, handleFileOpen, handleClearAll, createRepository, handleNewProject, setCommits, setFontSize, setFontFamily, currentProject, saveCurrentProject, setErrorMessage]);
}
