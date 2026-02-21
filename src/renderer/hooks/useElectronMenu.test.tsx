import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useElectronMenu } from './useElectronMenu';
import { useAI, useEditor, useProject, useUI } from '../contexts';

vi.mock('../contexts', () => ({
    useUI: vi.fn(),
    useProject: vi.fn(),
    useAI: vi.fn(),
    useEditor: vi.fn(),
}));

type VoidCallback = (...args: unknown[]) => unknown;

function setupElectronListeners() {
    const callbacks: Record<string, VoidCallback> = {};
    const unsubscriber = () => undefined;

    const electron = {
        saveFile: vi.fn(async () => null),
        exportVersions: vi.fn(async () => null),
        saveProjectBundle: vi.fn(async () => 'bundle-path'),
        respondSaveBeforeClose: vi.fn(async () => true),

        onFileOpened: vi.fn((cb: VoidCallback) => {
            callbacks.fileOpened = cb;
            return unsubscriber;
        }),
        onRequestSave: vi.fn((cb: VoidCallback) => {
            callbacks.requestSave = cb;
            return unsubscriber;
        }),
        onRequestExportVersions: vi.fn((cb: VoidCallback) => {
            callbacks.requestExportVersions = cb;
            return unsubscriber;
        }),
        onVersionsImported: vi.fn((cb: VoidCallback) => {
            callbacks.versionsImported = cb;
            return unsubscriber;
        }),
        onMenuNewProject: vi.fn((cb: VoidCallback) => {
            callbacks.menuNewProject = cb;
            return unsubscriber;
        }),
        onMenuCreateRepository: vi.fn((cb: VoidCallback) => {
            callbacks.menuCreateRepository = cb;
            return unsubscriber;
        }),
        onMenuOpenRepository: vi.fn((cb: VoidCallback) => {
            callbacks.menuOpenRepository = cb;
            return unsubscriber;
        }),
        onMenuSaveProject: vi.fn((cb: VoidCallback) => {
            callbacks.menuSaveProject = cb;
            return unsubscriber;
        }),
        onMenuExportProjectBundle: vi.fn((cb: VoidCallback) => {
            callbacks.menuExportProjectBundle = cb;
            return unsubscriber;
        }),
        onRequestSaveBeforeClose: vi.fn((cb: VoidCallback) => {
            callbacks.requestSaveBeforeClose = cb;
            return unsubscriber;
        }),
        onMenuClearAll: vi.fn((cb: VoidCallback) => {
            callbacks.menuClearAll = cb;
            return unsubscriber;
        }),
        onMenuToggleDark: vi.fn((cb: VoidCallback) => {
            callbacks.menuToggleDark = cb;
            return unsubscriber;
        }),
        onMenuFontSize: vi.fn((cb: VoidCallback) => {
            callbacks.menuFontSize = cb;
            return unsubscriber;
        }),
        onMenuFontFamily: vi.fn((cb: VoidCallback) => {
            callbacks.menuFontFamily = cb;
            return unsubscriber;
        }),
        onMenuShowHelp: vi.fn((cb: VoidCallback) => {
            callbacks.menuShowHelp = cb;
            return unsubscriber;
        }),
        onMenuShowLogs: vi.fn((cb: VoidCallback) => {
            callbacks.menuShowLogs = cb;
            return unsubscriber;
        }),
        onMenuShowVersions: vi.fn((cb: VoidCallback) => {
            callbacks.menuShowVersions = cb;
            return unsubscriber;
        }),
        onMenuToolsSpellingLocal: vi.fn((cb: VoidCallback) => {
            callbacks.menuToolsSpellingLocal = cb;
            return unsubscriber;
        }),
        onMenuToolsSpellingAI: vi.fn((cb: VoidCallback) => {
            callbacks.menuToolsSpellingAI = cb;
            return unsubscriber;
        }),
        onMenuToolsGrammar: vi.fn((cb: VoidCallback) => {
            callbacks.menuToolsGrammar = cb;
            return unsubscriber;
        }),
        onMenuToolsPolish: vi.fn((cb: VoidCallback) => {
            callbacks.menuToolsPolish = cb;
            return unsubscriber;
        }),
        onMenuToolsFactCheck: vi.fn((cb: VoidCallback) => {
            callbacks.menuToolsFactCheck = cb;
            return unsubscriber;
        }),
        onMenuToolsPrompts: vi.fn((cb: VoidCallback) => {
            callbacks.menuToolsPrompts = cb;
            return unsubscriber;
        }),
        onMenuToolsProjects: vi.fn((cb: VoidCallback) => {
            callbacks.menuToolsProjects = cb;
            return unsubscriber;
        }),
        onMenuToolsModels: vi.fn((cb: VoidCallback) => {
            callbacks.menuToolsModels = cb;
            return unsubscriber;
        }),
        onMenuToolsSettings: vi.fn((cb: VoidCallback) => {
            callbacks.menuToolsSettings = cb;
            return unsubscriber;
        }),
    };

    (globalThis as unknown as { window: Record<string, unknown> }).window = { electron };
    return { callbacks, electron };
}

