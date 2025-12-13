
import React, { useState, useEffect } from 'react';
import { X, Star, Trash2, RefreshCw, Download, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './Button';
import { AILogEntry } from '../types';

interface LogsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function LogsModal({ isOpen, onClose }: LogsModalProps) {
    const [logs, setLogs] = useState<AILogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const loadLogs = async () => {
        setIsLoading(true);
        if (window.electron && window.electron.getLogs) {
            const data = await window.electron.getLogs();
            setLogs(data);
        } else {
            // Fallback to localStorage for web/localhost testing
            try {
                const stored = localStorage.getItem('diff-commit-logs');
                if (stored) {
                    setLogs(JSON.parse(stored));
                }
            } catch (e) {
                console.warn('Failed to load logs from localStorage:', e);
            }
        }
        setIsLoading(false);
    };

    const clearLogs = async () => {
        if (confirm('Are you sure you want to clear all AI usage logs? This cannot be undone.')) {
            if (window.electron && window.electron.clearLogs) {
                await window.electron.clearLogs();
                setLogs([]);
            } else {
                // Fallback to localStorage for web/localhost testing
                localStorage.removeItem('diff-commit-logs');
                setLogs([]);
            }
        }
    };

    const exportLogs = () => {
        const csv = [
            ['Date', 'Time', 'Model', 'Task', 'Input Tokens', 'Output Tokens', 'Cost ($)', 'Rating', 'Feedback'].join(','),
            ...logs.map(log => [
                new Date(log.timestamp).toLocaleDateString(),
                new Date(log.timestamp).toLocaleTimeString(),
                log.modelName,
                log.taskType,
                log.inputTokens,
                log.outputTokens,
                log.cost.toFixed(6),
                log.rating || '',
                log.feedback ? `"${log.feedback.replace(/"/g, '""')}"` : ''
            ].join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-usage-logs-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    useEffect(() => {
        if (isOpen) {
            loadLogs();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const sortedLogs = [...logs].sort((a, b) => {
        return sortOrder === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp;
    });

    const totalCost = logs.reduce((sum, log) => sum + log.cost, 0);
    const totalInputTokens = logs.reduce((sum, log) => sum + log.inputTokens, 0);
    const totalOutputTokens = logs.reduce((sum, log) => sum + log.outputTokens, 0);
    const averageRating = logs.filter(l => l.rating).length > 0
        ? logs.filter(l => l.rating).reduce((sum, l) => sum + (l.rating || 0), 0) / logs.filter(l => l.rating).length
        : 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-4xl max-h-[85vh] m-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex-none px-6 py-4 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-950">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">AI Usage Logs</h2>
                        <p className="text-sm text-gray-500 dark:text-slate-400">
                            {logs.length} entries • Total: ${totalCost.toFixed(4)}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadLogs}
                            isLoading={isLoading}
                            icon={<RefreshCw className="w-4 h-4" />}
                        >
                            Refresh
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={exportLogs}
                            disabled={logs.length === 0}
                            icon={<Download className="w-4 h-4" />}
                        >
                            Export CSV
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearLogs}
                            disabled={logs.length === 0}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                            icon={<Trash2 className="w-4 h-4" />}
                        >
                            Clear All
                        </Button>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Stats Bar */}
                <div className="flex-none px-6 py-3 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/50 grid grid-cols-4 gap-4 text-center">
                    <div>
                        <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium uppercase">Total Cost</div>
                        <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300">${totalCost.toFixed(4)}</div>
                    </div>
                    <div>
                        <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium uppercase">Input Tokens</div>
                        <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300">{totalInputTokens.toLocaleString()}</div>
                    </div>
                    <div>
                        <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium uppercase">Output Tokens</div>
                        <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300">{totalOutputTokens.toLocaleString()}</div>
                    </div>
                    <div>
                        <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium uppercase">Avg. Rating</div>
                        <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300 flex items-center justify-center gap-1">
                            {averageRating > 0 ? (
                                <>
                                    {averageRating.toFixed(1)}
                                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                                </>
                            ) : (
                                <span className="text-gray-400 dark:text-slate-500">—</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Table Header */}
                <div className="flex-none px-6 py-2 bg-gray-100 dark:bg-slate-800 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase grid grid-cols-12 gap-2">
                    <button
                        className="col-span-2 flex items-center gap-1 hover:text-gray-900 dark:hover:text-slate-200 transition-colors"
                        onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                    >
                        Date/Time
                        {sortOrder === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                    </button>
                    <div className="col-span-3">Model</div>
                    <div className="col-span-1">Task</div>
                    <div className="col-span-2 text-right">Tokens</div>
                    <div className="col-span-2 text-right">Cost</div>
                    <div className="col-span-2 text-center">Rating</div>
                </div>

                {/* Logs List */}
                <div className="flex-1 overflow-y-auto">
                    {logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full py-12 text-gray-400 dark:text-slate-500">
                            <div className="text-5xl mb-4">📊</div>
                            <p className="text-lg font-medium">No logs yet</p>
                            <p className="text-sm">AI usage will appear here after you use AI Summary or AI Edit</p>
                        </div>
                    ) : (
                        sortedLogs.map((log) => (
                            <div key={log.id}>
                                <div
                                    className={clsx(
                                        "px-6 py-3 grid grid-cols-12 gap-2 items-center text-sm border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer",
                                        expandedId === log.id && "bg-indigo-50 dark:bg-indigo-950/20"
                                    )}
                                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                                >
                                    <div className="col-span-2 text-gray-600 dark:text-slate-400">
                                        <div>{new Date(log.timestamp).toLocaleDateString()}</div>
                                        <div className="text-xs text-gray-400 dark:text-slate-500">
                                            {new Date(log.timestamp).toLocaleTimeString()}
                                        </div>
                                    </div>
                                    <div className="col-span-3 text-gray-900 dark:text-slate-200 font-medium truncate" title={log.modelName}>
                                        {log.modelName}
                                    </div>
                                    <div className="col-span-1">
                                        <span className={clsx(
                                            "px-2 py-0.5 rounded text-xs font-medium truncate block",
                                            log.taskType === 'summary'
                                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                                : log.taskType.toLowerCase().includes('spelling')
                                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                                    : log.taskType.toLowerCase().includes('grammar')
                                                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                                        : log.taskType.toLowerCase().includes('fact')
                                                            ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400"
                                                            : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                                        )} title={log.taskType}>
                                            {log.taskType}
                                        </span>
                                    </div>
                                    <div className="col-span-2 text-right text-gray-600 dark:text-slate-400">
                                        <span className="text-green-600 dark:text-green-400">{log.inputTokens.toLocaleString()}</span>
                                        {' / '}
                                        <span className="text-blue-600 dark:text-blue-400">{log.outputTokens.toLocaleString()}</span>
                                    </div>
                                    <div className="col-span-2 text-right font-mono text-emerald-600 dark:text-emerald-400">
                                        ${log.cost.toFixed(6)}
                                    </div>
                                    <div className="col-span-2 flex justify-center items-center gap-0.5">
                                        {log.rating ? (
                                            [...Array(5)].map((_, i) => (
                                                <Star
                                                    key={i}
                                                    className={clsx(
                                                        "w-3.5 h-3.5",
                                                        i < log.rating!
                                                            ? "fill-amber-400 text-amber-400"
                                                            : "text-gray-300 dark:text-slate-600"
                                                    )}
                                                />
                                            ))
                                        ) : (
                                            <span className="text-xs text-gray-400 dark:text-slate-500">Not rated</span>
                                        )}
                                    </div>
                                </div>
                                {/* Expanded Details */}
                                {expandedId === log.id && log.feedback && (
                                    <div className="px-6 py-3 bg-gray-50 dark:bg-slate-800/30 border-b border-gray-100 dark:border-slate-800">
                                        <div className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Feedback:</div>
                                        <div className="text-sm text-gray-700 dark:text-slate-300 italic">"{log.feedback}"</div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
