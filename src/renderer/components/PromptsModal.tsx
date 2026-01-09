import React, { useState, useEffect } from 'react';
import { X, Plus, RotateCcw, Trash2, Edit3, Check, ChevronDown, ChevronUp, Star, Palette } from 'lucide-react';
import { Button } from './Button';
import { AIPrompt } from '../types';
import { Model } from '../constants/models';
import { generatePromptId } from '../constants/prompts';
import clsx from 'clsx';

interface PromptsModalProps {
    isOpen: boolean;
    onClose: () => void;
    prompts: AIPrompt[];
    onCreatePrompt: (data: Omit<AIPrompt, 'id' | 'isBuiltIn' | 'order'>) => Promise<void>;
    onUpdatePrompt: (id: string, updates: Partial<AIPrompt>) => Promise<void>;
    onDeletePrompt: (id: string) => Promise<void>;
    onResetBuiltIn: (id: string) => Promise<void>;
    defaultPromptId: string;
    onSetDefault: (id: string) => void;
    onFactCheck?: () => void;
    selectedModel?: Model;
    selectedImageModel?: Model | null;
}

interface PromptFormState {
    name: string;
    systemInstruction: string;
    promptTask: string;
    color: string;
}

const COLORS = [
    { value: 'bg-green-400', label: 'Green' },
    { value: 'bg-blue-400', label: 'Blue' },
    { value: 'bg-purple-400', label: 'Purple' },
    { value: 'bg-amber-400', label: 'Amber' },
    { value: 'bg-rose-400', label: 'Rose' },
    { value: 'bg-cyan-400', label: 'Cyan' },
    { value: 'bg-indigo-400', label: 'Indigo' },
    { value: 'bg-pink-400', label: 'Pink' },
];

const emptyForm: PromptFormState = {
    name: '',
    systemInstruction: '',
    promptTask: '',
    color: 'bg-gray-400',
};

