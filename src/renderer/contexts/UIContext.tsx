import React, { createContext, useContext, useState, ReactNode, useRef, useCallback, useEffect } from 'react';
import { HEADER_HEIGHT_PX } from '../constants/ui';

interface UIContextType {
    showHelp: boolean;
    setShowHelp: (show: boolean) => void;
    showLogs: boolean;
    setShowLogs: (show: boolean) => void;
    showProjectsPanel: boolean;
    setShowProjectsPanel: (show: boolean) => void;
    showPromptsModal: boolean;
    setShowPromptsModal: (show: boolean) => void;
    showModelsModal: boolean;
    setShowModelsModal: (show: boolean) => void;
    showCommitHistory: boolean;
    setShowCommitHistory: (show: boolean) => void;
    savePromptDialogOpen: boolean;
    setSavePromptDialogOpen: (show: boolean) => void;
    contextMenu: { x: number; y: number; selection: string } | null;
    setContextMenu: (menu: { x: number; y: number; selection: string } | null) => void;
    errorMessage: string | null;
    setErrorMessage: (message: string | null) => void;
    isShiftHeld: boolean;
    setIsShiftHeld: (held: boolean) => void;
    activeLogId: string | null;
    setActiveLogId: (id: string | null) => void;
    backgroundHue: number;
    setBackgroundHue: (hue: number) => void;
    isDarkMode: boolean;
    setIsDarkMode: (dark: boolean) => void;
    isSpeaking: boolean;
    setIsSpeaking: (speaking: boolean) => void;
    topPanelHeight: number;
    setTopPanelHeight: (height: number) => void;
    leftPanelWidth: number;
    setLeftPanelWidth: (width: number) => void;
    startResizing: () => void;
    startResizingVertical: () => void;
    handleOpenContextMenu: (e: React.MouseEvent<HTMLTextAreaElement>, previewText: string) => void;
    isPromptPanelVisible: boolean;
    setIsPromptPanelVisible: (visible: boolean) => void;
    isHeaderVisible: boolean;
    setIsHeaderVisible: (visible: boolean) => void;
    showImageViewer: boolean;
    setShowImageViewer: (show: boolean) => void;
    showAnalysisViewer: boolean;
    setShowAnalysisViewer: (show: boolean) => void;
    showSettingsModal: boolean;
    setShowSettingsModal: (show: boolean) => void;
    showRepoPicker: boolean;
    setShowRepoPicker: (show: boolean) => void;
    showGraphModal: boolean;
    setShowGraphModal: (show: boolean) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
    const [showHelp, setShowHelp] = useState(false);
    const [showLogs, setShowLogs] = useState(false);
    const [showProjectsPanel, setShowProjectsPanel] = useState(false);
    const [showPromptsModal, setShowPromptsModal] = useState(false);
    const [showModelsModal, setShowModelsModal] = useState(false);
    const [showGraphModal, setShowGraphModal] = useState(false);
    const [showCommitHistory, setShowCommitHistory] = useState(false);
    const [savePromptDialogOpen, setSavePromptDialogOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; selection: string } | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isShiftHeld, setIsShiftHeld] = useState(false);
    const [activeLogId, setActiveLogId] = useState<string | null>(null);
    const [backgroundHue, setBackgroundHue] = useState(220); // Default indigo-ish
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [topPanelHeight, setTopPanelHeight] = useState(60);
    const [leftPanelWidth, setLeftPanelWidth] = useState(50);
    const [isPromptPanelVisible, setIsPromptPanelVisible] = useState(true);
    const [isHeaderVisible, setIsHeaderVisible] = useState(true);
    const [showImageViewer, setShowImageViewer] = useState(false);
    const [showAnalysisViewer, setShowAnalysisViewer] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [showRepoPicker, setShowRepoPicker] = useState(false);

    const isResizingLeftRight = useRef(false);
    const isResizingTopBottom = useRef(false);

    const startResizing = useCallback(() => {
        isResizingLeftRight.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, []);

    const stopResizing = useCallback(() => {
        isResizingLeftRight.current = false;
        isResizingTopBottom.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    const handleResize = useCallback((e: MouseEvent) => {
        if (isResizingLeftRight.current) {
            const newWidth = (e.clientX / window.innerWidth) * 100;
            if (newWidth > 20 && newWidth < 80) {
                setLeftPanelWidth(newWidth);
            }
        } else if (isResizingTopBottom.current) {
            const availableHeight = window.innerHeight - HEADER_HEIGHT_PX;
            const newHeight = ((e.clientY - HEADER_HEIGHT_PX) / availableHeight) * 100;
            if (newHeight > 20 && newHeight < 80) {
                setTopPanelHeight(newHeight);
            }
        }
    }, [setLeftPanelWidth, setTopPanelHeight]);

    const startResizingVertical = useCallback(() => {
        isResizingTopBottom.current = true;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
    }, []);

    useEffect(() => {
        window.addEventListener('mousemove', handleResize);
        window.addEventListener('mouseup', stopResizing);
        return () => {
            window.removeEventListener('mousemove', handleResize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [handleResize, stopResizing]);

    const handleOpenContextMenu = (e: React.MouseEvent<HTMLTextAreaElement>, _previewText: string) => {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selection = start !== end ? textarea.value.substring(start, end) : '';

        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            selection
        });
    };
    return (
        <UIContext.Provider value={{
            showHelp, setShowHelp,
            showLogs, setShowLogs,
            showProjectsPanel, setShowProjectsPanel,
            showPromptsModal, setShowPromptsModal,
            showModelsModal, setShowModelsModal,
            showCommitHistory, setShowCommitHistory,
            savePromptDialogOpen, setSavePromptDialogOpen,
            contextMenu, setContextMenu,
            errorMessage, setErrorMessage,
            isShiftHeld, setIsShiftHeld,
            activeLogId, setActiveLogId,
            backgroundHue, setBackgroundHue,
            isDarkMode, setIsDarkMode,
            isSpeaking, setIsSpeaking,
            topPanelHeight, setTopPanelHeight,
            leftPanelWidth, setLeftPanelWidth,
            startResizing, startResizingVertical,
            handleOpenContextMenu,
            isPromptPanelVisible, setIsPromptPanelVisible,
            isHeaderVisible, setIsHeaderVisible,
            showImageViewer, setShowImageViewer,
            showAnalysisViewer, setShowAnalysisViewer,
            showSettingsModal, setShowSettingsModal,
            showGraphModal, setShowGraphModal,
            showRepoPicker, setShowRepoPicker,
        }}>
            {children}
        </UIContext.Provider>
    );
}

export function useUI() {
    const context = useContext(UIContext);
    if (context === undefined) {
        throw new Error('useUI must be used within a UIProvider');
    }
    return context;
}
