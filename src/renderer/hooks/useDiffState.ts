import { useState, useCallback, useRef, useEffect } from 'react';
import { DiffSegment } from '../types';

export function useDiffState() {
    const [segments, setSegments] = useState<DiffSegment[]>([]);
    const [history, setHistory] = useState<DiffSegment[][]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);

    // Use a ref to avoid stale closure issues in callbacks
    const historyIndexRef = useRef(historyIndex);
    useEffect(() => {
        historyIndexRef.current = historyIndex;
    }, [historyIndex]);

    const addToHistory = useCallback((newSegments: DiffSegment[]) => {
        setHistory(prev => {
            // Use ref to get current index value
            const currentIndex = historyIndexRef.current;
            const newHistory = prev.slice(0, currentIndex + 1);
            newHistory.push(newSegments);
            return newHistory;
        });
        setHistoryIndex(prev => prev + 1);
        setSegments(newSegments);
    }, []);

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

    return {
        segments,
        setSegments,
        addToHistory,
        resetDiffState,
        initializeHistory,
    };
}
