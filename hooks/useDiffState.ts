import { useState, useCallback } from 'react';
import { DiffSegment } from '../types';

export function useDiffState() {
    const [segments, setSegments] = useState<DiffSegment[]>([]);
    const [history, setHistory] = useState<DiffSegment[][]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);

    const addToHistory = useCallback((newSegments: DiffSegment[]) => {
        setHistory(prev => {
            const newHistory = prev.slice(0, historyIndex + 1);
            newHistory.push(newSegments);
            return newHistory;
        });
        setHistoryIndex(prev => prev + 1);
        setSegments(newSegments);
    }, [historyIndex]);

    const undo = useCallback(() => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            setSegments(history[newIndex]);
        }
    }, [historyIndex, history]);

    const redo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            setSegments(history[newIndex]);
        }
    }, [historyIndex, history]);

    const resetDiffState = useCallback(() => {
        setSegments([]);
        setHistory([]);
        setHistoryIndex(-1);
    }, []);

    // Initialize history with segments (for performDiff results)
    const initializeHistory = useCallback((initialSegments: DiffSegment[]) => {
        setHistory([initialSegments]);
        setHistoryIndex(0);
        setSegments(initialSegments);
    }, []);

    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < history.length - 1;

    return {
        segments,
        setSegments,
        history,
        historyIndex,
        addToHistory,
        undo,
        redo,
        canUndo,
        canRedo,
        resetDiffState,
        initializeHistory,
    };
}
