import React, { useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import clsx from 'clsx';

export interface HighlightRange {
    start: number;
    end: number;
}

interface HighlightableTextAreaProps {
    value: string;
    onChange: (value: string) => void;
    highlights: HighlightRange[];
    onHighlightsChange: (highlights: HighlightRange[]) => void;
    highlightMode: boolean;
    className?: string;
    placeholder?: string;
    spellCheck?: boolean;
    readOnly?: boolean;
    fontClassName?: string;
    sizeClassName?: string;
}

export interface HighlightableTextAreaRef {
    getTextarea: () => HTMLTextAreaElement | null;
    getHighlightedText: () => string;
    getHighlightedRanges: () => HighlightRange[];
    clearHighlights: () => void;
}

// Merge overlapping/adjacent ranges and sort them
export function mergeRanges(ranges: HighlightRange[]): HighlightRange[] {
    if (ranges.length === 0) return [];

    // Sort by start position
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const merged: HighlightRange[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i];
        const last = merged[merged.length - 1];

        // If overlapping or adjacent, merge
        if (current.start <= last.end + 1) {
            last.end = Math.max(last.end, current.end);
        } else {
            merged.push(current);
        }
    }

    return merged;
}

// Get concatenated highlighted text from ranges
export function getHighlightedText(text: string, highlights: HighlightRange[]): string {
    const merged = mergeRanges(highlights);
    return merged.map(r => text.substring(r.start, r.end)).join('\n\n'); // Use double newline to separate discontinuous selections
}

// Get total character count of highlighted regions
export function getHighlightedCharCount(highlights: HighlightRange[]): number {
    const merged = mergeRanges(highlights);
    return merged.reduce((sum, r) => sum + (r.end - r.start), 0);
}

