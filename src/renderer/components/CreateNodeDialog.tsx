/**
 * CreateNodeDialog Component
 * 
 * A modal dialog for creating repositories and projects with strict hierarchy enforcement.
 * Shows current location type, validates names in real-time, and prevents invalid operations.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, FolderPlus, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './Button';
import './CreateNodeDialog.css';

type NodeType = 'root' | 'repository' | 'project';

interface ValidationResult {
    valid: boolean;
    error?: string;
}

interface CreateNodeDialogProps {
    isOpen: boolean;
    onClose: () => void;
    parentPath: string;
    parentType: NodeType;
    onNodeCreated: (node: { path: string; type: string; name: string }) => void;
}

// Human-readable labels for node types
const NODE_TYPE_LABELS: Record<NodeType, string> = {
    root: 'Root Folder',
    repository: 'Repository',
    project: 'Project'
};

// What can be created in each type
const ALLOWED_CHILDREN: Record<NodeType, NodeType[]> = {
    root: ['repository'],
    repository: ['project'],
    project: []
};

export function CreateNodeDialog({
    isOpen,
    onClose,
    parentPath,
    parentType,
    onNodeCreated
}: CreateNodeDialogProps) {
    const [name, setName] = useState('');
    const [selectedType, setSelectedType] = useState<NodeType | null>(null);
    const [validation, setValidation] = useState<ValidationResult>({ valid: true });
    const [isValidating, setIsValidating] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const allowedTypes = ALLOWED_CHILDREN[parentType] || [];

    // Auto-select if only one option
    useEffect(() => {
        if (allowedTypes.length === 1 && !selectedType) {
            setSelectedType(allowedTypes[0]);
        }
    }, [allowedTypes, selectedType]);

    // Helper for timestamp
    const getTimestampName = () => {
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    };

    // Reset state when dialog opens
    useEffect(() => {
        if (isOpen) {
            // Default to timestamp if creating a project (which is when parentType is repository)
            // or if we are forced to create a project
            const effectiveType = allowedTypes.length === 1 ? allowedTypes[0] : null;

            if (effectiveType === 'project' || parentType === 'repository') {
                setName(getTimestampName());
            } else {
                setName('');
            }

            setSelectedType(effectiveType);
            setValidation({ valid: true });
            setError(null);
        }
    }, [isOpen, allowedTypes, parentType]);

    // Debounced validation
    const validateName = useCallback(async (value: string, type: NodeType | null) => {
        if (!value.trim() || !type || !window.electron?.hierarchy) {
            setValidation({ valid: false, error: value ? undefined : 'Name is required' });
            return;
        }

        setIsValidating(true);
        try {
            const result = await window.electron.hierarchy.validateCreate(parentPath, value, type);
            setValidation(result);
        } catch (e) {
            setValidation({ valid: false, error: String(e) });
        }
        setIsValidating(false);
    }, [parentPath]);

    // Validate on name or type change (debounced)
    useEffect(() => {
        if (!name.trim()) {
            setValidation({ valid: false });
            return;
        }

        const timer = setTimeout(() => {
            validateName(name, selectedType);
        }, 300);

        return () => clearTimeout(timer);
    }, [name, selectedType, validateName]);

    const handleCreate = async () => {
        if (!name.trim() || !selectedType || !validation.valid) return;

        setIsCreating(true);
        setError(null);

        try {
            if (!window.electron?.hierarchy) {
                throw new Error('Hierarchy API not available');
            }

            const result = await window.electron.hierarchy.createNode(
                parentPath,
                name.trim(),
                selectedType
            );

            onNodeCreated(result);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setIsCreating(false);
        }
    };

    if (!isOpen) return null;

    const canCreate = name.trim() && selectedType && validation.valid && !isValidating && !isCreating;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Dialog */}
            <div className="create-node-dialog relative w-full max-w-md m-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FolderPlus className="w-5 h-5 text-indigo-500" />
                            <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">
                                Create New
                            </h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 py-5 space-y-5">
                    {/* Current Location */}
                    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4">
                        <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                            Current Location
                        </label>
                        <div className="flex items-center gap-2">
                            <span className={clsx(
                                "px-2 py-1 rounded-md text-xs font-semibold uppercase",
                                parentType === 'root' && "bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300",
                                parentType === 'repository' && "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300",
                                parentType === 'project' && "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                            )}>
                                {NODE_TYPE_LABELS[parentType]}
                            </span>
                            <span className="text-sm text-gray-600 dark:text-slate-400 truncate" title={parentPath}>
                                {parentPath.split(/[\\/]/).pop() || parentPath}
                            </span>
                        </div>
                    </div>

                    {/* Type Selection (if multiple options) */}
                    {allowedTypes.length > 1 && (
                        <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 block">
                                What do you want to create?
                            </label>
                            <div className="flex gap-2">
                                {allowedTypes.map((type) => (
                                    <button
                                        key={type}
                                        onClick={() => setSelectedType(type)}
                                        className={clsx(
                                            "flex-1 px-4 py-3 rounded-xl border-2 transition-all",
                                            selectedType === type
                                                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                                                : "border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600"
                                        )}
                                    >
                                        <div className="text-sm font-medium text-gray-900 dark:text-slate-100">
                                            {NODE_TYPE_LABELS[type]}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* No allowed operations */}
                    {allowedTypes.length === 0 && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                        Cannot create items here
                                    </p>
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                        Projects can only contain commit files (managed automatically).
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Name Input */}
                    {allowedTypes.length > 0 && selectedType && (
                        <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 block">
                                {NODE_TYPE_LABELS[selectedType]} Name
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder={`Enter ${selectedType} name...`}
                                    className={clsx(
                                        "w-full px-4 py-3 rounded-xl border-2 text-sm transition-all",
                                        "bg-white dark:bg-slate-800",
                                        "text-gray-900 dark:text-slate-100",
                                        "placeholder-gray-400 dark:placeholder-slate-500",
                                        "focus:outline-none focus:ring-2 focus:ring-offset-2",
                                        validation.error
                                            ? "border-red-300 dark:border-red-800 focus:ring-red-500"
                                            : validation.valid && name.trim()
                                                ? "border-green-300 dark:border-green-800 focus:ring-green-500"
                                                : "border-gray-200 dark:border-slate-700 focus:ring-indigo-500"
                                    )}
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && canCreate) handleCreate();
                                        if (e.key === 'Escape') onClose();
                                    }}
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    {isValidating && (
                                        <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                                    )}
                                    {!isValidating && validation.valid && name.trim() && (
                                        <CheckCircle className="w-4 h-4 text-green-500" />
                                    )}
                                    {!isValidating && validation.error && (
                                        <AlertCircle className="w-4 h-4 text-red-500" />
                                    )}
                                </div>
                            </div>
                            {validation.error && (
                                <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                                    {validation.error}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Hierarchy Info */}
                    {allowedTypes.length > 0 && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
                            <h4 className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider mb-2">
                                Hierarchy Rules
                            </h4>
                            <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                                <li>• <strong>Root folders</strong> can only contain Repositories</li>
                                <li>• <strong>Repositories</strong> can only contain Projects</li>
                                <li>• <strong>Projects</strong> contain commits (managed automatically)</li>
                            </ul>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-slate-950 border-t border-gray-200 dark:border-slate-800 flex justify-end gap-3">
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    {allowedTypes.length > 0 && (
                        <Button
                            variant="primary"
                            onClick={handleCreate}
                            disabled={!canCreate}
                            icon={isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />}
                        >
                            {isCreating ? 'Creating...' : `Create ${selectedType ? NODE_TYPE_LABELS[selectedType] : ''}`}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
