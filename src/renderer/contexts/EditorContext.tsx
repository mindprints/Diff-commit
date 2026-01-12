import React, { createContext, useContext, useState, useRef, useEffect, ReactNode, useCallback } from 'react';
import * as Diff from 'diff';
import { ViewMode, FontFamily, DiffSegment } from '../types';
import { FontSize } from '../constants/ui';
import { useDiffState } from '../hooks/useDiffState';
import { useScrollSync } from '../hooks/useScrollSync';
import { useUI } from './UIContext';

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
    frozenSelection: { start: number, end: number, text: string } | null;
    setFrozenSelection: (selection: { start: number, end: number, text: string } | null) => void;
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
    previewTextRef: React.MutableRefObject<string>;
    modifiedTextRef: React.MutableRefObject<string>;
    skipNextSegmentsSync: React.MutableRefObject<boolean>;

    // Handlers
    performDiff: (source: string, target: string) => void;
    toggleSegment: (id: string) => void;
    handleAcceptAll: () => void;
    handleRejectAll: () => void;

    // Helpers
    handleCopyFinal: () => Promise<void>;
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
    const [frozenSelection, setFrozenSelection] = useState<{ start: number, end: number, text: string } | null>(null);

    const { setErrorMessage } = useUI();

    const originalTextRef = useRef('');
    const skipNextSegmentsSync = useRef(false);

    useEffect(() => {
        originalTextRef.current = originalText;
    }, [originalText]);

    const previewTextRef = useRef('');
    useEffect(() => {
        previewTextRef.current = previewText;
    }, [previewText]);

    const modifiedTextRef = useRef('');
    useEffect(() => {
        modifiedTextRef.current = modifiedText;
    }, [modifiedText]);

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

        // Filter out empty parts to prevent extra rows in the diff view
        const initialSegments: DiffSegment[] = diffResult
            .filter(part => part.value.length > 0)
            .map(part => {
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

    // Auto-compare effect: triggers diff when enabled and previewText changes
    // Auto-compare effect: triggers diff when enabled and previewText changes
    useEffect(() => {
        if (!isAutoCompareEnabled) return;

        // Run diff on any change to previewText (or originalText update) if auto-compare is on.
        // Even if they are equal, we might want to update the UI to show "No Changes".
        // The check (originalText && previewText) ensures we have content to diff.
        // We removed the (originalText !== previewText) check to ensure it runs on load/paste
        // where state might need synchronization even if technically equal or just changed.

        const timeoutId = setTimeout(() => {
            if (originalText !== undefined && previewText !== undefined) {
                // Determine if we should skip this sync (controlled by other operations)
                if (skipNextSegmentsSync.current) {
                    skipNextSegmentsSync.current = false;
                    return;
                }

                setModifiedText(previewText);
                performDiff(originalText, previewText);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [isAutoCompareEnabled, previewText, originalText, performDiff, setModifiedText]);

    const constructTextFromSegments = useCallback((currentSegments: DiffSegment[]) => {
        return currentSegments
            .filter(s => s.isIncluded)
            .map(s => s.value)
            .join('');
    }, []);

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

        // Prevent auto-compare from resetting the diff view (which controls the toggle state)
        skipNextSegmentsSync.current = true;

        // Update the editor preview to reflect the choice immediately
        const newText = constructTextFromSegments(newSegments);
        setPreviewText(newText);
    }, [segments, addToHistory, constructTextFromSegments, setPreviewText]);

    const handleAcceptAll = useCallback(() => {
        const newSegments = segments.map(s => {
            if (s.type === 'added') return { ...s, isIncluded: true };
            if (s.type === 'removed') return { ...s, isIncluded: false };
            return { ...s, isIncluded: true };
        });
        addToHistory(newSegments);

        skipNextSegmentsSync.current = true;
        const newText = constructTextFromSegments(newSegments);
        setPreviewText(newText);
    }, [segments, addToHistory, constructTextFromSegments, setPreviewText]);

    const handleRejectAll = useCallback(() => {
        const newSegments = segments.map(s => {
            if (s.type === 'added') return { ...s, isIncluded: false };
            if (s.type === 'removed') return { ...s, isIncluded: true };
            return { ...s, isIncluded: true };
        });
        addToHistory(newSegments);

        skipNextSegmentsSync.current = true;
        const newText = constructTextFromSegments(newSegments);
        setPreviewText(newText);
    }, [segments, addToHistory, constructTextFromSegments, setPreviewText]);

    const handleCopyFinal = useCallback(async () => {
        if (!previewText) return;

        let textToCopy = previewText;
        const textarea = previewTextareaRef.current?.getTextarea();
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            if (start !== end) {
                textToCopy = previewText.substring(start, end);
            }
        }

        try {
            await navigator.clipboard.writeText(textToCopy);
        } catch (err) {
            console.warn('Clipboard API failed, using fallback:', err);
            try {
                const hiddenTextarea = document.createElement('textarea');
                hiddenTextarea.value = textToCopy;
                hiddenTextarea.style.position = 'fixed';
                hiddenTextarea.style.left = '-9999px';
                hiddenTextarea.style.top = '0';
                document.body.appendChild(hiddenTextarea);
                hiddenTextarea.focus();
                hiddenTextarea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(hiddenTextarea);
                if (!successful) throw new Error('execCommand copy failed');
            } catch (fallbackErr) {
                console.error('Copy failed:', fallbackErr);
                setErrorMessage('Failed to copy text to clipboard.');
            }
        }
    }, [previewText, setErrorMessage, previewTextareaRef]);

    const handleWebSave = useCallback(() => {
        const textToSave = mode === ViewMode.DIFF ? previewText : originalText;
        if (!textToSave.trim()) return;
        try {
            const blob = new Blob([textToSave], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'document.txt';
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to save file:', err);
            setErrorMessage('Failed to save file locally.');
        }
    }, [mode, previewText, originalText, setErrorMessage]);

    return (
        <EditorContext.Provider value={{
            originalText, setOriginalText, previewText, setPreviewText, modifiedText, setModifiedText,
            segments, setSegments, performDiff, toggleSegment, resetDiffState, initializeHistory, addToHistory,
            isAutoCompareEnabled, setIsAutoCompareEnabled,
            leftContainerRef, previewTextareaRef, handleScrollSync,
            isScrollSyncEnabled, setIsScrollSyncEnabled,
            fontFamily, setFontFamily, fontSize, setFontSize,
            mode, setMode,
            originalTextRef, previewTextRef, modifiedTextRef, skipNextSegmentsSync,
            handleAcceptAll, handleRejectAll, handleCopyFinal, handleWebSave,
            frozenSelection, setFrozenSelection
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
