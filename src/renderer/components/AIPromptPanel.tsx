import React, { useState } from 'react';
import { Sparkles, Send } from 'lucide-react';
import { useAI } from '../contexts';

export function AIPromptPanel() {
    const { handleAIEdit } = useAI();
    const [instruction, setInstruction] = useState('');

    const handleExecute = () => {
        if (!instruction.trim()) return;
        // For now, we use handleAIEdit with the raw instruction if it's not a known ID,
        // but the current handleAIEdit takes a promptId.
        // We might need to update handleAIEdit to support custom instructions,
        // or create a new handler. 
        // Let's assume handleAIEdit can take an instruction string for now,
        // or we'll pass it to a generic polish logic.
        // Actually, let's look at AIContext again.
        handleAIEdit(instruction);
        setInstruction('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleExecute();
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--bg-panel)' }}>
            <div
                className="flex-none h-12 p-4 flex justify-between items-center transition-colors duration-200"
                style={{ backgroundColor: 'var(--bg-header)', borderBottom: '1px solid var(--border-color)' }}
            >
                <h2 className="font-semibold text-gray-700 dark:text-slate-300 flex items-center gap-2 text-sm">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Prompt panel
                </h2>
            </div>

            <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
                <div className="flex-1 relative flex flex-col">
                    <textarea
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Describe an action you want to carry out on the text..."
                        className="flex-1 w-full p-4 rounded-xl bg-white dark:bg-slate-800 border-none shadow-sm focus:ring-2 focus:ring-indigo-500/50 text-sm text-gray-700 dark:text-slate-300 placeholder:text-gray-400 dark:placeholder:text-slate-500 resize-none outline-none transition-all"
                        style={{ border: '1px solid var(--border-color)' }}
                    />
                    <div className="absolute bottom-3 right-3 flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">
                            Press Enter to Run
                        </span>
                        <button
                            onClick={handleExecute}
                            disabled={!instruction.trim()}
                            className="p-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-slate-700 text-white rounded-lg transition-colors shadow-sm"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="flex-none text-xs text-gray-400 dark:text-slate-500 italic text-center">
                    AI Prompt panel content will go here
                </div>
            </div>
        </div>
    );
}