export function PromptsModal({
    isOpen,
    onClose,
    prompts,
    onCreatePrompt,
    onUpdatePrompt,
    onDeletePrompt,
    onResetBuiltIn,
    defaultPromptId,
    onSetDefault,
    onFactCheck,
    selectedModel,
    selectedImageModel,
}: PromptsModalProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [formState, setFormState] = useState<PromptFormState>(emptyForm);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setEditingId(null);
            setIsCreating(false);
            setFormState(emptyForm);
            setExpandedId(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const builtInPrompts = prompts.filter(p => p.isBuiltIn);
    const customPrompts = prompts.filter(p => !p.isBuiltIn);

    const handleEdit = (prompt: AIPrompt) => {
        setEditingId(prompt.id);
        setIsCreating(false);
        setFormState({
            name: prompt.name,
            systemInstruction: prompt.systemInstruction,
            promptTask: prompt.promptTask,
            color: prompt.color || 'bg-gray-400',
        });
        setExpandedId(prompt.id);
    };

    const handleStartCreate = () => {
        setIsCreating(true);
        setEditingId(null);
        setFormState(emptyForm);
    };

    const handleCancel = () => {
        setEditingId(null);
        setIsCreating(false);
        setFormState(emptyForm);
    };

    const handleSave = async () => {
        if (!formState.name.trim() || !formState.systemInstruction.trim() || !formState.promptTask.trim()) {
            return;
        }

        setIsSaving(true);
        try {
            if (isCreating) {
                await onCreatePrompt({
                    name: formState.name.trim(),
                    systemInstruction: formState.systemInstruction.trim(),
                    promptTask: formState.promptTask.trim(),
                    color: formState.color,
                });
                setIsCreating(false);
            } else if (editingId) {
                await onUpdatePrompt(editingId, {
                    name: formState.name.trim(),
                    systemInstruction: formState.systemInstruction.trim(),
                    promptTask: formState.promptTask.trim(),
                    color: formState.color,
                });
                setEditingId(null);
            }
            setFormState(emptyForm);
        } catch (err) {
            console.error('Failed to save prompt:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this prompt?')) {
            try {
                await onDeletePrompt(id);
            } catch (err) {
                console.error('Failed to delete prompt:', err);
            }
        }
    };

    const handleReset = async (id: string) => {
        if (confirm('Reset this prompt to its default values?')) {
            try {
                await onResetBuiltIn(id);
            } catch (err) {
                console.error('Failed to reset prompt:', err);
            }
        }
    };

    const renderPromptItem = (prompt: AIPrompt) => {
        const isEditing = editingId === prompt.id;
        const isExpanded = expandedId === prompt.id;

        return (
            <div
                key={prompt.id}
                className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden"
            >
                {/* Header Row */}
                <div
                    className={clsx(
                        "flex items-center gap-3 p-3 transition-colors",
                        isExpanded && "bg-gray-50 dark:bg-slate-800/50"
                    )}
                >
                    {/* Star button for quick default selection */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onSetDefault(prompt.id);
                            onClose();
                        }}
                        className={clsx(
                            "p-1 rounded transition-colors shrink-0",
                            defaultPromptId === prompt.id
                                ? "text-amber-500 bg-amber-50 dark:bg-amber-900/30"
                                : "text-gray-300 hover:text-amber-400 hover:bg-amber-50 dark:text-slate-600 dark:hover:text-amber-400 dark:hover:bg-amber-900/20"
                        )}
                        title={defaultPromptId === prompt.id ? "Current default prompt" : "Set as default prompt"}
                    >
                        <Star className={clsx("w-4 h-4", defaultPromptId === prompt.id && "fill-current")} />
                    </button>
                    <span className={clsx("w-2.5 h-2.5 rounded-full shrink-0", prompt.color || 'bg-gray-400')} />
                    <span
                        className="flex-1 font-medium text-gray-800 dark:text-slate-200 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400"
                        onClick={() => setExpandedId(isExpanded ? null : prompt.id)}
                    >
                        {prompt.name}
                    </span>
                    {prompt.isBuiltIn && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded">
                            Built-in
                        </span>
                    )}
                    {/* Contextual model indicator */}
                    {prompt.isImageMode ? (
                        <span
                            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-pink-100 dark:bg-pink-900/40 text-pink-600 dark:text-pink-400 rounded"
                            title="Uses image generation model"
                        >
                            <Palette className="w-2.5 h-2.5" />
                            {selectedImageModel?.name ? (selectedImageModel.name.length > 15 ? selectedImageModel.name.slice(0, 12) + '...' : selectedImageModel.name) : 'No image model'}
                        </span>
                    ) : (
                        selectedModel && (
                            <span
                                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded"
                                title="Uses text model"
                            >
                                <Star className="w-2.5 h-2.5" />
                                {selectedModel.name.length > 15 ? selectedModel.name.slice(0, 12) + '...' : selectedModel.name}
                            </span>
                        )
                    )}
                    <button
                        onClick={() => setExpandedId(isExpanded ? null : prompt.id)}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
                    >
                        {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                        ) : (
                            <ChevronDown className="w-4 h-4" />
                        )}
                    </button>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                    <div className="border-t border-gray-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
                        {isEditing ? (
                            /* Edit Form */
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Name</label>
                                    <input
                                        type="text"
                                        value={formState.name}
                                        onChange={e => setFormState(prev => ({ ...prev, name: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Prompt name"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Color</label>
                                    <div className="flex gap-2 flex-wrap">
                                        {COLORS.map(c => (
                                            <button
                                                key={c.value}
                                                onClick={() => setFormState(prev => ({ ...prev, color: c.value }))}
                                                className={clsx(
                                                    "w-6 h-6 rounded-full transition-all",
                                                    c.value,
                                                    formState.color === c.value && "ring-2 ring-offset-2 ring-indigo-500"
                                                )}
                                                title={c.label}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">System Instruction</label>
                                    <textarea
                                        value={formState.systemInstruction}
                                        onChange={e => setFormState(prev => ({ ...prev, systemInstruction: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 h-24 resize-none"
                                        placeholder="The system instruction that defines the AI's role..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Task Description</label>
                                    <textarea
                                        value={formState.promptTask}
                                        onChange={e => setFormState(prev => ({ ...prev, promptTask: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 h-24 resize-none"
                                        placeholder="The specific task to perform on the user's text..."
                                    />
                                </div>
                                <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="sm" onClick={handleCancel}>Cancel</Button>
                                    <Button variant="primary" size="sm" onClick={handleSave} isLoading={isSaving} icon={<Check className="w-3 h-3" />}>
                                        Save
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            /* Read-only View */
                            <div className="space-y-3">
                                <div>
                                    <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-500">System Instruction</span>
                                    <p className="text-sm text-gray-700 dark:text-slate-300 mt-1 whitespace-pre-wrap">{prompt.systemInstruction}</p>
                                </div>
                                <div>
                                    <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-500">Task Description</span>
                                    <p className="text-sm text-gray-700 dark:text-slate-300 mt-1 whitespace-pre-wrap">{prompt.promptTask}</p>
                                </div>
                                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                                    {defaultPromptId !== prompt.id && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => onSetDefault(prompt.id)}
                                            icon={<Star className="w-3 h-3" />}
                                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                                        >
                                            Set Default
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEdit(prompt)}
                                        icon={<Edit3 className="w-3 h-3" />}
                                    >
                                        Edit
                                    </Button>
                                    {prompt.isBuiltIn ? (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleReset(prompt.id)}
                                            icon={<RotateCcw className="w-3 h-3" />}
                                        >
                                            Reset
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(prompt.id)}
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                                            icon={<Trash2 className="w-3 h-3" />}
                                        >
                                            Delete
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-800">
                    <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-200">Manage AI Prompts</h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Built-in Prompts */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide mb-3">
                            Built-in Prompts
                        </h3>
                        <div className="space-y-2">
                            {builtInPrompts.map(renderPromptItem)}
                        </div>
                    </div>

                    {/* Custom Prompts */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide mb-3">
                            Custom Prompts
                        </h3>
                        {customPrompts.length === 0 && !isCreating ? (
                            <p className="text-sm text-gray-500 dark:text-slate-500 italic">
                                No custom prompts yet. Create one to get started.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {customPrompts.map(renderPromptItem)}
                            </div>
                        )}

                        {/* Create Form */}
                        {isCreating && (
                            <div className="border border-indigo-300 dark:border-indigo-700 rounded-lg p-4 bg-indigo-50/50 dark:bg-indigo-950/30 mt-3 space-y-4">
                                <h4 className="font-medium text-indigo-800 dark:text-indigo-300">New Custom Prompt</h4>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Name</label>
                                    <input
                                        type="text"
                                        value={formState.name}
                                        onChange={e => setFormState(prev => ({ ...prev, name: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500"
                                        placeholder="My Custom Prompt"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Color</label>
                                    <div className="flex gap-2 flex-wrap">
                                        {COLORS.map(c => (
                                            <button
                                                key={c.value}
                                                onClick={() => setFormState(prev => ({ ...prev, color: c.value }))}
                                                className={clsx(
                                                    "w-6 h-6 rounded-full transition-all",
                                                    c.value,
                                                    formState.color === c.value && "ring-2 ring-offset-2 ring-indigo-500"
                                                )}
                                                title={c.label}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">System Instruction</label>
                                    <textarea
                                        value={formState.systemInstruction}
                                        onChange={e => setFormState(prev => ({ ...prev, systemInstruction: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 h-24 resize-none"
                                        placeholder="You are an expert..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Task Description</label>
                                    <textarea
                                        value={formState.promptTask}
                                        onChange={e => setFormState(prev => ({ ...prev, promptTask: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 h-24 resize-none"
                                        placeholder="Process the following text by..."
                                    />
                                </div>
                                <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="sm" onClick={handleCancel}>Cancel</Button>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={handleSave}
                                        isLoading={isSaving}
                                        disabled={!formState.name.trim() || !formState.systemInstruction.trim() || !formState.promptTask.trim()}
                                        icon={<Check className="w-3 h-3" />}
                                    >
                                        Create
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-200 dark:border-slate-800 flex justify-between">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleStartCreate}
                        disabled={isCreating}
                        icon={<Plus className="w-3 h-3" />}
                    >
                        Create New Prompt
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        Done
                    </Button>
                </div>
            </div>
        </div>
    );
}
