import React, { createContext, useContext, useState, useRef, useEffect, ReactNode, useCallback } from 'react';
import * as Diff from 'diff';
import { ViewMode, FontFamily, DiffSegment } from '../types';
import { FontSize } from '../constants/ui';
import { useDiffState } from '../hooks/useDiffState';
import { useScrollSync } from '../hooks/useScrollSync';

interface EditorContextType {
    originalText: string;
    setOriginalText: (text: string) => void;
    previewText: string;
    setPreviewText: (text: string) => void;
    modifiedText: string;
    setModifiedText: (text: string) => void;
    mode: ViewMode;
    setMode: (mode: ViewMode) => void;
    isAutoCompareEnabled: boolean;
    setIsAutoCompareEnabled: (enabled: boolean) => void;

    // Hooks state
    segments: DiffSegment[];
    setSegments: (segments: DiffSegment[]) => void;
    resetDiffState: () => void;
    initializeHistory: (segments: DiffSegment[]) => void;
    addToHistory: (segments: DiffSegment[]) => void;

    // Scroll sync
    leftContainerRef: React.RefObject<HTMLDivElement>;
    previewTextareaRef: React.RefObject<any>;
    handleScrollSync: (source: 'left' | 'right') => void;
    isScrollSyncEnabled: boolean;
    setIsScrollSyncEnabled: (enabled: boolean) => void;

    // Font settings
    fontFamily: FontFamily;
    setFontFamily: (family: FontFamily) => void;
    fontSize: FontSize;
    setFontSize: (size: FontSize) => void;

    // Refs
    originalTextRef: React.MutableRefObject<string>;
    skipNextSegmentsSync: React.MutableRefObject<boolean>;

    // Handlers
    performDiff: (source: string, target: string) => void;
    toggleSegment: (id: string) => void;
    handleAcceptAll: () => void;
    handleRejectAll: () => void;

    // Helpers
    handleCopyFinal: () => void;
    handleWebSave: () => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: { children: ReactNode }) {
    const [originalText, setOriginalText] = useState('');
    const [previewText, setPreviewText] = useState('');
    const [modifiedText, setModifiedText] = useState('');
    const [fontFamily, setFontFamily] = useState<FontFamily>('sans');
    const [fontSize, setFontSize] = useState<FontSize>('base');
    const [mode, setMode] = useState<ViewMode>(ViewMode.INPUT);
    const [isAutoCompareEnabled, setIsAutoCompareEnabled] = useState(false);

    const originalTextRef = useRef('');
    const skipNextSegmentsSync = useRef(false);

    useEffect(() => {
        originalTextRef.current = originalText;
    }, [originalText]);

    const {
        segments,
        setSegments,
        resetDiffState,
        initializeHistory,
        addToHistory
    } = useDiffState();

    const leftContainerRef = useRef<HTMLDivElement>(null);
    const previewTextareaRef = useRef<any>(null);

    const {
        isScrollSyncEnabled,
        setIsScrollSyncEnabled,
        handleScrollSync
    } = useScrollSync({
        leftPaneRef: leftContainerRef,
        rightPaneRef: previewTextareaRef
    });

    const performDiff = useCallback((source: string, target: string) => {
        const diffResult = Diff.diffWords(source, target);

        let uniqueIdCounter = 0;
        let groupCounter = 0;

        const initialSegments: DiffSegment[] = diffResult.map(part => {
            const id = `seg-${uniqueIdCounter++}`;
            let type: 'added' | 'removed' | 'unchanged' = 'unchanged';
            let isIncluded = true;

            if (part.added) {
                type = 'added';
                isIncluded = true;
            }
            if (part.removed) {
                type = 'removed';
                isIncluded = false;
            }

            return {
                id,
                value: part.value,
                type,
                isIncluded
            };
        });

        for (let i = 0; i < initialSegments.length - 1; i++) {
            const current = initialSegments[i];
            const next = initialSegments[i + 1];

            if ((current.type === 'removed' && next.type === 'added') ||
                (current.type === 'added' && next.type === 'removed')) {
                const groupId = `group-${groupCounter++}`;
                current.groupId = groupId;
                next.groupId = groupId;
                i++;
            }
        }

        initializeHistory(initialSegments);
    }, [initializeHistory]);

    const toggleSegment = useCallback((id: string) => {
        const segmentIndex = segments.findIndex(s => s.id === id);
        if (segmentIndex === -1) return;

        const segment = segments[segmentIndex];
        const newSegments = [...segments];

        if (segment.groupId) {
            const relatedIndex = segments.findIndex(s => s.groupId === segment.groupId && s.id !== segment.id);
            if (relatedIndex !== -1) {
                const related = segments[relatedIndex];
                newSegments[segmentIndex] = { ...segment, isIncluded: !segment.isIncluded };
                newSegments[relatedIndex] = { ...related, isIncluded: !related.isIncluded };
            }
        } else {
            newSegments[segmentIndex] = { ...segment, isIncluded: !segment.isIncluded };
        }

        addToHistory(newSegments);
    }, [segments, addToHistory]);

    const handleAcceptAll = useCallback(() => {
        const newSegments = segments.map(s => {
            if (s.type === 'added') return { ...s, isIncluded: true };
            if (s.type === 'removed') return { ...s, isIncluded: false };
            return s;
        });
        addToHistory(newSegments);
    }, [segments, addToHistory]);

    const handleRejectAll = useCallback(() => {
        const newSegments = segments.map(s => {
            if (s.type === 'added') return { ...s, isIncluded: false };
            if (s.type === 'removed') return { ...s, isIncluded: true };
            return s;
        });
        addToHistory(newSegments);
    }, [segments, addToHistory]);

    const handleCopyFinal = useCallback(() => {
        navigator.clipboard.writeText(previewText);
    }, [previewText]);

    const handleWebSave = useCallback(() => {
        const textToSave = mode === ViewMode.DIFF ? previewText : originalText;
        if (!textToSave.trim()) return;
        const blob = new Blob([textToSave], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'document.txt';
        a.click();
        URL.revokeObjectURL(url);
    }, [mode, previewText, originalText]);

    return (
        <EditorContext.Provider value={{
            originalText, setOriginalText, previewText, setPreviewText, modifiedText, setModifiedText,
            segments, setSegments, performDiff, toggleSegment, resetDiffState, initializeHistory, addToHistory,
            isAutoCompareEnabled, setIsAutoCompareEnabled,
            leftContainerRef, previewTextareaRef, handleScrollSync,
            isScrollSyncEnabled, setIsScrollSyncEnabled,
            fontFamily, setFontFamily, fontSize, setFontSize,
            mode, setMode,
            originalTextRef, skipNextSegmentsSync,
            handleAcceptAll, handleRejectAll, handleCopyFinal, handleWebSave
        }}>
            {children}
        </EditorContext.Provider>
    );
}

export function useEditor() {
    const context = useContext(EditorContext);
    if (context === undefined) {
        throw new Error('useEditor must be used within an EditorProvider');
    }
    return context;
}