function HookHarness() {
    useElectronMenu();
    return null;
}

async function mountHookHarness(): Promise<() => void> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(<HookHarness />);
    });
    return () => {
        act(() => {
            root.unmount();
        });
        container.remove();
    };
}

describe('useElectronMenu close-save integration', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    it('handles request-save-before-close by saving project and acknowledging success', async () => {
        const saveCurrentProject = vi.fn(async () => undefined);
        const { callbacks, electron } = setupElectronListeners();

        vi.mocked(useUI).mockReturnValue({
            isDarkMode: false,
            setIsDarkMode: vi.fn(),
            setShowHelp: vi.fn(),
            setShowLogs: vi.fn(),
            setShowCommitHistory: vi.fn(),
            setShowPromptsModal: vi.fn(),
            setShowProjectsPanel: vi.fn(),
            setShowModelsModal: vi.fn(),
            setShowSettingsModal: vi.fn(),
            setShowRepoPicker: vi.fn(),
        } as unknown as ReturnType<typeof useUI>);
        vi.mocked(useProject).mockReturnValue({
            commits: [],
            setCommits: vi.fn(),
            handleFileOpen: vi.fn(),
            currentProject: { path: 'C:/repo/p', id: 'id', name: 'name', content: '', createdAt: 1, updatedAt: 1 },
            handleClearAll: vi.fn(),
            createRepository: vi.fn(),
            handleNewProject: vi.fn(),
            saveCurrentProject,
        } as unknown as ReturnType<typeof useProject>);
        vi.mocked(useAI).mockReturnValue({
            handleAIEdit: vi.fn(),
            handleFactCheck: vi.fn(),
        } as unknown as ReturnType<typeof useAI>);
        vi.mocked(useEditor).mockReturnValue({
            mode: 'diff',
            previewText: 'draft content',
            originalText: 'baseline',
            setFontSize: vi.fn(),
            setFontFamily: vi.fn(),
        } as unknown as ReturnType<typeof useEditor>);

        const cleanup = await mountHookHarness();

        await callbacks.requestSaveBeforeClose?.('req-1');
        expect(saveCurrentProject).toHaveBeenCalledWith('draft content');
        expect(electron.respondSaveBeforeClose).toHaveBeenCalledWith('req-1', true);
        cleanup();
    });

    it('responds with failure when save-before-close throws', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const saveCurrentProject = vi.fn(async () => {
            throw new Error('save failed');
        });
        const { callbacks, electron } = setupElectronListeners();

        vi.mocked(useUI).mockReturnValue({
            isDarkMode: false,
            setIsDarkMode: vi.fn(),
            setShowHelp: vi.fn(),
            setShowLogs: vi.fn(),
            setShowCommitHistory: vi.fn(),
            setShowPromptsModal: vi.fn(),
            setShowProjectsPanel: vi.fn(),
            setShowModelsModal: vi.fn(),
            setShowSettingsModal: vi.fn(),
            setShowRepoPicker: vi.fn(),
        } as unknown as ReturnType<typeof useUI>);
        vi.mocked(useProject).mockReturnValue({
            commits: [],
            setCommits: vi.fn(),
            handleFileOpen: vi.fn(),
            currentProject: { path: 'C:/repo/p', id: 'id', name: 'name', content: '', createdAt: 1, updatedAt: 1 },
            handleClearAll: vi.fn(),
            createRepository: vi.fn(),
            handleNewProject: vi.fn(),
            saveCurrentProject,
        } as unknown as ReturnType<typeof useProject>);
        vi.mocked(useAI).mockReturnValue({
            handleAIEdit: vi.fn(),
            handleFactCheck: vi.fn(),
        } as unknown as ReturnType<typeof useAI>);
        vi.mocked(useEditor).mockReturnValue({
            mode: 'diff',
            previewText: 'draft content',
            originalText: 'baseline',
            setFontSize: vi.fn(),
            setFontFamily: vi.fn(),
        } as unknown as ReturnType<typeof useEditor>);

        const cleanup = await mountHookHarness();

        await callbacks.requestSaveBeforeClose?.('req-2');
        expect(electron.respondSaveBeforeClose).toHaveBeenCalledWith('req-2', false);
        expect(errorSpy).toHaveBeenCalled();
        cleanup();
    });
});
