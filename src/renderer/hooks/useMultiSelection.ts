import { useState, useCallback, Dispatch, SetStateAction } from 'react';

export interface SelectionRange {
    id: string;           // Unique ID like "sel_0", "sel_1"
    start: number;        // Character offset in text
    end: number;
    text: string;         // Cached substring
}

export interface RangeResult {
    id: string;
    result: string;
}

// Characters that define word boundaries (whitespace and punctuation)
const BOUNDARY_CHARS = /[\s.,;:!?'"()\[\]{}<>\/\\|@#$%^&*+=~`\-_\n\r\t]/;

/**
 * Expand a selection range to the nearest word boundaries (whitespace or punctuation).
 * This auto-corrects for users who don't precisely select from word start to word end.
 */
function expandToWordBoundaries(start: number, end: number, text: string): { start: number; end: number } {
    if (text.length === 0 || start >= text.length) {
        return { start, end };
    }

    let expandedStart = start;
    let expandedEnd = end;

    // Expand start backwards until we hit a boundary or beginning of text
    while (expandedStart > 0 && !BOUNDARY_CHARS.test(text[expandedStart - 1])) {
        expandedStart--;
    }

    // Expand end forwards until we hit a boundary or end of text
    while (expandedEnd < text.length && !BOUNDARY_CHARS.test(text[expandedEnd])) {
        expandedEnd++;
    }

    return { start: expandedStart, end: expandedEnd };
}

// Merge overlapping/adjacent ranges and sort them
function mergeRanges(ranges: SelectionRange[]): SelectionRange[] {
    if (ranges.length === 0) return [];

    // Sort by start position
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const merged: SelectionRange[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i];
        const last = merged[merged.length - 1];

        // If overlapping or adjacent, merge
        if (current.start <= last.end + 1) {
            last.end = Math.max(last.end, current.end);
            // Update text to reflect merged range (will be updated later)
            last.text = '';
        } else {
            merged.push(current);
        }
    }

    return merged;
}

interface UseMultiSelectionOptions {
    text: string;
}

interface UseMultiSelectionReturn {
    ranges: SelectionRange[];
    addRange: (start: number, end: number, isAdditive: boolean, fullText: string) => void;
    removeRange: (id: string) => void;
    clearRanges: () => void;
    getConcatenatedText: () => string;
    applyResults: (results: RangeResult[], fullText: string) => string;
    hasSelection: () => boolean;
    setRanges: Dispatch<SetStateAction<SelectionRange[]>>;
}

let rangeIdCounter = 0;

/**
 * Hook for managing multiple text selection ranges.
 * Supports Ctrl+drag for additive selection and auto-merges overlapping ranges.
 */
export function useMultiSelection({ text }: UseMultiSelectionOptions): UseMultiSelectionReturn {
    const [ranges, setRanges] = useState<SelectionRange[]>([]);

    /**
     * Add a new selection range.
     * @param start - Start character offset
     * @param end - End character offset
     * @param isAdditive - If true (Ctrl held), add to existing. If false, replace all.
     * @param fullText - Current full text to extract substring
     */
    const addRange = useCallback((start: number, end: number, isAdditive: boolean, fullText: string) => {
        // Normalize (ensure start <= end)
        const normalizedStart = Math.min(start, end);
        const normalizedEnd = Math.max(start, end);

        // Don't add empty ranges
        if (normalizedStart === normalizedEnd) return;

        // Auto-expand selection to word boundaries (whitespace/punctuation)
        const { start: expandedStart, end: expandedEnd } = expandToWordBoundaries(
            normalizedStart,
            normalizedEnd,
            fullText
        );

        const newRange: SelectionRange = {
            id: `sel_${rangeIdCounter++}`,
            start: expandedStart,
            end: expandedEnd,
            text: fullText.substring(expandedStart, expandedEnd),
        };

        setRanges(prev => {
            const basedRanges = isAdditive ? [...prev, newRange] : [newRange];
            const merged = mergeRanges(basedRanges);

            // Update text for any merged ranges
            return merged.map(r => ({
                ...r,
                text: r.text || fullText.substring(r.start, r.end),
            }));
        });
    }, []);

    /**
     * Remove a specific range by ID.
     */
    const removeRange = useCallback((id: string) => {
        setRanges(prev => prev.filter(r => r.id !== id));
    }, []);

    /**
     * Clear all selection ranges.
     */
    const clearRanges = useCallback(() => {
        setRanges([]);
    }, []);

    /**
     * Get concatenated text from all ranges (for AI input).
     * Ranges are separated by double newlines.
     */
    const getConcatenatedText = useCallback(() => {
        const merged = mergeRanges(ranges);
        return merged.map(r => r.text).join('\n\n');
    }, [ranges]);

    /**
     * Check if there's any selection.
     */
    const hasSelection = useCallback(() => {
        return ranges.length > 0;
    }, [ranges]);

    /**
     * Apply AI results back to the full text.
     * Processes in reverse order (highest offset first) to maintain valid positions.
     * 
     * @param results - Array of {id, result} from AI
     * @param fullText - Current full text to modify
     * @returns New full text with replacements applied
     */
    const applyResults = useCallback((results: RangeResult[], fullText: string): string => {
        // Sort ranges by position in descending order (process from end to start)
        const sortedRanges = [...ranges].sort((a, b) => b.start - a.start);

        let newText = fullText;

        for (const range of sortedRanges) {
            const result = results.find(r => r.id === range.id);
            if (result) {
                newText = newText.slice(0, range.start) + result.result + newText.slice(range.end);
            }
        }

        // Clear ranges after applying (positions are now invalid)
        setRanges([]);

        return newText;
    }, [ranges]);

    return {
        ranges,
        addRange,
        removeRange,
        clearRanges,
        getConcatenatedText,
        applyResults,
        hasSelection,
        setRanges,
    };
}
