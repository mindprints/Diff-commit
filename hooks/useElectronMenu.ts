import { useEffect } from 'react';
import { ViewMode } from '../types';

type FontSize = 'sm' | 'base' | 'lg' | 'xl';
type FontFamily = 'sans' | 'serif' | 'mono';

interface UseElectronMenuOptions {
    // Current state values
    mode: ViewMode;
    previewText: string;
    originalText: string;
    commits: any[];

    // File handlers
    onFileOpened: (content: string) => void;
    getSaveText: () => string;
    onClearAll: () => void;

    // Commit handlers
    onCommitsImported: (commits: any[]) => void;

    // Appearance handlers
    onToggleDark: () => void;
    onFontSize: (size: FontSize) => void;
    onFontFamily: (family: FontFamily) => void;

    // Modal handlers
    onShowHelp: () => void;
    onShowLogs: () => void;
    onShowCommitHistory: () => void;
}

export function useElectronMenu(options: UseElectronMenuOptions) {
    const {
        mode,
        previewText,
        originalText,
        commits,
        onFileOpened,
        getSaveText,
        onClearAll,
        onCommitsImported,
        onToggleDark,
        onFontSize,
        onFontFamily,
        onShowHelp,
        onShowLogs,
        onShowCommitHistory,
    } = options;

    useEffect(() => {
        if (!window.electron) return;

        // File menu handlers
        window.electron.onFileOpened((content, _path) => {
            onFileOpened(content);
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
                onCommitsImported(importedCommits);
            }
        });

        // Edit menu handlers
        window.electron.onMenuClearAll(() => onClearAll());

        // View menu handlers
        window.electron.onMenuToggleDark(() => onToggleDark());
        window.electron.onMenuFontSize((size) => {
            if (['sm', 'base', 'lg', 'xl'].includes(size)) {
                onFontSize(size as FontSize);
            }
        });
        window.electron.onMenuFontFamily((family) => {
            if (['sans', 'serif', 'mono'].includes(family)) {
                onFontFamily(family as FontFamily);
            }
        });

        // Help menu handlers
        window.electron.onMenuShowHelp(() => onShowHelp());
        window.electron.onMenuShowLogs(() => onShowLogs());
        window.electron.onMenuShowVersions(() => onShowCommitHistory());

        // Cleanup listeners on unmount
        return () => {
            if (window.electron?.removeAllListeners) {
                window.electron.removeAllListeners('file-opened');
                window.electron.removeAllListeners('request-save');
                window.electron.removeAllListeners('request-export-versions');
                window.electron.removeAllListeners('versions-imported');
                window.electron.removeAllListeners('menu-clear-all');
                window.electron.removeAllListeners('menu-toggle-dark');
                window.electron.removeAllListeners('menu-font-size');
                window.electron.removeAllListeners('menu-font-family');
                window.electron.removeAllListeners('menu-show-help');
                window.electron.removeAllListeners('menu-show-logs');
                window.electron.removeAllListeners('menu-show-versions');
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, previewText, originalText, commits]);
}
