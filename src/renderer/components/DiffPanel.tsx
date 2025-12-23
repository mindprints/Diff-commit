import React from 'react';
import { FileText } from 'lucide-react';
import clsx from 'clsx';
import { DiffSegment as DiffSegmentComponent } from './DiffSegment';
import { DiffSegment, FontFamily } from '../types';
import { FontSize, fontClasses, sizeClasses } from '../constants/ui';

import { useUI, useProject, useEditor } from '../contexts';

export function DiffPanel() {
    const { leftPanelWidth } = useUI();
    const {
        handleAcceptAll, handleRejectAll,
        leftContainerRef, handleScrollSync,
        fontFamily, fontSize,
        segments, toggleSegment, originalText
    } = useEditor();
    return (
        <div
            className="flex flex-col h-full overflow-hidden"
            style={{ width: `${100 - leftPanelWidth}%`, backgroundColor: 'var(--bg-panel)' }}
        >
            <div id="panel-diff-header" className="flex-none h-14 p-4 flex justify-between items-center transition-colors duration-200" style={{ backgroundColor: 'var(--bg-header)', borderBottom: '1px solid var(--border-color)' }}>
                <h2 className="font-semibold text-gray-700 dark:text-slate-300 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Diff View
                </h2>
                <div className="flex gap-2 text-xs">
                    <button type="button" onClick={handleAcceptAll} className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded hover:bg-green-100 dark:hover:bg-green-900/40 border border-green-200 dark:border-green-800/50 transition">Accept All</button>
                    <button type="button" onClick={handleRejectAll} className="px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800/50 transition">Reject All</button>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-muted)' }}>
                <div
                    ref={leftContainerRef}
                    onScroll={() => handleScrollSync('left')}
                    className={clsx(
                        "flex-1 overflow-y-auto p-8 text-gray-800 dark:text-slate-200 m-4 rounded-xl shadow-sm transition-colors duration-200 whitespace-pre-wrap",
                        fontClasses[fontFamily],
                        sizeClasses[fontSize]
                    )}
                    style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}
                >
                    {segments.length > 0 ? (
                        segments.map((seg) => (
                            <DiffSegmentComponent key={seg.id} segment={seg} onClick={toggleSegment} />
                        ))
                    ) : (
                        // No segments - show placeholder or originalText
                        <span className="text-gray-600 dark:text-slate-400">{originalText || 'Edit text in the Editor, then use AI Edit or Compare to see changes here.'}</span>
                    )}
                </div>
            </div>

            <div className="p-3 text-xs text-gray-500 dark:text-slate-400 text-center flex justify-center gap-4 transition-colors duration-200" style={{ backgroundColor: 'var(--bg-muted)', borderTop: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-green-100 dark:bg-green-900/50 border border-green-500 dark:border-green-500/50 rounded-sm"></span>
                    <span>Added</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-red-100 dark:bg-red-900/50 border border-red-500 dark:border-red-500/50 rounded-sm"></span>
                    <span>Removed</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-400 dark:border-blue-500/50 border-dashed rounded-sm"></span>
                    <span>Restored</span>
                </div>
            </div>
        </div>
    );
}
