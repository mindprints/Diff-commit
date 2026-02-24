import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { AIPrompt } from '../types';

interface PromptDropdownButtonProps {
    activePrompt: AIPrompt | null;
    pinnedPrompts: AIPrompt[];
    isProcessing: boolean;
    processingLabel?: string;
    onExecute: () => void;
    onSelectPrompt: (id: string) => void;
    onOpenGraph: () => void;
    onCancel: () => void;
    disabled?: boolean;
}

export function PromptDropdownButton({
    activePrompt,
    pinnedPrompts,
    isProcessing,
    processingLabel = 'Processing...',
    onExecute,
    onSelectPrompt,
    onOpenGraph,
    onCancel,
    disabled = false,
}: PromptDropdownButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen]);

    // Close on escape
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [isOpen]);

    const handleMainClick = useCallback((e: React.MouseEvent) => {
        if (disabled) return;

        // Shift+Click → open prompt graph
        if (e.shiftKey) {
            e.preventDefault();
            onOpenGraph();
            return;
        }

        // Normal click → execute the active prompt
        onExecute();
    }, [disabled, onExecute, onOpenGraph]);

    const handleArrowClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (disabled) return;
        setIsOpen(prev => !prev);
    }, [disabled]);

    const handleSelect = useCallback((id: string) => {
        onSelectPrompt(id);
        setIsOpen(false);
    }, [onSelectPrompt]);

    const promptColor = activePrompt?.color || 'bg-gray-400';
    const displayName = isProcessing ? processingLabel : (activePrompt?.name || 'Select Prompt');

    return (
        <div className="relative" ref={dropdownRef}>
            <div className={clsx(
                "flex items-center rounded-lg border transition-all overflow-hidden",
                "border-gray-200 dark:border-slate-700",
                "bg-white dark:bg-slate-800",
                disabled && "opacity-60 cursor-not-allowed",
                !disabled && "hover:border-indigo-300 dark:hover:border-indigo-600"
            )}>
                {/* Main button — Click to execute, Shift+Click to open graph */}
                <button
                    className={clsx(
                        "flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors",
                        "text-gray-700 dark:text-slate-200",
                        !disabled && !isProcessing && "hover:bg-indigo-50 dark:hover:bg-indigo-900/20 active:bg-indigo-100 dark:active:bg-indigo-900/40",
                        isProcessing && "cursor-default"
                    )}
                    onClick={isProcessing ? onCancel : handleMainClick}
                    disabled={disabled}
                    title={isProcessing ? "Click to cancel" : "Click to execute • Shift+Click for Prompt Graph"}
                >
                    {isProcessing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                    ) : (
                        <span className={clsx('w-2.5 h-2.5 rounded-full ring-1 ring-black/10', promptColor)} />
                    )}
                    <span className="truncate max-w-[180px]">{displayName}</span>
                </button>

                {/* Divider */}
                <div className="w-px h-5 bg-gray-200 dark:bg-slate-700" />

                {/* Dropdown arrow button */}
                <button
                    className={clsx(
                        "flex items-center justify-center px-1.5 py-1.5 transition-colors",
                        "text-gray-400 dark:text-slate-500",
                        !disabled && "hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-600 dark:hover:text-slate-300",
                        isOpen && "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300"
                    )}
                    onClick={handleArrowClick}
                    disabled={disabled}
                    title="Choose a prompt"
                >
                    <ChevronDown className={clsx("w-3.5 h-3.5 transition-transform", isOpen && "rotate-180")} />
                </button>
            </div>

            {/* Dropdown menu */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                        Pinned Prompts
                    </div>

                    {pinnedPrompts.length === 0 && (
                        <div className="px-3 py-2 text-xs text-gray-400 dark:text-slate-500 italic">
                            No pinned prompts. Open the Prompt Graph (Shift+Click) to pin prompts.
                        </div>
                    )}

                    {pinnedPrompts.map(prompt => (
                        <button
                            key={prompt.id}
                            className={clsx(
                                "w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors",
                                prompt.id === activePrompt?.id
                                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                                    : "text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700/60"
                            )}
                            onClick={() => handleSelect(prompt.id)}
                        >
                            <span className={clsx(
                                'w-2.5 h-2.5 rounded-full ring-1 ring-black/10 flex-shrink-0',
                                prompt.color || 'bg-gray-400'
                            )} />
                            <span className="truncate">{prompt.name}</span>
                            {prompt.id === activePrompt?.id && (
                                <span className="ml-auto text-[10px] text-indigo-400 dark:text-indigo-500 font-medium">Active</span>
                            )}
                        </button>
                    ))}

                    <div className="border-t border-gray-100 dark:border-slate-700 mt-1 pt-1">
                        <button
                            className="w-full text-left px-3 py-2 text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700/60 flex items-center gap-2 transition-colors"
                            onClick={() => {
                                setIsOpen(false);
                                onOpenGraph();
                            }}
                        >
                            <span className="text-indigo-500">⬡</span>
                            Manage Prompts (Prompt Graph)
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
