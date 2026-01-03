import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Send } from 'lucide-react';
import { useAI } from '../contexts';

export function AIPromptPanel() {
    const { handleAIEdit } = useAI();
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

        setIsLoading(true);
        if (statusTimeoutRef.current) {
            clearTimeout(statusTimeoutRef.current);
            statusTimeoutRef.current = null;
        }

        try {
            await handleAIEdit(instruction);
            setInstruction('');
            setStatus({ type: 'success', message: 'Command processed successfully.' });
            // Auto-clear success message after 3 seconds
            statusTimeoutRef.current = setTimeout(() => {
                setStatus(null);
                statusTimeoutRef.current = null;
            }, 3000);
        } catch (err) {
            console.error('AI instruction failed:', err);
            setStatus({ type: 'error', message: 'Failed to process command. Please try again.' });
            // Auto-clear error message after 6 seconds (longer than success)
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

    return (
        <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--bg-panel)' }}>


            <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
                <div className="flex-1 relative flex flex-col">
                    <textarea
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isLoading}
                        placeholder="Describe an action you want to carry out on the text..."
                        className="flex-1 w-full p-4 pb-12 rounded-xl border-none shadow-sm focus:ring-2 focus:ring-indigo-500/50 text-sm text-gray-700 dark:text-slate-300 placeholder:text-gray-400 dark:placeholder:text-slate-500 resize-none outline-none transition-all disabled:opacity-50"
                        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}
                    />
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
                    <div className={`flex-none text-xs px-3 py-1.5 rounded-lg text-center transition-all ${status.type === 'success'
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
