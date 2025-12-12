import { useState, useCallback, useRef, RefObject } from 'react';

// Interface for refs that expose a getTextarea method (like MultiSelectTextAreaRef)
interface TextAreaRefLike {
    getTextarea: () => HTMLTextAreaElement | null;
}

interface UseScrollSyncOptions {
    leftPaneRef: RefObject<HTMLDivElement>;
    rightPaneRef: RefObject<TextAreaRefLike | HTMLTextAreaElement | null>;
}

export function useScrollSync({ leftPaneRef, rightPaneRef }: UseScrollSyncOptions) {
    const [isScrollSyncEnabled, setIsScrollSyncEnabled] = useState(true);
    const isSyncing = useRef(false);

    // Helper to get the actual HTMLElement from the right pane ref
    const getRightPaneElement = useCallback((): HTMLElement | null => {
        const ref = rightPaneRef.current;
        if (!ref) return null;

        // Check if it's a ref with getTextarea method
        if ('getTextarea' in ref && typeof ref.getTextarea === 'function') {
            return ref.getTextarea();
        }

        // Otherwise assume it's the element directly
        return ref as HTMLTextAreaElement;
    }, [rightPaneRef]);

    const handleScrollSync = useCallback((source: 'left' | 'right') => {
        if (!isScrollSyncEnabled || isSyncing.current) return;
        isSyncing.current = true;

        const leftEl = leftPaneRef.current;
        const rightEl = getRightPaneElement();

        const sourceEl = source === 'left' ? leftEl : rightEl;
        const targetEl = source === 'left' ? rightEl : leftEl;

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
    }, [isScrollSyncEnabled, leftPaneRef, getRightPaneElement]);

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
