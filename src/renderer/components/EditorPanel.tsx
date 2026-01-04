import React from 'react';
import { Edit3, Volume2, Square, Wand2, X, Shield, Settings, RefreshCw, Zap, GitBranch, PanelBottomClose, PanelBottomOpen, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './Button';
import MultiSelectTextArea, { MultiSelectTextAreaRef } from './MultiSelectTextArea';
import { AIPrompt, TextCommit, PolishMode, FontFamily } from '../types';
import { PendingOperation } from '../hooks/useAsyncAI';
import { FontSize, fontClasses, sizeClasses } from '../constants/ui';

import { useUI, useProject, useAI, useEditor } from '../contexts';
import { useState, useEffect, useCallback } from 'react';

export function EditorPanel() {
    const {
        isSpeaking, setIsSpeaking,
        setShowPromptsModal, isShiftHeld, setShowProjectsPanel,
        isPromptPanelVisible, setIsPromptPanelVisible
    } = useUI();

    const {
        handleCommitClick, hasUnsavedChanges, commits, repositoryPath
    } = useProject();

    const {
        isPolishing, isFactChecking, cancelAIOperation,
        factCheckProgress, builtInPrompts, customPrompts,
        activePromptId, setActivePromptId, activePrompt,
        handleAIEdit, handleFactCheck, handleReadAloud,
        pendingOperations, handleQuickSend
    } = useAI();

    const {
        previewText, setPreviewText, originalText, setOriginalText, setModifiedText,
        performDiff, isAutoCompareEnabled, setIsAutoCompareEnabled,
        previewTextareaRef, fontFamily, fontSize,
        handleOpenContextMenu, handleScrollSync, skipNextSegmentsSync,
        frozenSelection, setFrozenSelection
    } = useEditor();

    const [isPolishMenuOpen, setIsPolishMenuOpen] = useState(false);
    const [justSaved, setJustSaved] = useState(false);

    // Wrap handleCommitClick to add blue flash animation on successful save
    const handleCommitWithFlash = useCallback(async (e: React.MouseEvent<HTMLButtonElement>) => {
        const shiftPressed = e?.shiftKey;
        if (shiftPressed) {
            try {
                await handleCommitClick(e);
                // Only flash on successful commit
                setJustSaved(true);
                setTimeout(() => setJustSaved(false), 600);
            } catch (error) {
                // Don't flash on error - error handling is done by handleCommitClick
                console.error('Commit failed:', error);
            }
        } else {
            handleCommitClick(e);
        }
    }, [handleCommitClick]);
    return (
        <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--bg-panel)' }}>
            <div
                id="panel-editor-header"
                className="flex-none h-14 p-4 flex justify-between items-center relative transition-colors duration-200"
                style={{ backgroundColor: 'var(--bg-header)', borderBottom: '1px solid var(--border-color)' }}
            >
                <h2 className="font-semibold text-gray-700 dark:text-slate-300 flex items-center gap-2">
                    <Edit3 className="w-4 h-4" />
                    Editor
                </h2>
                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleReadAloud}
                        className={clsx("text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20", isSpeaking && "bg-indigo-100 dark:bg-indigo-900/40")}
                        title={isSpeaking ? "Stop Speaking" : "Read Aloud (Select text to read section)"}
                        icon={isSpeaking ? <Square className="w-3 h-3 fill-current" /> : <Volume2 className="w-4 h-4" />}
                    >
                        {isSpeaking ? "Stop" : "Read"}
                    </Button>
                    <div className="w-px h-6 bg-gray-200 dark:bg-slate-700 mx-1"></div>

                    <div className="relative flex items-center gap-1">
                        {isPolishMenuOpen && (
                            <div className="fixed inset-0 z-10" onClick={() => setIsPolishMenuOpen(false)}></div>
                        )}
                        {/* Wand Button Removed - Dropdown now acts as Selector, Ctrl+Click or Panel executes */}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsPolishMenuOpen(!isPolishMenuOpen)}
                            disabled={isPolishing || isFactChecking}
                            className={clsx(
                                "gap-2 min-w-[8rem] justify-between", // Ensure width and spacing
                                isPolishMenuOpen && "bg-gray-50 dark:bg-slate-800 ring-2 ring-indigo-100 dark:ring-slate-700"
                            )}
                        >
                            <span className="truncate max-w-[120px]">
                                {isFactChecking ? 'Checking...' : (activePrompt?.name || 'Select Prompt')}
                            </span>
                            <svg className="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </Button>
                        {(isPolishing || isFactChecking) && (
                            <button
                                onClick={cancelAIOperation}
                                className="p-1.5 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                title="Cancel AI Operation"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                        {isFactChecking && factCheckProgress && (
                            <span className="text-xs text-gray-500 dark:text-slate-400 max-w-32 truncate">
                                {factCheckProgress}
                            </span>
                        )}

                        {isPolishMenuOpen && (
                            <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-100 dark:border-slate-700 py-1 z-20 animate-in fade-in zoom-in-95 duration-100 overflow-hidden max-h-[70vh] overflow-y-auto">
                                {/* Built-in Prompts */}
                                <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider bg-gray-50/50 dark:bg-slate-900/50 border-b border-gray-50 dark:border-slate-700">
                                    Correction Level
                                </div>
                                {builtInPrompts.map(prompt => (
                                    <button
                                        key={prompt.id}
                                        onClick={() => { setActivePromptId(prompt.id); setIsPolishMenuOpen(false); }}
                                        className={clsx(
                                            "w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2",
                                            activePromptId === prompt.id
                                                ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium"
                                                : "text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                                        )}
                                    >
                                        <span className={clsx("w-1.5 h-1.5 rounded-full", prompt.color || 'bg-gray-400')} />
                                        {prompt.name}
                                    </button>
                                ))}

                                {customPrompts.length > 0 && (
                                    <>
                                        <div className="border-t border-gray-100 dark:border-slate-700 my-1" />
                                        <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider bg-gray-50/50 dark:bg-slate-900/50">
                                            Custom Prompts
                                        </div>
                                        {customPrompts.map(prompt => (
                                            <button
                                                key={prompt.id}
                                                onClick={() => { setActivePromptId(prompt.id); setIsPolishMenuOpen(false); }}
                                                className={clsx(
                                                    "w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2",
                                                    activePromptId === prompt.id
                                                        ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium"
                                                        : "text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                                                )}
                                            >
                                                <span className={clsx("w-1.5 h-1.5 rounded-full", prompt.color || 'bg-gray-400')} />
                                                {prompt.name}
                                            </button>
                                        ))}
                                    </>
                                )}

                                {/* Verification Section */}
                                <div className="border-t border-gray-100 dark:border-slate-700 my-1" />
                                <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider bg-gray-50/50 dark:bg-slate-900/50">
                                    Verification
                                </div>
                                <button
                                    onClick={() => {
                                        handleFactCheck();
                                        setIsPolishMenuOpen(false);
                                    }}
                                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 hover:text-cyan-700 dark:hover:text-cyan-400 transition-colors flex items-center gap-2"
                                >
                                    <Shield className="w-4 h-4 text-cyan-500" />
                                    Fact Check
                                    <span className="ml-auto text-xs text-gray-400 dark:text-slate-500">$$$$</span>
                                </button>

                                {/* Manage Prompts */}
                                <div className="border-t border-gray-100 dark:border-slate-700 my-1" />
                                <button
                                    onClick={() => { setIsPolishMenuOpen(false); setShowPromptsModal(true); }}
                                    className="w-full text-left px-4 py-2.5 text-sm text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700/50 hover:text-gray-700 dark:hover:text-slate-300 transition-colors flex items-center gap-2"
                                >
                                    <Settings className="w-4 h-4" />
                                    Manage Prompts...
                                </button>
                            </div>
                        )}
                    </div>

                    <Button
                        variant="outline"
                        onClick={() => {
                            // Manual Diff Trigger: Compare current Editor (preview) against Original
                            setModifiedText(previewText);
                            performDiff(originalText, previewText);
                            // Do NOT setOriginalText(previewText) - that resets the baseline.
                        }}
                        size="sm"
                        icon={<ArrowRight className="w-4 h-4" />}
                        title="Sync Editor to Diff View (Manual Compare)"
                        disabled={isAutoCompareEnabled}
                        className={clsx(isAutoCompareEnabled && "opacity-50")}
                    >
                        {/* No text, just icon as requested */}
                    </Button>

                    <button
                        onClick={() => setIsAutoCompareEnabled((prev: boolean) => !prev)}
                        className={clsx(
                            "p-1.5 rounded transition-all",
                            isAutoCompareEnabled
                                ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 ring-1 ring-amber-300 dark:ring-amber-700"
                                : "text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
                        )}
                        title={isAutoCompareEnabled ? "Auto-compare ON: Diffs update as you type" : "Auto-compare OFF: Click Compare to see changes"}
                    >
                        <Zap className={clsx("w-4 h-4", isAutoCompareEnabled && "fill-current")} />
                    </button>

                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleCommitWithFlash}
                        disabled={!previewText.trim()}
                        className={clsx(
                            "relative transition-all min-w-[6rem]",
                            justSaved
                                ? "bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500 animate-pulse"
                                : hasUnsavedChanges
                                    ? "bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500"
                                    : "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                        )}
                        icon={<GitBranch className="w-3 h-3" />}
                        title={isShiftHeld
                            ? "Save to commit history"
                            : "Accept changes (Shift+Click to save to history)"
                        }
                    >
                        {isShiftHeld ? 'Save Commit' : 'Commit'}
                        {commits.length > 0 && !isShiftHeld && (
                            <span className="ml-1.5 px-1.5 py-0.5 bg-white/20 rounded-full text-[10px] font-bold">
                                {commits.length}
                            </span>
                        )}
                    </Button>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-muted)' }}>
                <div className="flex-1 m-4 rounded-xl shadow-sm overflow-hidden relative transition-colors duration-200" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
                    <MultiSelectTextArea
                        ref={previewTextareaRef}
                        value={previewText}
                        pendingOperations={pendingOperations}
                        onChange={(newValue) => {
                            if (isSpeaking) {
                                window.speechSynthesis.cancel();
                                setIsSpeaking(false);
                            }
                            setPreviewText(newValue);
                        }}
                        onClick={(e) => {
                            if (e.ctrlKey) {
                                e.preventDefault();
                                handleQuickSend();
                            }
                        }}
                        className={clsx(
                            "flex-1 w-full resize-none bg-transparent border-none focus:ring-0 text-gray-800 dark:text-slate-200 transition-colors outline-none overflow-y-auto",
                            fontClasses[fontFamily],
                            sizeClasses[fontSize]
                        )}
                        fontClassName={fontClasses[fontFamily]}
                        sizeClassName={sizeClasses[fontSize]}
                        spellCheck={false}
                        placeholder="Type or paste your text here. Use AI Edit to polish it."
                        onContextMenu={(e) => handleOpenContextMenu(e, previewText)}
                        onScroll={() => handleScrollSync('right')}
                        frozenSelection={frozenSelection}
                        onFocus={() => {
                            // Clear frozen selection when editor is focused
                            setFrozenSelection(null);
                        }}
                        onBlur={(e) => {
                            // If focus is moving out of the editor, potentially "freeze" the selection
                            // We only do this if there's an actual selection
                            const textarea = e.currentTarget;
                            const start = textarea.selectionStart;
                            const end = textarea.selectionEnd;

                            if (start !== end) {
                                setFrozenSelection({
                                    start,
                                    end,
                                    text: textarea.value.substring(start, end)
                                });
                            }
                        }}
                    />
                </div>
            </div>

            <div className="p-3 text-xs text-gray-500 dark:text-slate-400 flex items-center justify-between transition-colors duration-200" style={{ backgroundColor: 'var(--bg-muted)', borderTop: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-4 flex-1 justify-center">
                    <span className="flex items-center gap-1.5" title="Word Count">
                        <span className="w-2.5 h-2.5 bg-indigo-200 dark:bg-indigo-500/50 border border-indigo-400 dark:border-indigo-400/50 rounded-sm"></span>
                        <span>Words: {previewText.trim() ? previewText.trim().split(/\s+/).length : 0}</span>
                    </span>
                </div>

                <button
                    onClick={() => setIsPromptPanelVisible(!isPromptPanelVisible)}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded transition-colors text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
                    title={isPromptPanelVisible ? "Hide Prompt Panel" : "Show Prompt Panel"}
                >
                    {isPromptPanelVisible ? <PanelBottomClose className="w-4 h-4" /> : <PanelBottomOpen className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}
