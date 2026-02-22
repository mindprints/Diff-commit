import React from 'react';
import { Edit3, Volume2, Square, Zap, GitBranch, PanelBottomClose, PanelBottomOpen, ArrowRight, Save, RotateCcw } from 'lucide-react';
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

/**
 * Wrap the textarea's current selection with a prefix/suffix marker pair (e.g. **bold**).
 *
 * Key whitespace rule (CommonMark §6.2): a right-flanking delimiter run cannot be
 * preceded by Unicode whitespace. So `*Jill *` is NOT italic — the space before the
 * closing `*` disqualifies it. We therefore strip leading/trailing whitespace from the
 * selected text and place it OUTSIDE the markers:
 *   selection "Jill "  →  *Jill* (trailing space moved outside)
 *
 * If nothing is selected, the markers are inserted at the cursor with the cursor
 * positioned between them, ready to type.
 *
 * Directly mutates the DOM value so the cursor/selection position is preserved, then
 * calls onChangeValue to sync React controlled state.
 */
function wrapSelection(
    textarea: HTMLTextAreaElement,
    marker: string,
    onChangeValue: (v: string) => void
): void {
    const { selectionStart: start, selectionEnd: end, value } = textarea;
    const selected = value.slice(start, end);
    const before = value.slice(0, start);
    const after = value.slice(end);

    if (selected.length === 0) {
        // No selection: insert paired markers and place cursor between them.
        // Toggle check: if cursor is already sitting between two markers, remove them.
        if (before.endsWith(marker) && after.startsWith(marker)) {
            const newValue =
                value.slice(0, start - marker.length) +
                value.slice(end + marker.length);
            textarea.value = newValue;
            textarea.selectionStart = start - marker.length;
            textarea.selectionEnd = start - marker.length;
            onChangeValue(newValue);
            return;
        }
        const newValue = before + marker + marker + after;
        textarea.value = newValue;
        textarea.selectionStart = start + marker.length;
        textarea.selectionEnd = start + marker.length;
        onChangeValue(newValue);
        return;
    }

    // Strip leading/trailing whitespace from the selection so the markers are
    // always adjacent to non-whitespace characters (required by CommonMark §6.2).
    const leadingSpace = selected.match(/^\s*/)?.[0] ?? '';
    const trailingSpace = selected.match(/\s*$/)?.[0] ?? '';
    const inner = selected.slice(
        leadingSpace.length,
        selected.length - trailingSpace.length
    );

    if (inner.length === 0) {
        // Selection is only whitespace — nothing meaningful to wrap, ignore.
        return;
    }

    // Toggle: check if the trimmed inner text is already surrounded by markers.
    const innerStart = start + leadingSpace.length;
    const innerEnd = end - trailingSpace.length;
    const charsBefore = value.slice(0, innerStart);
    const charsAfter = value.slice(innerEnd);
    if (charsBefore.endsWith(marker) && charsAfter.startsWith(marker)) {
        // Unwrap: remove the markers, keep the surrounding whitespace in place.
        const newValue =
            value.slice(0, innerStart - marker.length) +
            leadingSpace + inner + trailingSpace +
            value.slice(innerEnd + marker.length);
        textarea.value = newValue;
        // After removing both markers the text shifts left.
        // Leading marker was at [innerStart-marker.length .. innerStart), so
        // anything at or after that position moves left by marker.length.
        // start >= innerStart - marker.length always (start = innerStart - leadingSpace.length),
        // so selectionStart shifts left by (marker.length - leadingSpace.length).
        const newLen = newValue.length;
        const newSelStart = Math.max(0, Math.min(start - (marker.length - leadingSpace.length), newLen));
        const newSelEnd = Math.max(0, Math.min(end - marker.length * 2, newLen));
        textarea.selectionStart = newSelStart;
        textarea.selectionEnd = newSelEnd;
        onChangeValue(newValue);
        return;
    }

    // Wrap: leadingSpace + *inner* + trailingSpace
    const newValue =
        before + leadingSpace + marker + inner + marker + trailingSpace + after;
    textarea.value = newValue;
    // Keep the visible selection spanning the wrapped inner text.
    textarea.selectionStart = innerStart + marker.length;
    textarea.selectionEnd = innerEnd + marker.length;
    onChangeValue(newValue);
}

