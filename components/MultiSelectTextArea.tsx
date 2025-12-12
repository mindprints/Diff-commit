import React, { useRef, forwardRef, useImperativeHandle, useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { SelectionRange } from '../hooks/useMultiSelection';

interface MultiSelectTextAreaProps {
    value: string;
    onChange: (value: string) => void;
    ranges: SelectionRange[];
    onAddRange: (start: number, end: number, isAdditive: boolean) => void;
    onClearRanges: () => void;
    className?: string;
    placeholder?: string;
    spellCheck?: boolean;
    fontClassName?: string;
    sizeClassName?: string;
    readOnly?: boolean;
    onContextMenu?: (e: React.MouseEvent<HTMLTextAreaElement>) => void;
}

export interface MultiSelectTextAreaRef {
    focus: () => void;
    getTextarea: () => HTMLTextAreaElement | null;
    getSelectedRanges: () => SelectionRange[];
}

/**
 * Textarea with support for discontinuous multi-selection.
 * - Normal drag: Replaces all selections
 * - Ctrl+drag: Adds to existing selections
 * - Double-click on highlight: Removes that range
 * - Click without Ctrl: Clears all selections
 * 
 * Shows visual highlights using a synchronized overlay with <mark> tags.
 */
const MultiSelectTextArea = forwardRef<MultiSelectTextAreaRef, MultiSelectTextAreaProps>(
    (
        {
            value,
            onChange,
            ranges,
            onAddRange,
            onClearRanges,
            className,
            placeholder,
            spellCheck = false,
            fontClassName,
            sizeClassName,
            readOnly = false,
            onContextMenu,
        },
        ref
    ) => {
        const containerRef = useRef<HTMLDivElement>(null);
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const highlightRef = useRef<HTMLDivElement>(null);
        const [isSelecting, setIsSelecting] = useState(false);
        const [ctrlHeld, setCtrlHeld] = useState(false);

        // Track Ctrl key state
        useEffect(() => {
            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Control') setCtrlHeld(true);
            };
            const handleKeyUp = (e: KeyboardEvent) => {
                if (e.key === 'Control') setCtrlHeld(false);
            };
            // Also reset on blur (user switches windows)
            const handleBlur = () => setCtrlHeld(false);

            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('keyup', handleKeyUp);
            window.addEventListener('blur', handleBlur);

            return () => {
                window.removeEventListener('keydown', handleKeyDown);
                window.removeEventListener('keyup', handleKeyUp);
                window.removeEventListener('blur', handleBlur);
            };
        }, []);

        // Expose methods to parent via ref
        useImperativeHandle(ref, () => ({
            focus: () => textareaRef.current?.focus(),
            getTextarea: () => textareaRef.current,
            getSelectedRanges: () => ranges,
        }));

        // Sync scroll between overlay and textarea
        const handleScroll = useCallback(() => {
            if (textareaRef.current && highlightRef.current) {
                highlightRef.current.scrollTop = textareaRef.current.scrollTop;
                highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
            }
        }, []);

        // Handle mouse down - start potential selection
        const handleMouseDown = useCallback((e: React.MouseEvent) => {
            setIsSelecting(true);

            // If not holding Ctrl and not starting a drag, clear on simple click
            // We'll check on mouseup if there was an actual selection
            if (!e.ctrlKey && ranges.length > 0) {
                // Don't clear immediately - wait to see if user is making a new selection
            }
        }, [ranges.length]);

        // Handle mouse up - capture selection
        const handleMouseUp = useCallback((e: React.MouseEvent) => {
            if (!textareaRef.current || !isSelecting) return;

            const textarea = textareaRef.current;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;

            if (start !== end) {
                // User made a selection - add it (additive if Ctrl held)
                onAddRange(start, end, e.ctrlKey);
            } else if (!e.ctrlKey && ranges.length > 0) {
                // User just clicked without Ctrl and there's no selection - clear all
                onClearRanges();
            }

            setIsSelecting(false);
        }, [isSelecting, onAddRange, onClearRanges, ranges.length]);

        // Handle double-click to remove a specific range
        const handleDoubleClick = useCallback(() => {
            // For now, double-click behavior can be used for word selection
            // Range removal could be added via a different mechanism if needed
        }, []);

        // Handle text change - clear selections as positions become invalid
        const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
            onChange(e.target.value);
            if (ranges.length > 0) {
                onClearRanges();
            }
        }, [onChange, onClearRanges, ranges.length]);

        // Handle keyboard selection (Shift+Arrow keys)
        const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
            if (!textareaRef.current) return;

            const textarea = textareaRef.current;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;

            // If user just released Shift and there's a selection, capture it
            if (e.key === 'Shift' && start !== end) {
                onAddRange(start, end, e.ctrlKey);
            }
        }, [onAddRange]);

        // Render text with highlight overlay
        const renderHighlightedText = () => {
            if (!value) return null;
            if (ranges.length === 0) return <span className="invisible">{value}</span>;

            // Sort ranges by start position
            const sortedRanges = [...ranges].sort((a, b) => a.start - b.start);
            const parts: React.ReactNode[] = [];
            let lastIndex = 0;

            sortedRanges.forEach((range, i) => {
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
                    style={{ padding: '2rem' }}
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
                    onChange={handleChange}
                    onScroll={handleScroll}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    onDoubleClick={handleDoubleClick}
                    onKeyUp={handleKeyUp}
                    onContextMenu={onContextMenu}
                    placeholder={placeholder}
                    spellCheck={spellCheck}
                    readOnly={readOnly}
                />

                {/* Visual indicator that Ctrl is held (optional subtle cue) */}
                {ctrlHeld && ranges.length > 0 && (
                    <div className="absolute top-2 right-2 px-2 py-1 bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs rounded border border-indigo-300 dark:border-indigo-700 z-20">
                        + Add to selection
                    </div>
                )}
            </div>
        );
    }
);

MultiSelectTextArea.displayName = 'MultiSelectTextArea';

export default MultiSelectTextArea;
