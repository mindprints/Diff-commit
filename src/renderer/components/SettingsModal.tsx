import React, { useState, useEffect, useRef } from 'react';
import { X, Key, Save, Check, AlertCircle, Eye, EyeOff, ExternalLink, FolderOpen } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    isFirstRun?: boolean;
}

interface ApiKeyField {
    provider: string;
    label: string;
    placeholder: string;
    helpUrl: string;
    required: boolean;
}

const API_KEY_FIELDS: ApiKeyField[] = [
    {
        provider: 'openrouter',
        label: 'OpenRouter API Key',
        placeholder: 'sk-or-v1-...',
        helpUrl: 'https://openrouter.ai/keys',
        required: true
    },
    {
        provider: 'artificialAnalysis',
        label: 'Artificial Analysis API Key (Optional)',
        placeholder: 'Your API key...',
        helpUrl: 'https://artificialanalysis.ai/account',
        required: false
    }
];

export function SettingsModal({ isOpen, onClose, isFirstRun = false }: SettingsModalProps) {
    const [keys, setKeys] = useState<Record<string, string>>({});
    const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [workspacePath, setWorkspacePath] = useState('');
    const [workspaceInput, setWorkspaceInput] = useState('');
    const [workspaceSaving, setWorkspaceSaving] = useState(false);
    const [workspaceSaved, setWorkspaceSaved] = useState(false);
    const [workspaceError, setWorkspaceError] = useState<string | null>(null);

    // Refs for cleanup
    const isMounted = useRef(true);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const workspaceSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
            if (workspaceSaveTimeoutRef.current) {
                clearTimeout(workspaceSaveTimeoutRef.current);
            }
        };
    }, []);

    // Load existing keys on mount
    useEffect(() => {
        if (isOpen) {
            loadKeys();
            loadWorkspace();
        }
    }, [isOpen]);

    const loadKeys = async () => {
        setLoading(true);
        setError(null);
        try {
            const loadedKeys: Record<string, string> = {};
            // Check once outside loop for efficiency
            if (window.electron?.getApiKey) {
                for (const field of API_KEY_FIELDS) {
                    const key = await window.electron.getApiKey(field.provider);
                    loadedKeys[field.provider] = key || '';
                }
            }
            if (isMounted.current) {
                setKeys(loadedKeys);
            }
        } catch (e) {
            console.error('Failed to load API keys:', e);
        }
        if (isMounted.current) {
            setLoading(false);
        }
    };

    const loadWorkspace = async () => {
        setWorkspaceError(null);
        setWorkspaceSaved(false);
        try {
            if (window.electron?.getWorkspacePath) {
                const path = await window.electron.getWorkspacePath();
                if (isMounted.current) {
                    setWorkspacePath(path || '');
                    setWorkspaceInput(path || '');
                }
            }
        } catch (e) {
            console.error('Failed to load workspace path:', e);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSaved(false);

        try {
            // Validate required keys
            const missingRequired = API_KEY_FIELDS
                .filter(f => f.required && !keys[f.provider]?.trim())
                .map(f => f.label);

            if (missingRequired.length > 0) {
                setError(`Please enter: ${missingRequired.join(', ')}`);
                setSaving(false);
                return;
            }

            // Save all keys
            for (const field of API_KEY_FIELDS) {
                const key = keys[field.provider]?.trim();
                if (key && window.electron?.setApiKey) {
                    await window.electron.setApiKey(field.provider, key);
                }
            }

            // Clear the API key cache in ai.ts
            const { clearApiKeyCache } = await import('../services/ai');
            clearApiKeyCache();

            if (isMounted.current) {
                setSaved(true);
                // Clear any existing timeout before setting new one
                if (saveTimeoutRef.current) {
                    clearTimeout(saveTimeoutRef.current);
                }
                saveTimeoutRef.current = setTimeout(() => {
                    if (isMounted.current) {
                        setSaved(false);
                        if (!isFirstRun) {
                            onClose();
                        }
                    }
                }, 1500);
            }
        } catch (e) {
            console.error('Failed to save API keys:', e);
            if (isMounted.current) {
                setError('Failed to save API keys. Please try again.');
            }
        }
        if (isMounted.current) {
            setSaving(false);
        }
    };

    const handleWorkspaceSave = async () => {
        const nextPath = workspaceInput.trim();
        setWorkspaceSaving(true);
        setWorkspaceError(null);
        setWorkspaceSaved(false);

        if (!nextPath) {
            setWorkspaceError('Workspace path is required');
            setWorkspaceSaving(false);
            return;
        }

        if (!window.electron?.setCustomWorkspace) {
            setWorkspaceError('Workspace settings are not available');
            setWorkspaceSaving(false);
            return;
        }

        try {
            const result = await window.electron.setCustomWorkspace(nextPath);
            if (!result?.success) {
                if (isMounted.current) {
                    setWorkspaceError(result?.error || 'Failed to update workspace path');
                    setWorkspaceSaving(false);
                }
                return;
            }

            if (window.electron?.getWorkspacePath) {
                const updatedPath = await window.electron.getWorkspacePath();
                if (isMounted.current) {
                    setWorkspacePath(updatedPath || nextPath);
                    setWorkspaceInput(updatedPath || nextPath);
                }
            } else {
                if (isMounted.current) {
                    setWorkspacePath(nextPath);
                }
            }

            if (isMounted.current) {
                setWorkspaceSaved(true);
                if (workspaceSaveTimeoutRef.current) {
                    clearTimeout(workspaceSaveTimeoutRef.current);
                }
                workspaceSaveTimeoutRef.current = setTimeout(() => {
                    if (isMounted.current) {
                        setWorkspaceSaved(false);
                    }
                }, 1500);
            }
        } catch (e) {
            console.error('Failed to update workspace path:', e);
            if (isMounted.current) {
                setWorkspaceError('Failed to update workspace path. Please try again.');
            }
        }

        if (isMounted.current) {
            setWorkspaceSaving(false);
        }
    };

    const handleKeyChange = (provider: string, value: string) => {
        setKeys(prev => ({ ...prev, [provider]: value }));
        setError(null);
        setSaved(false);
    };

    const handleWorkspaceInputChange = (value: string) => {
        setWorkspaceInput(value);
        setWorkspaceError(null);
        setWorkspaceSaved(false);
    };

    const toggleShowKey = (provider: string) => {
        setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
    };

    if (!isOpen) return null;

    const canClose = !isFirstRun || (keys['openrouter']?.trim());

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={canClose ? onClose : undefined}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border border-gray-200 dark:border-gray-700">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-indigo-500/10 to-purple-500/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                            <Key className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                {isFirstRun ? 'Welcome! Set Up Your API Keys' : 'Settings'}
                            </h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {isFirstRun
                                    ? 'Enter your API keys to get started'
                                    : 'Manage your API keys securely'}
                            </p>
                        </div>
                    </div>
                    {canClose && (
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="p-6 space-y-5">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
                        </div>
                    ) : (
                        <>
                            {API_KEY_FIELDS.map((field) => (
                                <div key={field.provider} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            {field.label}
                                            {field.required && <span className="text-red-500 ml-1">*</span>}
                                        </label>
                                        <a
                                            href={field.helpUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1"
                                        >
                                            Get API Key <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type={showKeys[field.provider] ? 'text' : 'password'}
                                            value={keys[field.provider] || ''}
                                            onChange={(e) => handleKeyChange(field.provider, e.target.value)}
                                            placeholder={field.placeholder}
                                            className="w-full px-4 py-2.5 pr-10 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => toggleShowKey(field.provider)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                        >
                                            {showKeys[field.provider] ? (
                                                <EyeOff className="w-4 h-4" />
                                            ) : (
                                                <Eye className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {/* Security Note */}
                            <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                <Key className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-green-700 dark:text-green-300">
                                    Your API keys are encrypted and stored securely using your operating system's credential manager.
                                </p>
                            </div>

                            <div className="border-t border-gray-200 dark:border-gray-700 pt-4" />

                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                                        <FolderOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Workspace Root</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Repositories are fixed to this root. Change only here.</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Current Root</label>
                                    <div className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 break-all">
                                        {workspacePath || 'Not set'}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">New Root Path</label>
                                    <input
                                        type="text"
                                        value={workspaceInput}
                                        onChange={(e) => handleWorkspaceInputChange(e.target.value)}
                                        placeholder="C:\\Path\\To\\Workspace"
                                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                    />
                                </div>
                                {workspaceError && (
                                    <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                        <p className="text-sm text-red-600 dark:text-red-400">{workspaceError}</p>
                                    </div>
                                )}
                                <div className="flex items-center justify-end gap-3">
                                    <button
                                        onClick={handleWorkspaceSave}
                                        disabled={workspaceSaving || !workspaceInput.trim() || workspaceInput.trim() === workspacePath}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${workspaceSaved
                                            ? 'bg-green-500 text-white'
                                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {workspaceSaving ? (
                                            <>
                                                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                                                Updating...
                                            </>
                                        ) : workspaceSaved ? (
                                            <>
                                                <Check className="w-4 h-4" />
                                                Updated
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4" />
                                                Set Root
                                            </>
                                        )}
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Changing the root may require reopening the repository to refresh the project list.
                                </p>
                            </div>

                            {/* Error Message */}
                            {error && (
                                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    {canClose && (
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={saving || loading}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${saved
                            ? 'bg-green-500 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {saving ? (
                            <>
                                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                                Saving...
                            </>
                        ) : saved ? (
                            <>
                                <Check className="w-4 h-4" />
                                Saved!
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Save API Keys
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
