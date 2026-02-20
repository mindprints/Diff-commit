import { useEffect } from 'react';
import { useUI, useProject, useAI, useEditor } from '../contexts';
import { FontSize } from '../constants/ui';
import { FontFamily } from '../types';

export function useElectronMenu() {
    const {
        isDarkMode, setIsDarkMode, setShowHelp, setShowLogs,
        setShowCommitHistory, setShowPromptsModal, setShowProjectsPanel,
        setShowModelsModal, setShowSettingsModal, setShowRepoPicker
    } = useUI();

    const {
        commits, setCommits, handleFileOpen, currentProject,
        handleClearAll, createRepository, handleNewProject
    } = useProject();

    const {
        handleAIEdit, handleFactCheck
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
            if (currentProject?.path && window.electron?.saveProjectBundle) {
                await window.electron.saveProjectBundle(currentProject.path);
            }
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
    }, [mode, previewText, originalText, commits, isDarkMode, setIsDarkMode, setShowHelp, setShowLogs, setShowCommitHistory, handleAIEdit, handleFactCheck, setShowPromptsModal, setShowProjectsPanel, setShowModelsModal, setShowSettingsModal, setShowRepoPicker, handleFileOpen, handleClearAll, createRepository, handleNewProject, setCommits, setFontSize, setFontFamily, currentProject]);
}
