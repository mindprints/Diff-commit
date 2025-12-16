import React, { useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import clsx from 'clsx';

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
    onScroll?: () => void;
}

export interface MultiSelectTextAreaRef {
    focus: () => void;
    getTextarea: () => HTMLTextAreaElement | null;
}

/**
 * Simple textarea wrapper that exposes ref methods for getting native selection.
 * Provides consistent interface for AI text operations.
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
            onScroll
        },
        ref
    ) {
        const textareaRef = useRef<HTMLTextAreaElement>(null);

        // Expose methods to parent via ref
        useImperativeHandle(ref, () => ({
            focus: () => textareaRef.current?.focus(),
            getTextarea: () => textareaRef.current,
        }));

        const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
            onChange(e.target.value);
        }, [onChange]);

        return (
            <div className="relative flex-1 overflow-hidden h-full">
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={handleChange}
                    className={clsx(
                        "w-full h-full p-4 resize-none",
                        fontClassName,
                        sizeClassName,
                        className
                    )}
                    placeholder={placeholder}
                    spellCheck={spellCheck}
                    readOnly={readOnly}
                    onContextMenu={onContextMenu}
                    onScroll={onScroll}
                />
            </div>
        );
    }
);

export default MultiSelectTextArea;