const HighlightableTextArea = forwardRef<HighlightableTextAreaRef, HighlightableTextAreaProps>(
    (
        {
            value,
            onChange,
            highlights,
            onHighlightsChange,
            highlightMode,
            className,
            placeholder,
            spellCheck = false,
            readOnly = false,
            fontClassName,
            sizeClassName,
        },
        ref
    ) => {
        const containerRef = useRef<HTMLDivElement>(null);
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const highlightRef = useRef<HTMLDivElement>(null);
        const [isSelecting, setIsSelecting] = useState(false);

        // Expose methods to parent via ref
        useImperativeHandle(ref, () => ({
            getTextarea: () => textareaRef.current,
            getHighlightedText: () => getHighlightedText(value, highlights),
            getHighlightedRanges: () => mergeRanges(highlights),
            clearHighlights: () => onHighlightsChange([]),
        }));

        // Sync scroll between overlay and textarea
        const handleScroll = useCallback(() => {
            if (textareaRef.current && highlightRef.current) {
                highlightRef.current.scrollTop = textareaRef.current.scrollTop;
                highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
            }
        }, []);

        // Handle highlight mode selection - start
        const handleMouseDown = useCallback(() => {
            if (!highlightMode) return;
            setIsSelecting(true);
        }, [highlightMode]);

        // Handle highlight mode selection - end
        const handleMouseUp = useCallback(() => {
            if (!highlightMode || !textareaRef.current || !isSelecting) return;

            const textarea = textareaRef.current;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;

            if (start !== end) {
                // Add new highlight range
                const newRange: HighlightRange = {
                    start: Math.min(start, end),
                    end: Math.max(start, end),
                };

                // Merge with existing highlights
                const newHighlights = mergeRanges([...highlights, newRange]);
                onHighlightsChange(newHighlights);

                // Clear native selection to show our custom highlight
                setTimeout(() => {
                    textarea.setSelectionRange(end, end);
                }, 0);
            }

            setIsSelecting(false);
        }, [highlightMode, highlights, onHighlightsChange, isSelecting]);

        // Double-click to remove a highlight
        const handleDoubleClick = useCallback(() => {
            if (!highlightMode || !textareaRef.current) return;

            const textarea = textareaRef.current;
            const pos = textarea.selectionStart;

            // Find if click is within a highlight and remove it
            const merged = mergeRanges(highlights);
            const updated = merged.filter((r) => pos < r.start || pos >= r.end);

            if (updated.length !== merged.length) {
                onHighlightsChange(updated);
            }
        }, [highlightMode, highlights, onHighlightsChange]);

        // Render text with highlights overlay
        const renderHighlightedText = () => {
            if (!value) return null;

            const merged = mergeRanges(highlights);
            if (merged.length === 0) return <span className="invisible">{value}</span>;

            const parts: React.ReactNode[] = [];
            let lastIndex = 0;

            merged.forEach((range, i) => {
                // Text before highlight (invisible, just for layout)
                if (range.start > lastIndex) {
                    parts.push(
                        <span key={`text-${i}`} className="text-transparent">
                            {value.substring(lastIndex, range.start)}
                        </span>
                    );
                }

                // Highlighted text
                parts.push(
                    <mark
                        key={`highlight-${i}`}
                        className="bg-amber-300/80 dark:bg-amber-500/60 text-transparent rounded-sm px-0.5 -mx-0.5"
                    >
                        {value.substring(range.start, range.end)}
                    </mark>
                );

                lastIndex = range.end;
            });

            // Remaining text (invisible)
            if (lastIndex < value.length) {
                parts.push(
                    <span key="text-end" className="text-transparent">
                        {value.substring(lastIndex)}
                    </span>
                );
            }

            return parts;
        };

        return (
            <div ref={containerRef} className={clsx('relative w-full h-full overflow-hidden')}>
                {/* Highlight overlay - positioned behind the textarea */}
                <div
                    ref={highlightRef}
                    className={clsx(
                        'absolute inset-0 pointer-events-none whitespace-pre-wrap break-words overflow-y-auto',
                        fontClassName,
                        sizeClassName
                    )}
                    style={{
                        padding: '2rem',
                    }}
                    aria-hidden="true"
                >
                    {renderHighlightedText()}
                </div>

                {/* Actual textarea */}
                <textarea
                    ref={textareaRef}
                    className={clsx(
                        'w-full h-full resize-none bg-transparent border-none focus:ring-0 outline-none p-8',
                        'relative z-10',
                        fontClassName,
                        sizeClassName,
                        className
                    )}
                    value={value}
                    onChange={(e) => {
                        onChange(e.target.value);
                        // If text changes, we should adjust highlights - for now, just clear them
                        // A more sophisticated implementation would track edits and shift ranges
                        if (highlights.length > 0 && e.target.value !== value) {
                            onHighlightsChange([]);
                        }
                    }}
                    onScroll={handleScroll}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    onDoubleClick={handleDoubleClick}
                    onKeyUp={(e) => {
                        // Capture selections made via keyboard (Shift+Arrow keys, Ctrl+Shift+End, etc)
                        if (highlightMode && textareaRef.current) {
                            const textarea = textareaRef.current;
                            const start = textarea.selectionStart;
                            const end = textarea.selectionEnd;

                            // If there's a selection and user just released Shift (finished selecting)
                            // or pressed Enter to confirm selection
                            if (start !== end && (e.key === 'Shift' || e.key === 'Enter')) {
                                const newRange: HighlightRange = {
                                    start: Math.min(start, end),
                                    end: Math.max(start, end),
                                };
                                const newHighlights = mergeRanges([...highlights, newRange]);
                                onHighlightsChange(newHighlights);

                                // Clear native selection
                                setTimeout(() => {
                                    textarea.setSelectionRange(end, end);
                                }, 0);
                            }
                        }
                    }}
                    placeholder={placeholder}
                    spellCheck={spellCheck}
                    readOnly={readOnly}
                />

                {/* Highlight mode indicator / Clear button */}
                {highlightMode && highlights.length > 0 && (
                    <div className="absolute bottom-3 right-3 flex items-center gap-2 z-20">
                        <div className="px-2.5 py-1.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-xs rounded-full border border-amber-300 dark:border-amber-700 flex items-center gap-1.5 shadow-sm">
                            <span>✨ {getHighlightedCharCount(highlights)} chars selected</span>
                            <button
                                onClick={() => onHighlightsChange([])}
                                className="hover:bg-amber-200 dark:hover:bg-amber-800 rounded-full p-0.5 transition-colors"
                                title="Clear all highlights"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                )}

                {highlightMode && highlights.length === 0 && (
                    <div className="absolute bottom-3 right-3 px-2.5 py-1.5 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 text-xs rounded-full border border-gray-200 dark:border-slate-700 z-20 shadow-sm">
                        ✏️ Select text to highlight
                    </div>
                )}
            </div>
        );
    }
);

HighlightableTextArea.displayName = 'HighlightableTextArea';

export default HighlightableTextArea;
