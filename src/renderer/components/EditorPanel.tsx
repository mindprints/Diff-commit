import React from 'react';
import { Edit3, Volume2, Square, Zap, GitBranch, PanelBottomClose, PanelBottomOpen, ArrowRight, X, Save, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './Button';
import { PromptDropdownButton } from './PromptDropdownButton';
import MultiSelectTextArea from './MultiSelectTextArea';
import { fontClasses, sizeClasses } from '../constants/ui';
import { getFactCheckSearchMode } from '../services/openRouterSearch';
import { AIPrompt } from '../types';

import { useUI, useProject, useAI, useEditor } from '../contexts';
import { useState, useEffect, useCallback } from 'react';

// Stash structure: saved editor content during prompt editing
interface PromptEditSession {
    prompt: AIPrompt;              // The prompt being edited
    stashedContent: string;        // Editor content before prompt editing began
    stashedOriginalText: string;   // Original text baseline before prompt editing
}

// Separator used to delimit prompt sections in the editor
const SECTION_SEPARATOR = '\n\n════════════════════════════════\n\n';

function formatPromptForEditor(prompt: AIPrompt): string {
    return `SYSTEM INSTRUCTION:\n${prompt.systemInstruction}${SECTION_SEPARATOR}TASK:\n${prompt.promptTask}`;
}

function parsePromptFromEditor(text: string): { systemInstruction: string; promptTask: string } | null {
    // Try to split by the separator
    const parts = text.split('════════════════════════════════');
    if (parts.length < 2) return null;

    const sysBlock = parts[0].trim();
    const taskBlock = parts[1].trim();

    // Strip the "SYSTEM INSTRUCTION:" prefix
    const sysMatch = sysBlock.replace(/^SYSTEM INSTRUCTION:\s*/i, '').trim();
    // Strip the "TASK:" prefix
    const taskMatch = taskBlock.replace(/^TASK:\s*/i, '').trim();

    if (!sysMatch || !taskMatch) return null;
    return { systemInstruction: sysMatch, promptTask: taskMatch };
}

export function EditorPanel() {
    const {
        isSpeaking, setIsSpeaking,
        setShowPromptsModal, isShiftHeld,
        isPromptPanelVisible, setIsPromptPanelVisible
    } = useUI();

    const {
        handleCommitClick, hasUnsavedChanges, commits
    } = useProject();

    const {
        isPolishing, isFactChecking, cancelAIOperation,
        factCheckProgress, activePrompt, aiPrompts,
        handleReadAloud, updatePrompt,
        pendingOperations, handleQuickSend,
        isGeneratingImage, setActivePromptId
    } = useAI();

    const {
        previewText, setPreviewText, originalText, setOriginalText, setModifiedText,
        performDiff, isAutoCompareEnabled, setIsAutoCompareEnabled,
        previewTextareaRef, fontFamily, fontSize,
        handleOpenContextMenu, handleScrollSync,
        frozenSelection, setFrozenSelection, resetDiffState
    } = useEditor();

    const [justSaved, setJustSaved] = useState(false);
    const [promptEditSession, setPromptEditSession] = useState<PromptEditSession | null>(null);
    const [promptSaving, setPromptSaving] = useState(false);
    const factCheckSearchMode = getFactCheckSearchMode();
    const hasPendingAsyncOperations = pendingOperations.some((op) => op.status === 'pending');

    // Listen for the custom event dispatched when "Edit in Editor" is triggered
    useEffect(() => {
        const handleLoadPrompt = async (e: Event) => {
            const detail = (e as CustomEvent).detail as { prompt: AIPrompt; content: string };
            if (!detail?.prompt) return;

            // Step 1: If there's unsaved content, auto-commit it first
            if (hasUnsavedChanges && previewText.trim()) {
                try {
                    await handleCommitClick({ shiftKey: true } as React.MouseEvent);
                } catch (err) {
                    console.error('Auto-commit before prompt edit failed:', err);
                }
            }

            // Step 2: Stash current editor content
            const session: PromptEditSession = {
                prompt: detail.prompt,
                stashedContent: previewText,
                stashedOriginalText: originalText,
            };

            // Step 3: Load prompt content into editor
            const formattedContent = formatPromptForEditor(detail.prompt);
            setPreviewText(formattedContent);
            setOriginalText(formattedContent);
            setModifiedText('');
            resetDiffState();

            // Step 4: Enter prompt editing mode
            setPromptEditSession(session);
        };

        window.addEventListener('load-prompt-to-editor', handleLoadPrompt);
        return () => window.removeEventListener('load-prompt-to-editor', handleLoadPrompt);
    }, [hasUnsavedChanges, previewText, originalText, handleCommitClick, setPreviewText, setOriginalText, setModifiedText, resetDiffState]);

    // Save prompt edits and restore stashed content
    const handleSavePromptEdit = useCallback(async () => {
        if (!promptEditSession) return;

        const parsed = parsePromptFromEditor(previewText);
        if (!parsed) {
            alert('Could not parse prompt sections. Make sure both "SYSTEM INSTRUCTION:" and "TASK:" sections are present, separated by the divider line.');
            return;
        }

        setPromptSaving(true);
        try {
            await updatePrompt(promptEditSession.prompt.id, {
                systemInstruction: parsed.systemInstruction,
                promptTask: parsed.promptTask,
            });

            // Restore stashed content
            setPreviewText(promptEditSession.stashedContent);
            setOriginalText(promptEditSession.stashedOriginalText);
            setModifiedText('');
            resetDiffState();
            setPromptEditSession(null);
        } catch (err) {
            console.error('Failed to save prompt:', err);
            alert('Failed to save prompt. Please try again.');
        } finally {
            setPromptSaving(false);
        }
    }, [promptEditSession, previewText, updatePrompt, setPreviewText, setOriginalText, setModifiedText, resetDiffState]);

    // Cancel prompt editing and restore stashed content
    const handleCancelPromptEdit = useCallback(() => {
        if (!promptEditSession) return;

        setPreviewText(promptEditSession.stashedContent);
        setOriginalText(promptEditSession.stashedOriginalText);
        setModifiedText('');
        resetDiffState();
        setPromptEditSession(null);
    }, [promptEditSession, setPreviewText, setOriginalText, setModifiedText, resetDiffState]);

    // Shift+Enter keyboard shortcut to commit with save
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Shift+Enter to save commit (same as Shift+Click)
            if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.altKey) {
                // Only trigger if not in an input/textarea that needs Shift+Enter
                const activeEl = document.activeElement;
                const isInPromptPanel = activeEl?.closest('[data-prompt-panel]');

                if (!isInPromptPanel && previewText.trim()) {
                    e.preventDefault();

                    // If in prompt edit mode, Shift+Enter saves the prompt
                    if (promptEditSession) {
                        handleSavePromptEdit();
                        return;
                    }

                    handleCommitClick({ shiftKey: true } as React.MouseEvent).then(() => {
                        setJustSaved(true);
                        setTimeout(() => setJustSaved(false), 600);
                    }).catch(console.error);
                }
            }

            // Escape to cancel prompt editing
            if (e.key === 'Escape' && promptEditSession) {
                e.preventDefault();
                handleCancelPromptEdit();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleCommitClick, previewText, promptEditSession, handleSavePromptEdit, handleCancelPromptEdit]);

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
            {/* Prompt Editing Banner */}
            {promptEditSession && (
                <div className="flex-none px-4 py-2.5 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-purple-500/10 dark:from-indigo-900/30 dark:to-purple-900/30 border-b border-indigo-200 dark:border-indigo-800">
                    <div className="flex items-center gap-2">
                        <Edit3 className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                        <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                            Editing Prompt: <strong>{promptEditSession.prompt.name}</strong>
                        </span>
                        <span className="text-xs text-indigo-400 dark:text-indigo-500 ml-2">
                            Edit both sections, then Save or Cancel
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancelPromptEdit}
                            className="text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
                            icon={<X className="w-3.5 h-3.5" />}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleSavePromptEdit}
                            isLoading={promptSaving}
                            className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                            icon={<Save className="w-3.5 h-3.5" />}
                        >
                            Save Prompt
                        </Button>
                    </div>
                </div>
            )}

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
                        {/* Prompt Dropdown Button — Click=Execute, Arrow=Dropdown, Shift+Click=Graph */}
                        <PromptDropdownButton
                            activePrompt={activePrompt}
                            pinnedPrompts={aiPrompts.filter(p => p.pinned)}
                            isProcessing={isPolishing || isFactChecking || isGeneratingImage || hasPendingAsyncOperations}
                            processingLabel={
                                isPolishing ? 'Processing...'
                                    : isFactChecking ? 'Checking...'
                                        : isGeneratingImage ? 'Generating...'
                                            : 'Processing...'
                            }
                            onExecute={() => handleQuickSend()}
                            onSelectPrompt={(id) => {
                                setActivePromptId(id);
                            }}
                            onOpenGraph={() => setShowPromptsModal(true)}
                            onCancel={cancelAIOperation}
                            disabled={isPolishing || isFactChecking || isGeneratingImage || hasPendingAsyncOperations || !!promptEditSession}
                        />
                        {isFactChecking && factCheckProgress && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 dark:text-slate-400 max-w-32 truncate">
                                    {factCheckProgress}
                                </span>
                                <span className="px-2 py-0.5 text-[10px] rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                                    Search: {factCheckSearchMode}
                                </span>
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
                        disabled={isAutoCompareEnabled || !!promptEditSession}
                        className={clsx((isAutoCompareEnabled || promptEditSession) && "opacity-50")}
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

                    {/* Show Save Prompt button when in prompt editing mode, otherwise normal Commit button */}
                    {promptEditSession ? (
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCancelPromptEdit}
                                icon={<RotateCcw className="w-3 h-3" />}
                                title="Cancel prompt editing and restore previous content"
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleSavePromptEdit}
                                isLoading={promptSaving}
                                className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                                icon={<Save className="w-3 h-3" />}
                                title="Save prompt changes and restore previous content (Shift+Enter)"
                            >
                                Save Prompt
                            </Button>
                        </div>
                    ) : (
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
                    )}
                </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-muted)' }}>
                <div className="flex-1 m-4 rounded-xl shadow-sm overflow-hidden relative transition-colors duration-200" style={{ backgroundColor: 'var(--bg-surface)', border: `1px solid ${promptEditSession ? 'var(--tw-ring-color, rgb(129 140 248))' : 'var(--border-color)'}` }}>
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
                            if (e.ctrlKey && !promptEditSession) {
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
                        placeholder={promptEditSession
                            ? "Edit the prompt sections above. Keep the SYSTEM INSTRUCTION and TASK sections separated by the divider line."
                            : "Type or paste your text here. Use AI Edit to polish it."
                        }
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
                    {promptEditSession ? (
                        <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                            <Edit3 className="w-3 h-3" />
                            <span>Editing: {promptEditSession.prompt.name}</span>
                            <span className="mx-2 opacity-30">|</span>
                            <span className="text-gray-400 dark:text-slate-500">Shift+Enter to save, Esc to cancel</span>
                        </span>
                    ) : (
                        <span className="flex items-center gap-1.5" title="Word Count & Character Count">
                            <span className="w-2.5 h-2.5 bg-indigo-200 dark:bg-indigo-500/50 border border-indigo-400 dark:border-indigo-400/50 rounded-sm"></span>
                            <span>Words: {previewText.trim() ? previewText.trim().split(/\s+/).length : 0}</span>
                            <span className="mx-2 opacity-30">|</span>
                            <span>Chars: {previewText.length}</span>
                        </span>
                    )}
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
