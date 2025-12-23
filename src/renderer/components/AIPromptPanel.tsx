import React from 'react';
import { Sparkles } from 'lucide-react';

interface AIPromptPanelProps {
    topPanelHeight: number;
}

export function AIPromptPanel({
    topPanelHeight
}: AIPromptPanelProps) {
    return (
        <div className="flex flex-col min-h-0 overflow-hidden" style={{ height: `${100 - topPanelHeight}%`, backgroundColor: 'var(--bg-panel)' }}>
            <div
                className="flex-none h-12 p-4 flex justify-between items-center transition-colors duration-200"
                style={{ backgroundColor: 'var(--bg-header)', borderBottom: '1px solid var(--border-color)' }}
            >
                <h2 className="font-semibold text-gray-700 dark:text-slate-300 flex items-center gap-2 text-sm">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Prompt panel
                </h2>
            </div>
            <div className="flex-1 flex items-center justify-center bg-gray-50/30 dark:bg-slate-900/30 text-gray-400 dark:text-slate-500 text-sm italic">
                AI Prompt panel content will go here
            </div>
        </div>
    );
}
