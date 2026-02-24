import React, { useState, useEffect, useRef } from 'react';
import { Send, FileSearch } from 'lucide-react';
import { useAI } from '../contexts';

const UNKNOWN_COMMAND_MESSAGE = 'Unknown slash command. Use /review, /critique, /analyze, /factcheck, /rewrite, /compress, /expand, or /edit.';
const PROMPT_STARTER_PILLS: Array<{ label: string; value: string }> = [
    { label: 'Review', value: '/review Focus on clarity, structure, and argument strength. Concentrate on use of metaphors.' },
    { label: 'Analyze', value: '/analyze Analyze the text for themes, assumptions, and rhetorical strategies. Focus on...' },
    { label: 'Fact-check', value: '/factcheck' },
    { label: 'Rewrite', value: '/rewrite Rewrite this text in a clearer, more concise style while preserving meaning.' },
    { label: 'Compress', value: '/compress Preserve key meaning and tone. Make it more compact.' },
    { label: 'Expand', value: '/expand Add helpful detail, examples, and transitions while preserving intent.' },
    { label: 'Compose', value: 'Compose a five-stanza poem about chipmunks with vivid imagery and a playful tone.' },
    { label: 'Edit', value: "/edit Improve flow, rhythm, and readability. Keep the author's voice." },
];

export function AIPromptPanel() {
    const {
        handleFactCheck,
        handlePromptPanelInstruction,
        handleAnalysisInstruction,
        latestAnalysisArtifact,
        promptPanelUseAnalysisContext,
        setPromptPanelUseAnalysisContext,
        openLatestAnalysisViewer
    } = useAI();
    const [instruction, setInstruction] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (statusTimeoutRef.current) {
                clearTimeout(statusTimeoutRef.current);
            }
        };
    }, []);

    const handleExecute = async () => {
        if (!instruction.trim() || isLoading) return;
        const raw = instruction.trim();
        const match = raw.match(/^\/([a-z-]+)(?:\s+([\s\S]*))?$/i);

        setIsLoading(true);
        if (statusTimeoutRef.current) {
            clearTimeout(statusTimeoutRef.current);
            statusTimeoutRef.current = null;
        }

        try {
            if (match) {
                const cmd = match[1].toLowerCase();
                const args = (match[2] || '').trim();

                if (cmd === 'factcheck') {
                    await handleFactCheck();
                } else if (cmd === 'review' || cmd === 'critique' || cmd === 'analyze') {
                    const reviewInstruction = args || 'Provide a critical review of this text. Identify weaknesses, unclear claims, unsupported assertions, structure issues, and actionable improvements.';
                    const type = (cmd === 'review' || cmd === 'critique') ? 'critical_review' : 'analysis';
                    const title = cmd === 'analyze' ? 'Analysis' : 'Critical Review';
                    await handleAnalysisInstruction(reviewInstruction, title, type);
                } else if (cmd === 'rewrite' || cmd === 'compress' || cmd === 'expand' || cmd === 'edit') {
                    const mappedInstruction =
                        cmd === 'compress'
                            ? `Compress the text while preserving key meaning and tone. ${args}`.trim()
                            : cmd === 'expand'
                                ? `Expand the text with additional useful detail while preserving author intent. ${args}`.trim()
                                : args || 'Edit the text according to best writing practices.';
                    await handlePromptPanelInstruction(mappedInstruction, promptPanelUseAnalysisContext);
                } else {
                    setStatus({
                        type: 'error',
                        message: UNKNOWN_COMMAND_MESSAGE
                    });
                    statusTimeoutRef.current = setTimeout(() => {
                        setStatus(null);
                        statusTimeoutRef.current = null;
                    }, 6000);
                    return;
                }
            } else {
                await handlePromptPanelInstruction(raw, promptPanelUseAnalysisContext);
            }
            setInstruction('');
            setStatus({ type: 'success', message: 'Command processed successfully.' });
            statusTimeoutRef.current = setTimeout(() => {
                setStatus(null);
                statusTimeoutRef.current = null;
            }, 3000);
        } catch (err) {
            console.error('AI instruction failed:', err);
            setStatus({ type: 'error', message: 'Failed to process command. Please try again.' });
            statusTimeoutRef.current = setTimeout(() => {
                setStatus(null);
                statusTimeoutRef.current = null;
            }, 6000);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleExecute();
        }
    };

    const applyStarter = (starter: string) => {
        setInstruction((prev) => {
            const trimmed = prev.trim();
            if (!trimmed) return starter;
            if (trimmed === starter) return prev;
            return `${prev.trimEnd()}\n${starter}`;
        });
    };

    return (
        <div data-prompt-panel className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--bg-panel)' }}>
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-muted)' }}>
                <div className="flex-1 m-4 relative flex flex-col rounded-xl shadow-sm overflow-hidden transition-colors duration-200" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
                    <div className="flex flex-wrap gap-2 px-3 pt-3 pb-1 border-b border-gray-100 dark:border-slate-800">
                        {PROMPT_STARTER_PILLS.map((pill) => (
                            <button
                                key={pill.label}
                                type="button"
                                onClick={() => applyStarter(pill.value)}
                                disabled={isLoading}
                                className="px-2.5 py-1 text-[11px] rounded-full border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                                title={`Insert starter for ${pill.label}`}
                            >
                                {pill.label}
                            </button>
                        ))}
                    </div>
                    <textarea
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isLoading}
                        placeholder="Use slash commands (/review, /factcheck, /compress) or enter a plain edit instruction."
                        className="flex-1 w-full p-4 pb-14 focus:ring-2 focus:ring-indigo-500/50 text-sm text-gray-700 dark:text-slate-300 placeholder:text-gray-400 dark:placeholder:text-slate-500 resize-none outline-none border-none bg-transparent transition-all disabled:opacity-50"
                    />
                    <div className="absolute left-3 bottom-3 flex items-center gap-2">
                        <label className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-slate-400">
                            <input
                                type="checkbox"
                                checked={promptPanelUseAnalysisContext}
                                onChange={(e) => setPromptPanelUseAnalysisContext(e.target.checked)}
                                disabled={!latestAnalysisArtifact}
                                className="rounded border-gray-300 dark:border-gray-600 text-cyan-600 focus:ring-cyan-500"
                            />
                            Use latest analysis context
                        </label>
                        {latestAnalysisArtifact && (
                            <button
                                type="button"
                                onClick={openLatestAnalysisViewer}
                                className="text-[10px] px-2 py-1 rounded border border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 flex items-center gap-1"
                                title="Open latest analysis report"
                            >
                                <FileSearch className="w-3 h-3" />
                                View
                            </button>
                        )}
                    </div>
                    <div className="absolute bottom-3 right-3 flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">
                            Press Enter to Run
                        </span>
                        <button
                            onClick={handleExecute}
                            disabled={!instruction.trim() || isLoading}
                            className="p-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-slate-700 text-white rounded-lg transition-colors shadow-sm flex items-center justify-center min-w-[28px] min-h-[28px]"
                        >
                            {isLoading ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Send className="w-4 h-4" />
                            )}
                        </button>
                    </div>
                </div>

                {status && (
                    <div className={`flex-none mx-4 mb-4 text-xs px-3 py-1.5 rounded-lg text-center transition-all ${status.type === 'success'
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                        : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
                        }`}>
                        {status.message}
                    </div>
                )}
            </div>
        </div>
    );
}
