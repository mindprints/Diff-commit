import React, { useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import clsx from 'clsx';
import { PendingOperation } from '../hooks/useAsyncAI';

interface MultiSelectTextAreaProps {
    value: string;
    onChange: (value: string) => void;
    className?: string;
    placeholder?: string;
    spellCheck?: boolean;
    fontClassName?: string;
    sizeClassName?: string;
    readOnly?: boolean;
    onContextMenu?: (e: React.MouseEvent<HTMLTextAreaElement>) => void;
    onClick?: (e: React.MouseEvent<HTMLTextAreaElement>) => void;
    onScroll?: () => void;
    onFocus?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
    onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
    pendingOperations?: PendingOperation[];
    frozenSelection?: { start: number, end: number, text: string } | null;
}

export interface MultiSelectTextAreaRef {
    focus: () => void;
    getTextarea: () => HTMLTextAreaElement | null;
}

/**
 * Textarea wrapper that supports visual overlays for pending AI operations.
 * Uses a mirrored backdrop to render highlights behind the text.
 */
const MultiSelectTextArea = forwardRef<MultiSelectTextAreaRef, MultiSelectTextAreaProps>(
    function MultiSelectTextAreaInner(
        {
            value,
            onChange,
            className,
            placeholder,
            spellCheck = false,
            fontClassName,
            sizeClassName,
            readOnly = false,
            onContextMenu,
            onClick,
            onScroll,
            onFocus,
            onBlur,
            pendingOperations = [],
            frozenSelection = null
        },
        ref
    ) {
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const backdropRef = useRef<HTMLDivElement>(null);

        // Expose methods to parent via ref
        useImperativeHandle(ref, () => ({
            focus: () => textareaRef.current?.focus(),
            getTextarea: () => textareaRef.current,
        }));

        const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
            onChange(e.target.value);
        }, [onChange]);

        const handleScroll = useCallback(() => {
            if (textareaRef.current && backdropRef.current) {
                backdropRef.current.scrollTop = textareaRef.current.scrollTop;
                backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
            }
            if (onScroll) onScroll();
        }, [onScroll]);

        // Render the backdrop content with highlights
        const renderBackdrop = () => {
            const hasPending = pendingOperations.length > 0 && pendingOperations.some(op => op.status === 'pending');

            if (!hasPending && !frozenSelection) return <span className="invisible">{value}</span>;

            // Sort operations by start position to handle sequential rendering
            const sortedOps = [...pendingOperations]
                .filter(op => op.status === 'pending')
                .sort((a, b) => a.originalStart - b.originalStart);

            if (sortedOps.length === 0 && !frozenSelection) return <span className="invisible">{value}</span>;

            const elements: React.ReactNode[] = [];
            let currentPos = 0;

            sortedOps.forEach((op, index) => {
                // Safely handle out of bounds or overlapping ranges
                const start = Math.max(currentPos, Math.min(op.originalStart, value.length));
                const end = Math.max(start, Math.min(op.originalEnd, value.length));

                // Add text before the highlight
                if (start > currentPos) {
                    elements.push(
                        <span key={`text-${index}`} className="invisible">
                            {value.substring(currentPos, start)}
                        </span>
                    );
                }

                // Add the highlighted segment
                // Text is invisible, but background is visible
                if (end > start) {
                    elements.push(
                        <span
                            key={`op-${op.id}`}
                            className="bg-indigo-500/60 dark:bg-indigo-400/60 animate-pulse text-transparent rounded px-0.5 -mx-0.5"
                        >
                            {value.substring(start, end)}
                        </span>
                    );
                }

                currentPos = end;
            });

            // Add remaining text
            if (currentPos < value.length) {
                const remaining = value.substring(currentPos);

                // If there's a frozen selection later in the text (though usually it's one or the other)
                // we treat it as a background highlight.
                // For simplicity and to avoid complex merging, we only render frozen selection
                // if it doesn't overlap with any PENDING operations.
                if (frozenSelection && !hasPending) {
                    const fStart = Math.max(0, Math.min(frozenSelection.start, value.length));
                    const fEnd = Math.max(fStart, Math.min(frozenSelection.end, value.length));

                    if (fStart > currentPos) {
                        elements.push(<span key="text-rem-1" className="invisible">{value.substring(currentPos, fStart)}</span>);
                    }
                    if (fEnd > fStart) {
                        elements.push(
                            <span key="frozen-selection" className="bg-amber-400/30 dark:bg-amber-500/30 rounded px-0.5 -mx-0.5">
                                {value.substring(fStart, fEnd)}
                            </span>
                        );
                    }
                    if (value.length > fEnd) {
                        elements.push(<span key="text-rem-2" className="invisible">{value.substring(fEnd)}</span>);
                    }
                } else {
                    elements.push(
                        <span key="text-end" className="invisible">
                            {remaining}
                        </span>
                    );
                }
            }

            // Add a zero-width space at the end to ensure trailing newlines are rendered
            elements.push(<span key="zwsp" className="invisible">&#8203;</span>);

            return elements;
        };

        return (
            <div className="relative flex-1 overflow-hidden h-full isolate">
                {/* Overlay for highlights (Front) */}
                <div
                    ref={backdropRef}
                    className={clsx(
                        "absolute inset-0 w-full h-full p-4 resize-none pointer-events-none whitespace-pre-wrap break-words overflow-hidden bg-transparent",
                        fontClassName,
                        sizeClassName,
                        className,
                        // Override standard textarea styling to ensure transparency
                        "text-transparent select-none"
                    )}
                    style={{ zIndex: 20 }}
                    aria-hidden="true"
                >
                    {renderBackdrop()}
                </div>

                {/* Actual Textarea (Back) */}
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={handleChange}
                    onScroll={handleScroll}
                    className={clsx(
                        "relative w-full h-full p-4 resize-none",
                        fontClassName,
                        sizeClassName,
                        className
                    )}
                    style={{ zIndex: 10, backgroundColor: 'transparent' }}
                    placeholder={placeholder}
                    spellCheck={spellCheck}
                    readOnly={readOnly}
                    onContextMenu={onContextMenu}
                    onClick={onClick}
                    onFocus={onFocus}
                    onBlur={onBlur}
                />
            </div>
        );
    }
);

export default MultiSelectTextArea;
