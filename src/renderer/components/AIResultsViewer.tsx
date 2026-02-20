import React, { useEffect, useState } from 'react';
import { X, ClipboardCopy, FileSearch, CheckCircle2, Check, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

export interface AnalysisArtifactView {
    id: string;
    type: 'fact_check' | 'critical_review' | 'analysis';
    title: string;
    content: string;
    modelName?: string;
    createdAt: number;
}

interface AIResultsViewerProps {
    artifact: AnalysisArtifactView | null;
    onClose: () => void;
    onUseAsContext: () => void;
}

export function AIResultsViewer({ artifact, onClose, onUseAsContext }: AIResultsViewerProps) {
    const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
    useEffect(() => {
        if (!artifact) return;
        const onEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onEscape);
        return () => window.removeEventListener('keydown', onEscape);
    }, [artifact, onClose]);

    if (!artifact) return null;

    const createdAtLabel = new Date(artifact.createdAt).toLocaleString();

    return (
        <div
            className="absolute inset-0 z-10 flex flex-col"
            style={{ backgroundColor: 'var(--bg-panel)' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="analysis-viewer-header"
        >
            <div
                id="analysis-viewer-header"
                className="flex-none h-14 p-4 flex justify-between items-center transition-colors duration-200"
                style={{ backgroundColor: 'var(--bg-header)', borderBottom: '1px solid var(--border-color)' }}
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileSearch className="w-4 h-4 text-cyan-500 flex-shrink-0" />
                    <h2 className="font-semibold text-gray-700 dark:text-slate-300 truncate">
                        {artifact.title}
                    </h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors flex-shrink-0"
                    title="Close"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div
                className="flex-1 overflow-auto p-4"
                style={{ backgroundColor: 'var(--bg-muted)' }}
            >
                <div
                    className="max-w-4xl mx-auto rounded-xl border p-4"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                >
                    <div className="text-xs text-gray-500 dark:text-slate-400 mb-3 flex flex-wrap gap-3">
                        <span>{artifact.type}</span>
                        <span>{createdAtLabel}</span>
                        {artifact.modelName && <span>{artifact.modelName}</span>}
                    </div>
                    <pre className="whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-slate-200 font-sans">
                        {artifact.content}
                    </pre>
                </div>
            </div>

            <div
                className="flex-none p-3 flex justify-center gap-3 transition-colors duration-200"
                style={{ backgroundColor: 'var(--bg-muted)', borderTop: '1px solid var(--border-color)' }}
            >
                <button
                    onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(artifact.content);
                            setCopyStatus('success');
                        } catch (err) {
                            console.error('Failed to copy to clipboard:', err);
                            setCopyStatus('error');
                        }
                        setTimeout(() => setCopyStatus('idle'), 2000);
                    }}
                    className={clsx(
                        "flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors",
                        copyStatus === 'success' && "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
                        copyStatus === 'error' && "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
                        copyStatus === 'idle' && "bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-600"
                    )}
                >
                    {copyStatus === 'success' ? <Check className="w-4 h-4" /> : copyStatus === 'error' ? <AlertCircle className="w-4 h-4" /> : <ClipboardCopy className="w-4 h-4" />}
                    {copyStatus === 'success' ? 'Copied!' : copyStatus === 'error' ? 'Failed!' : 'Copy Report'}
                </button>
                <button
                    onClick={onUseAsContext}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
                >
                    <CheckCircle2 className="w-4 h-4" />
                    Use In Prompt Panel
                </button>
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                >
                    <X className="w-4 h-4" />
                    Close
                </button>
            </div>
        </div>
    );
}
