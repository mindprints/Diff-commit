import { useState, useCallback, useRef, RefObject } from 'react';

interface UseScrollSyncOptions {
    leftPaneRef: RefObject<HTMLDivElement>;
    rightPaneRef: RefObject<HTMLTextAreaElement>;
}

export function useScrollSync({ leftPaneRef, rightPaneRef }: UseScrollSyncOptions) {
    const [isScrollSyncEnabled, setIsScrollSyncEnabled] = useState(true);
    const isSyncing = useRef(false);

    const handleScrollSync = useCallback((source: 'left' | 'right') => {
        if (!isScrollSyncEnabled || isSyncing.current) return;
        isSyncing.current = true;

        const sourceEl = source === 'left' ? leftPaneRef.current : rightPaneRef.current;
        const targetEl = source === 'left' ? rightPaneRef.current : leftPaneRef.current;

        if (sourceEl && targetEl) {
            const maxScroll = sourceEl.scrollHeight - sourceEl.clientHeight;
            if (maxScroll > 0) {
                const scrollPercentage = sourceEl.scrollTop / maxScroll;
                const targetMaxScroll = targetEl.scrollHeight - targetEl.clientHeight;
                targetEl.scrollTop = scrollPercentage * targetMaxScroll;
            }
        }

        requestAnimationFrame(() => {
            isSyncing.current = false;
        });
    }, [isScrollSyncEnabled, leftPaneRef, rightPaneRef]);

    const toggleScrollSync = useCallback(() => {
        setIsScrollSyncEnabled(prev => !prev);
    }, []);

    return {
        isScrollSyncEnabled,
        setIsScrollSyncEnabled,
        handleScrollSync,
        toggleScrollSync,
    };
}
