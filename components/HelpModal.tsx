
import React from 'react';
import { X, Check, RotateCcw } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">How to use Diff & Commit</h3>
          <button 
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <section>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-200 uppercase tracking-wide mb-3">Understanding the Colors</h4>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="shrink-0 px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-b-2 border-green-500 dark:border-green-600 text-sm font-mono">Added Text</span>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  New content found in the revised version. <br/>
                  <span className="text-xs text-gray-500 dark:text-slate-500">Action: Click to <strong>Reject</strong> (remove it from final output).</span>
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="shrink-0 px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-b-2 border-red-500 dark:border-red-600 line-through decoration-red-500 text-sm font-mono">Removed</span>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Content deleted in the revised version. <br/>
                  <span className="text-xs text-gray-500 dark:text-slate-500">Action: Click to <strong>Restore</strong> (keep it in final output).</span>
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="shrink-0 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-500 border-dashed text-sm font-mono">Restored</span>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Content that was deleted but you chose to keep.<br/>
                  <span className="text-xs text-gray-500 dark:text-slate-500">This is the "Blue Highlight" significance.</span>
                </p>
              </div>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-200 uppercase tracking-wide mb-3">Smart Features</h4>
             <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg border border-indigo-100 dark:border-indigo-900">
                <h5 className="font-medium text-indigo-900 dark:text-indigo-200 text-sm mb-1">Single-Click Swapping</h5>
                <p className="text-sm text-indigo-800 dark:text-indigo-300">
                   When text is replaced (e.g. "old" → "new"), clicking either word will automatically swap between them. You don't need to click both segments individually.
                </p>
             </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-200 uppercase tracking-wide mb-3">Workflow</h4>
            <ul className="text-sm text-gray-600 dark:text-slate-400 space-y-2 list-disc pl-4">
              <li>Click segments in the <strong>Interactive Diff</strong> panel to toggle them.</li>
              <li>Use <strong>Undo/Redo</strong> buttons if you make a mistake.</li>
              <li>Edit the text directly in the <strong>Committed Preview</strong> panel to make final manual tweaks.</li>
              <li>Use <strong>AI Summary</strong> to get a changelog of your edits.</li>
            </ul>
          </section>
        </div>

        <div className="p-4 bg-gray-50 dark:bg-slate-950 border-t border-gray-100 dark:border-slate-800 flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
