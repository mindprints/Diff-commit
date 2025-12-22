import React, { useState, useEffect } from 'react';
import { X, Save, Palette, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { AIPrompt } from '../types';
import { generatePromptId } from '../constants/prompts';

// Color palette for prompts
const PROMPT_COLORS = [
    'bg-red-400',
    'bg-orange-400',
    'bg-amber-400',
    'bg-yellow-400',
    'bg-lime-400',
    'bg-green-400',
    'bg-emerald-400',
    'bg-teal-400',
    'bg-cyan-400',
    'bg-sky-400',
    'bg-blue-400',
    'bg-indigo-400',
    'bg-violet-400',
    'bg-purple-400',
    'bg-fuchsia-400',
    'bg-pink-400',
    'bg-rose-400',
];

// Default system instruction for custom prompts
const DEFAULT_SYSTEM_INSTRUCTION =
    "You are an AI assistant. Follow the instructions carefully and process the text as directed. " +
    "Return only the processed result without explanations unless asked.";

interface SavePromptDialogProps {
    isOpen: boolean;
    onClose: () => void;
    selectedText: string;
    onSave: (prompt: AIPrompt) => Promise<void>;
}

export function SavePromptDialog({
    isOpen,
    onClose,
    selectedText,
    onSave
}: SavePromptDialogProps) {
    const [name, setName] = useState('');
    const [color, setColor] = useState(() =>
        PROMPT_COLORS[Math.floor(Math.random() * PROMPT_COLORS.length)]
    );
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset state when dialog opens
    useEffect(() => {
        if (isOpen) {
            setName('');
            setColor(PROMPT_COLORS[Math.floor(Math.random() * PROMPT_COLORS.length)]);
            setShowColorPicker(false);
            setError(null);
        }
    }, [isOpen]);

    // Handle ESC key
    useEffect(() => {
        if (!isOpen) return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    const handleSave = async () => {
        if (!name.trim()) {
            setError('Please enter a name for your prompt');
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const newPrompt: AIPrompt = {
                id: generatePromptId(),
                name: name.trim(),
                systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
                promptTask: selectedText,
                isBuiltIn: false,
                order: 999, // Will be adjusted by addPrompt
                color,
            };

            await onSave(newPrompt);
            onClose();
        } catch (e) {
            setError((e as Error).message || 'Failed to save prompt');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    // Truncate preview if too long
    const previewText = selectedText.length > 200
        ? selectedText.substring(0, 200) + '...'
        : selectedText;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div
                className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-indigo-500" />
                        <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-200">
                            Save as Prompt
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 space-y-4">
                    {/* Name Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                            Prompt Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Formal Rewrite, Simplify Text..."
                            autoFocus
                            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && name.trim()) {
                                    handleSave();
                                }
                            }}
                        />
                    </div>

                    {/* Task Preview */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                            Prompt Task (from selection)
                        </label>
                        <div className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-600 text-sm text-gray-600 dark:text-slate-400 max-h-32 overflow-y-auto">
                            <p className="whitespace-pre-wrap">{previewText}</p>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">
                            {selectedText.length} characters selected
                        </p>
                    </div>

                    {/* Color Picker */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                            Color
                        </label>
                        <div className="relative">
                            <button
                                onClick={() => setShowColorPicker(!showColorPicker)}
                                className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                            >
                                <span className={clsx("w-4 h-4 rounded-full", color)} />
                                <span className="text-sm text-gray-700 dark:text-slate-300">
                                    {color.replace('bg-', '').replace('-400', '')}
                                </span>
                                <Palette className="w-4 h-4 text-gray-400" />
                            </button>

                            {showColorPicker && (
                                <div className="absolute top-full left-0 mt-2 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 z-10">
                                    <div className="grid grid-cols-6 gap-1">
                                        {PROMPT_COLORS.map((c) => (
                                            <button
                                                key={c}
                                                onClick={() => {
                                                    setColor(c);
                                                    setShowColorPicker(false);
                                                }}
                                                className={clsx(
                                                    "w-6 h-6 rounded-full transition-transform hover:scale-110",
                                                    c,
                                                    color === c && "ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-slate-800"
                                                )}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !name.trim()}
                        className={clsx(
                            "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                            isSaving || !name.trim()
                                ? "bg-gray-300 dark:bg-slate-600 text-gray-500 dark:text-slate-400 cursor-not-allowed"
                                : "bg-indigo-600 hover:bg-indigo-700 text-white"
                        )}
                    >
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Saving...' : 'Save & Edit'}
                    </button>
                </div>
            </div>
        </div>
    );
}
