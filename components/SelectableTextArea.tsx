import React, { useRef, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import clsx from 'clsx';

export interface SelectionRange {
    start: number;
    end: number;
}

interface SelectableTextAreaProps {
    value: string;
    onChange: (value: string) => void;
    selection: SelectionRange | null;
    onSelectionChange: (selection: SelectionRange | null) => void;
    className?: string;
    placeholder?: string;
    spellCheck?: boolean;
    fontClassName?: string;
    sizeClassName?: string;
}

export interface SelectableTextAreaRef {
    focus: () => void;
    getTextarea: () => HTMLTextAreaElement | null;
    getSelectedText: () => string;
    clearSelection: () => void;
}

/**
 * Enhanced textarea that captures and stores text selections.
 * The selection persists even after releasing the mouse, shown via an indicator badge.
 * Uses a real textarea for proper text editing, with selection stored separately.
 */
const SelectableTextArea = forwardRef<SelectableTextAreaRef, SelectableTextAreaProps>(
    (
        {
            value,
            onChange,
            selection,
            onSelectionChange,
            className,
            placeholder,
            spellCheck = false,
            fontClassName,
            sizeClassName,
        },
        ref
    ) => {
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const [isDragging, setIsDragging] = useState(false);

        // Expose methods to parent
        useImperativeHandle(ref, () => ({
            focus: () => textareaRef.current?.focus(),
            getTextarea: () => textareaRef.current,
            getSelectedText: () => {
                if (selection && selection.start !== selection.end) {
                    return value.substring(selection.start, selection.end);
                }
                return '';
            },
            clearSelection: () => onSelectionChange(null),
        }));

        // Capture selection on mouseup
        const handleMouseUp = () => {
            if (!textareaRef.current) return;

            const textarea = textareaRef.current;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;

            // Only capture if there's an actual selection (not just cursor)
            if (start !== end) {
                onSelectionChange({
                    start: Math.min(start, end),
                    end: Math.max(start, end)
                });
            }

            setIsDragging(false);
        };

        const handleMouseDown = () => {
            setIsDragging(true);
            // Clear previous selection when starting a new one
            if (selection) {
                onSelectionChange(null);
            }
        };

        // Clear selection when text changes
        const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            onChange(e.target.value);
            if (selection) {
                onSelectionChange(null);
            }
        };

        // Get preview of selected text
        const getSelectionPreview = () => {
            if (!selection) return '';
            const text = value.substring(selection.start, selection.end);
            return text.length > 40 ? text.substring(0, 40) + '...' : text;
        };

        return (
            <div className="relative w-full h-full">
                <textarea
                    ref={textareaRef}
                    className={clsx(
                        'w-full h-full p-8 resize-none bg-transparent border-none focus:ring-0 outline-none transition-colors',
                        fontClassName,
                        sizeClassName,
                        className,
                        // Add subtle border when selection exists
                        selection && 'ring-2 ring-amber-300 dark:ring-amber-600 ring-inset rounded-lg'
                    )}
                    value={value}
                    onChange={handleChange}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    placeholder={placeholder}
                    spellCheck={spellCheck}
                />

                {/* Selection indicator badge */}
                {selection && selection.start !== selection.end && (
                    <div className="absolute bottom-4 right-4 max-w-xs bg-amber-100 dark:bg-amber-900/80 border border-amber-300 dark:border-amber-700 rounded-lg shadow-lg z-20 overflow-hidden">
                        <div className="px-3 py-2 flex items-center gap-2">
                            <span className="text-amber-600 dark:text-amber-300 text-sm font-medium">
                                ✨ {selection.end - selection.start} chars selected
                            </span>
                            <button
                                onClick={() => onSelectionChange(null)}
                                className="text-amber-500 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200 transition-colors p-1 hover:bg-amber-200 dark:hover:bg-amber-800 rounded"
                                title="Clear selection"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/50 border-t border-amber-200 dark:border-amber-800">
                            <p className="text-xs text-amber-700 dark:text-amber-300 italic truncate">
                                "{getSelectionPreview()}"
                            </p>
                        </div>
                    </div>
                )}
            </div>
        );
    }
);

SelectableTextArea.displayName = 'SelectableTextArea';

export default SelectableTextArea;
