import React, { useState, useEffect, useRef } from 'react';
import { FolderOpen, FolderPlus, FileText, GitBranch, Check } from 'lucide-react';
import { Button } from './Button';

const SKIP_WELCOME_KEY = 'skip_welcome_screen';
const LAST_REPO_KEY = 'last_repository_path';

interface WelcomeModalProps {
    isOpen: boolean;
    onCreateRepository: () => Promise<void>;
    onOpenRepository: () => Promise<void>;
    isLoading?: boolean;
}

export function WelcomeModal({
    isOpen,
    onCreateRepository,
    onOpenRepository,
    isLoading = false,
}: WelcomeModalProps) {
    // Initialize checkbox state from localStorage
    const [rememberChoice, setRememberChoice] = useState(() => {
        return localStorage.getItem(SKIP_WELCOME_KEY) === 'true';
    });

    // Track if we've already attempted auto-open (prevent repeated triggers)
    const hasAttemptedAutoOpen = useRef(false);
    // Use ref for callback to avoid dependency array issues
    const onOpenRepositoryRef = useRef(onOpenRepository);
    onOpenRepositoryRef.current = onOpenRepository;

    // Check auto-open conditions once (avoid re-reading localStorage in effect)
    const lastRepoPath = localStorage.getItem(LAST_REPO_KEY);
    const shouldAutoOpen = rememberChoice && !!lastRepoPath;

    // Auto-open last repository on mount (only once)
    useEffect(() => {
        if (shouldAutoOpen && isOpen && !hasAttemptedAutoOpen.current) {
            hasAttemptedAutoOpen.current = true;
            onOpenRepositoryRef.current();
        }
    }, [shouldAutoOpen, isOpen]);

    // Save checkbox state immediately when changed
    const handleRememberChange = (checked: boolean) => {
        setRememberChoice(checked);
        if (checked) {
            localStorage.setItem(SKIP_WELCOME_KEY, 'true');
        } else {
            localStorage.removeItem(SKIP_WELCOME_KEY);
        }
    };

    // Wrapper to save preference after successful action
    const handleActionWithRemember = async (action: () => Promise<void>) => {
        // rememberChoice state is already saved via handleRememberChange
        await action();
    };

    // Prevent modal flash: don't render if auto-open is happening
    if (!isOpen || (shouldAutoOpen && !hasAttemptedAutoOpen.current)) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop - no onClick to close, user must choose an action */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Modal */}
            <div className="relative w-full max-w-md m-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-8 pt-8 pb-4 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                        <GitBranch className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">
                        Welcome to Diff-Commit
                    </h1>
                    <p className="text-gray-600 dark:text-slate-400 text-sm">
                        To get started, you need to select where your projects will be stored.
                    </p>
                </div>

                {/* Explanation */}
                <div className="px-8 py-4">
                    <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-xl p-4 mb-6">
                        <h3 className="font-semibold text-indigo-900 dark:text-indigo-200 mb-2 flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            What is a Repository?
                        </h3>
                        <p className="text-sm text-indigo-800 dark:text-indigo-300">
                            A <strong>repository</strong> is a folder on your computer where your writing projects
                            and their version history are stored. Each project is a document (like an essay,
                            article, or notes) that you can edit and track changes over time.
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="px-8 pb-4 space-y-3">
                    <Button
                        variant="primary"
                        size="lg"
                        className="w-full justify-center py-3"
                        onClick={() => handleActionWithRemember(onCreateRepository)}
                        disabled={isLoading}
                        icon={<FolderPlus className="w-5 h-5" />}
                    >
                        Create New Repository
                    </Button>
                    <p className="text-xs text-center text-gray-500 dark:text-slate-500 -mt-1 mb-2">
                        Choose a location and name for a new folder to store your projects
                    </p>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-200 dark:border-slate-700" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white dark:bg-slate-900 px-2 text-gray-400 dark:text-slate-500">
                                or
                            </span>
                        </div>
                    </div>

                    <Button
                        variant="secondary"
                        size="lg"
                        className="w-full justify-center py-3"
                        onClick={() => handleActionWithRemember(onOpenRepository)}
                        disabled={isLoading}
                        icon={<FolderOpen className="w-5 h-5" />}
                    >
                        Open Existing Repository
                    </Button>
                    <p className="text-xs text-center text-gray-500 dark:text-slate-500 -mt-1">
                        Select an existing folder that contains your projects
                    </p>
                </div>

                {/* Remember Choice Checkbox */}
                <div className="px-8 pb-6">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <button
                            type="button"
                            onClick={() => handleRememberChange(!rememberChoice)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${rememberChoice
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'border-gray-300 dark:border-slate-600 group-hover:border-indigo-400'
                                }`}
                        >
                            {rememberChoice && <Check className="w-3 h-3" />}
                        </button>
                        <span className="text-sm text-gray-600 dark:text-slate-400">
                            Skip this screen in the future
                        </span>
                    </label>
                    {rememberChoice && (
                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-2 ml-8">
                            The app will automatically open your last repository next time.
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-4 bg-gray-50 dark:bg-slate-950 border-t border-gray-200 dark:border-slate-800">
                    <p className="text-xs text-center text-gray-400 dark:text-slate-500">
                        Your work is always saved locally on your computer.
                    </p>
                </div>
            </div>
        </div>
    );
}
