
import React, { useState } from 'react';
import { TextCommit } from '../types';
import { Button } from './Button';
import { X, History, Clock, FileText, RotateCcw, GitCompare, Trash2 } from 'lucide-react';
import clsx from 'clsx';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    commits: TextCommit[];
    onRestore: (commit: TextCommit) => void;
    onCompare: (commit: TextCommit) => void;
    onDelete: (commitId: string) => void;
    onClearAll: () => void;
    currentOriginalText: string;
}

export const CommitHistoryModal: React.FC<Props> = ({
    isOpen,
    onClose,
    commits,
    onRestore,
    onCompare,
    onDelete,
    onClearAll,
    currentOriginalText,
}) => {
    const [selectedCommit, setSelectedCommit] = useState<TextCommit | null>(null);
    const [confirmClearAll, setConfirmClearAll] = useState(false);

    if (!isOpen) return null;

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getPreview = (content: string, maxLength: number = 100) => {
        const cleaned = content.replace(/\s+/g, ' ').trim();
        if (cleaned.length <= maxLength) return cleaned;
        return cleaned.substring(0, maxLength) + '...';
    };

    const handleClearAll = () => {
        if (confirmClearAll) {
            onClearAll();
            setConfirmClearAll(false);
        } else {
            setConfirmClearAll(true);
            // Auto-reset after 3 seconds
            setTimeout(() => setConfirmClearAll(false), 3000);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col border border-gray-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex-none p-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                        <History className="w-5 h-5 text-indigo-500" />
                        Commit History
                        {commits.length > 0 && (
                            <span className="text-sm font-normal text-gray-500 dark:text-slate-400">
                                ({commits.length} commit{commits.length !== 1 ? 's' : ''})
                            </span>
                        )}
                    </h2>
                    <div className="flex items-center gap-2">
                        {commits.length > 0 && (
                            <button
                                onClick={handleClearAll}
                                className={clsx(
                                    "text-xs px-2 py-1 rounded transition-colors",
                                    confirmClearAll
                                        ? "bg-red-500 text-white hover:bg-red-600"
                                        : "text-gray-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400"
                                )}
                            >
                                {confirmClearAll ? 'Click again to confirm' : 'Clear All'}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex">
                    {/* Commit List */}
                    <div className="w-1/2 border-r border-gray-200 dark:border-slate-800 overflow-y-auto">
                        {commits.length === 0 ? (
                            <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                                <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p className="font-medium">No commits yet</p>
                                <p className="text-sm mt-1">
                                    Click "Commit" after making changes to save commits here.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100 dark:divide-slate-800">
                                {/* Current commit indicator */}
                                <div className="p-3 bg-green-50 dark:bg-green-950/30 border-b border-green-100 dark:border-green-900/50">
                                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-medium">
                                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                        Current Working Draft
                                    </div>
                                    <p className="text-xs text-green-600 dark:text-green-500 mt-1 line-clamp-2">
                                        {currentOriginalText ? getPreview(currentOriginalText, 80) : '(empty)'}
                                    </p>
                                </div>

                                {/* Saved commits (newest first) */}
                                {[...commits].reverse().map((commit) => (
                                    <div
                                        key={commit.id}
                                        onClick={() => setSelectedCommit(commit)}
                                        className={clsx(
                                            "p-3 cursor-pointer transition-colors group",
                                            selectedCommit?.id === commit.id
                                                ? "bg-indigo-50 dark:bg-indigo-950/30"
                                                : "hover:bg-gray-50 dark:hover:bg-slate-800/50"
                                        )}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                                                    #{commit.commitNumber}
                                                </span>
                                                <span className="text-xs text-gray-400 dark:text-slate-500 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {formatDate(commit.timestamp)}
                                                </span>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDelete(commit.id);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-all p-1"
                                                title="Delete this commit"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-2">
                                            {getPreview(commit.content, 120)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Commit Preview */}
                    <div className="w-1/2 flex flex-col">
                        {selectedCommit ? (
                            <>
                                <div className="flex-none p-3 border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-medium text-gray-700 dark:text-slate-300 flex items-center gap-2">
                                            <FileText className="w-4 h-4" />
                                            Commit #{selectedCommit.commitNumber}
                                        </h3>
                                        <span className="text-xs text-gray-400 dark:text-slate-500">
                                            {formatDate(selectedCommit.timestamp)}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4">
                                    <pre className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                                        {selectedCommit.content}
                                    </pre>
                                </div>
                                <div className="flex-none p-3 border-t border-gray-200 dark:border-slate-800 flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            onCompare(selectedCommit);
                                            onClose();
                                        }}
                                        icon={<GitCompare className="w-4 h-4" />}
                                        className="flex-1"
                                    >
                                        Compare with Current
                                    </Button>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => {
                                            onRestore(selectedCommit);
                                            onClose();
                                        }}
                                        icon={<RotateCcw className="w-4 h-4" />}
                                        className="flex-1"
                                    >
                                        Restore This Commit
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-slate-500 p-8 text-center">
                                <div>
                                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                    <p>Select a commit to preview</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
