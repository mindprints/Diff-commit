import { useEffect } from 'react';
import { useUI, useProject, useAI, useEditor } from '../contexts';

export function useElectronMenu() {
    const {
        isDarkMode, setIsDarkMode, setShowHelp, setShowLogs,
        setShowCommitHistory, setShowPromptsModal, setShowProjectsPanel,
        setShowModelsModal, setShowSettingsModal, setShowRepoPicker
    } = useUI();

    const {
        commits, setCommits, handleFileOpen, currentProject,
        handleClearAll, openRepository, createRepository, handleNewProject
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

        // File menu handlers
        window.electron.onFileOpened((content, _path) => {
            handleFileOpen(content);
        });

        window.electron.onRequestSave(async () => {
            const textToSave = getSaveText();
            if (textToSave.trim()) {
                await window.electron.saveFile(textToSave, 'document.txt');
            }
        });

        window.electron.onRequestExportVersions(async () => {
            if (commits.length > 0) {
                await window.electron.exportVersions(commits);
            }
        });

        window.electron.onVersionsImported((importedCommits) => {
            if (Array.isArray(importedCommits)) {
                setCommits(prev => [...prev, ...importedCommits]);
            }
        });

        window.electron.onMenuNewProject(() => handleNewProject());
        window.electron.onMenuCreateRepository?.(() => {
            createRepository();
            setShowProjectsPanel(true);
        });
        window.electron.onMenuOpenRepository(() => {
            setShowRepoPicker(true);
            setShowProjectsPanel(true);
        });
        window.electron.onMenuSaveProject?.(async () => {
            if (currentProject?.path && window.electron?.saveProjectBundle) {
                await window.electron.saveProjectBundle(currentProject.path);
            }
        });

        // Edit menu handlers
        window.electron.onMenuClearAll(() => handleClearAll());

        // View menu handlers
        window.electron.onMenuToggleDark(() => setIsDarkMode(!isDarkMode));
        window.electron.onMenuFontSize((size) => {
            if (['sm', 'base', 'lg', 'xl'].includes(size)) {
                setFontSize(size as any);
            }
        });
        window.electron.onMenuFontFamily((family) => {
            if (['sans', 'serif', 'mono'].includes(family)) {
                setFontFamily(family as any);
            }
        });

        // Help menu handlers
        window.electron.onMenuShowHelp(() => setShowHelp(true));
        window.electron.onMenuShowLogs(() => setShowLogs(true));
        window.electron.onMenuShowVersions(() => setShowCommitHistory(true));

        // Tools menu handlers (Web features triggered from native menu)
        window.electron.onMenuToolsSpellingLocal(() => handleAIEdit('spelling_local'));
        window.electron.onMenuToolsSpellingAI(() => handleAIEdit('spelling_ai'));
        window.electron.onMenuToolsGrammar(() => handleAIEdit('grammar'));
        window.electron.onMenuToolsPolish(() => handleAIEdit('polish'));
        window.electron.onMenuToolsFactCheck(() => handleFactCheck());
        window.electron.onMenuToolsPrompts(() => setShowPromptsModal(true));
        window.electron.onMenuToolsProjects(() => setShowProjectsPanel(true));
        window.electron.onMenuToolsModels(() => setShowModelsModal(true));
        window.electron.onMenuToolsSettings?.(() => setShowSettingsModal(true));

        // Cleanup listeners on unmount
        return () => {
            if (window.electron?.removeAllListeners) {
                window.electron.removeAllListeners('file-opened');
                window.electron.removeAllListeners('request-save');
                window.electron.removeAllListeners('request-export-versions');
                window.electron.removeAllListeners('versions-imported');
                window.electron.removeAllListeners('menu-new-project');
                window.electron.removeAllListeners('menu-create-repository');
                window.electron.removeAllListeners('menu-open-repository');
                window.electron.removeAllListeners('menu-save-project');
                window.electron.removeAllListeners('menu-clear-all');
                window.electron.removeAllListeners('menu-toggle-dark');
                window.electron.removeAllListeners('menu-font-size');
                window.electron.removeAllListeners('menu-font-family');
                window.electron.removeAllListeners('menu-show-help');
                window.electron.removeAllListeners('menu-show-logs');
                window.electron.removeAllListeners('menu-show-versions');

                window.electron.removeAllListeners('menu-tools-spelling-local');
                window.electron.removeAllListeners('menu-tools-spelling-ai');
                window.electron.removeAllListeners('menu-tools-grammar');
                window.electron.removeAllListeners('menu-tools-polish');
                window.electron.removeAllListeners('menu-tools-factcheck');
                window.electron.removeAllListeners('menu-tools-prompts');
                window.electron.removeAllListeners('menu-tools-projects');
                window.electron.removeAllListeners('menu-tools-models');
                window.electron.removeAllListeners('menu-tools-settings');
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, previewText, originalText, commits, isDarkMode, setIsDarkMode, setShowHelp, setShowLogs, setShowCommitHistory, handleAIEdit, handleFactCheck, setShowPromptsModal, setShowProjectsPanel, setShowModelsModal, setShowSettingsModal, setShowRepoPicker, handleFileOpen, handleClearAll, openRepository, createRepository, handleNewProject, setCommits, setFontSize, setFontFamily, currentProject]);
}