function formatPromptForEditor(prompt: AIPrompt): string {
    return `PROMPT NAME:\n${prompt.name}${SECTION_SEPARATOR}SYSTEM INSTRUCTION:\n${prompt.systemInstruction}${SECTION_SEPARATOR}TASK:\n${prompt.promptTask}`;
}

function parsePromptFromEditor(text: string): { name?: string; systemInstruction: string; promptTask: string } | null {
    // Try to split by the separator
    const parts = text.split('════════════════════════════════');
    if (parts.length < 2) return null;

    if (parts.length >= 3) {
        const nameBlock = parts[0].trim();
        const sysBlock = parts[1].trim();
        const taskBlock = parts.slice(2).join('════════════════════════════════').trim();

        const nameMatch = nameBlock.replace(/^PROMPT NAME:\s*/i, '').trim();
        const sysMatch = sysBlock.replace(/^SYSTEM INSTRUCTION:\s*/i, '').trim();
        const taskMatch = taskBlock.replace(/^TASK:\s*/i, '').trim();

        if (!nameMatch || !sysMatch || !taskMatch) return null;
        return { name: nameMatch, systemInstruction: sysMatch, promptTask: taskMatch };
    }

    const sysBlock = parts[0].trim();
    const taskBlock = parts[1].trim();
    const sysMatch = sysBlock.replace(/^SYSTEM INSTRUCTION:\s*/i, '').trim();
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
        handleCommitClick, hasUnsavedChanges, commits,
        recoveredDraftUpdatedAt, restoreRecoveredDraft, discardRecoveredDraft
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
            alert('Could not parse prompt sections. Keep "PROMPT NAME:", "SYSTEM INSTRUCTION:", and "TASK:" sections separated by the divider lines.');
            return;
        }

        setPromptSaving(true);
        try {
            await updatePrompt(promptEditSession.prompt.id, {
                ...(parsed.name ? { name: parsed.name } : {}),
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

    // Shift+Enter / Escape / Ctrl+B / Ctrl+I keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl+B — bold, Ctrl+I — italic (only when main editor textarea is focused)
            if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'b' || e.key === 'i')) {
                const textarea = previewTextareaRef.current?.getTextarea();
                if (textarea && document.activeElement === textarea) {
                    e.preventDefault();
                    // Use ** for bold, * for italic.
                    // We use * (not _) for italic because * works unconditionally per
                    // CommonMark — _ requires alphanumeric-free word boundaries.
                    const marker = e.key === 'b' ? '**' : '*';
                    wrapSelection(textarea, marker, setPreviewText);
                }
                return;
            }

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
    }, [handleCommitClick, previewText, previewTextareaRef, setPreviewText, promptEditSession, handleSavePromptEdit, handleCancelPromptEdit]);

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
            {recoveredDraftUpdatedAt && (
                <div className="flex-none px-4 py-2.5 flex items-center justify-between bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800">
                    <div className="text-sm text-amber-800 dark:text-amber-200">
                        Recovered unsaved draft from {new Date(recoveredDraftUpdatedAt).toLocaleString()}.
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={discardRecoveredDraft}
                            className="text-gray-600 hover:text-gray-800 dark:text-slate-300 dark:hover:text-slate-100"
                        >
                            Discard
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={restoreRecoveredDraft}
                            className="bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500"
                        >
                            Restore Draft
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
                            disabled={isPolishing || isFactChecking || isGeneratingImage || hasPendingAsyncOperations}
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
                        disabled={isAutoCompareEnabled}
                        className={clsx((isAutoCompareEnabled) && "opacity-50")}
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
                        placeholder={promptEditSession
                            ? "Edit PROMPT NAME, SYSTEM INSTRUCTION, and TASK. Keep sections separated by the divider lines."
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
