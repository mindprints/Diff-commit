import React, { createContext, useContext, useState, ReactNode, useCallback, useRef } from 'react';
import { usePrompts } from '../hooks/usePrompts';
import { useAsyncAI } from '../hooks/useAsyncAI';
import { useEditor } from './EditorContext';
import { useUI } from './UIContext';
import { MODELS, Model } from '../constants/models';
import { runFactCheck, getFactCheckModels } from '../services/factChecker';
import { checkSpelling } from '../services/spellChecker';
import { polishMultipleRanges } from '../services/ai';
import { expandToWordBoundaries } from '../utils/textUtils';
import { ViewMode, AILogEntry, PolishMode, AIPrompt } from '../types';

interface AIContextType {
    // usePrompts
    aiPrompts: any[];
    builtInPrompts: any[];
    customPrompts: any[];
    getPrompt: (id: string) => any;
    createPrompt: (prompt: any) => Promise<any>;
    updatePrompt: (prompt: any) => Promise<void>;
    deletePrompt: (id: string) => Promise<void>;
    resetBuiltIn: () => void;
    promptsLoading: boolean;

    // useAsyncAI
    pendingOperations: any[]; // Consider using specific PendingOperation type if available
    startOperation: (start: number, end: number, promptId: string) => Promise<void>;
    cancelAsyncOperations: () => void;
    handleQuickSend: (promptId?: string) => void;
    isPolishing: boolean;
    isFactChecking: boolean;
    factCheckProgress: string;
    setFactCheckProgress: (progress: string) => void;

    // Prompt saving state
    pendingPromptText: string;
    setPendingPromptText: (text: string) => void;

    // Operational state
    selectedModel: Model;
    setSelectedModel: (model: Model) => void;
    sessionCost: number;
    setSessionCost: (cost: number) => void;
    updateCost: (usage?: { inputTokens: number; outputTokens: number }) => void;

    // Handlers
    handleAIEdit: (promptId: string) => Promise<void>;
    handleFactCheck: () => Promise<void>;
    handleLocalSpellCheck: () => Promise<void>;
    handleReadAloud: () => void;
    cancelAIOperation: () => void;
    handlePolishSelection: (polishMode: PolishMode) => Promise<void>;
    handleSaveAsPrompt: () => void;
    handleSavePromptSubmit: (prompt: AIPrompt) => Promise<void>;
    handleRate: (id: string, rating: number, feedback?: string) => Promise<void>;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

export function AIProvider({ children }: { children: ReactNode }) {
    const {
        previewText, setPreviewText, originalText, setOriginalText, modifiedText, setModifiedText,
        performDiff, setMode, originalTextRef, previewTextareaRef
    } = useEditor();
    const {
        setErrorMessage, setActiveLogId, contextMenu, setSavePromptDialogOpen,
        setContextMenu, setIsSpeaking, isSpeaking, setShowPromptsModal
    } = useUI();

    const [selectedModel, setSelectedModel] = useState<Model>(MODELS[0]);
    const [sessionCost, setSessionCost] = useState(0);
    const [isPolishing, setIsPolishing] = useState(false);
    const [isFactChecking, setIsFactChecking] = useState(false);
    const [factCheckProgress, setFactCheckProgress] = useState('');
    const [pendingPromptText, setPendingPromptText] = useState('');

    const {
        prompts: aiPrompts,
        builtInPrompts,
        customPrompts,
        getPrompt,
        createPrompt,
        updatePrompt,
        deletePrompt,
        resetBuiltIn,
        isLoading: promptsLoading,
    } = usePrompts();

    const updateCost = useCallback((usage?: { inputTokens: number; outputTokens: number }) => {
        if (!usage) return;
        const cost = (usage.inputTokens / 1_000_000 * selectedModel.inputPrice) +
            (usage.outputTokens / 1_000_000 * selectedModel.outputPrice);
        setSessionCost(prev => prev + cost);
    }, [selectedModel]);

    const {
        pendingOperations,
        startOperation,
        cancelAllOperations: cancelAsyncOperations,
    } = useAsyncAI({
        getText: () => previewText,
        setText: setPreviewText,
        getModel: () => selectedModel,
        getPrompt,
        onCostUpdate: updateCost,
        onLog: (taskName, usage, durationMs) => {
            const cost = (usage.inputTokens / 1_000_000 * selectedModel.inputPrice) +
                (usage.outputTokens / 1_000_000 * selectedModel.outputPrice);

            const logEntry: AILogEntry = {
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                modelId: selectedModel.id,
                modelName: selectedModel.name,
                taskType: taskName,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                cost,
                durationMs
            };

            if (window.electron && window.electron.logUsage) {
                window.electron.logUsage(logEntry);
            } else {
                try {
                    const stored = localStorage.getItem('diff-commit-logs');
                    const logs: any[] = stored ? JSON.parse(stored) : [];
                    logs.push(logEntry);
                    if (logs.length > 1000) logs.shift();
                    localStorage.setItem('diff-commit-logs', JSON.stringify(logs));
                } catch (e) {
                    console.warn('Failed to save log to localStorage:', e);
                }
            }
            setActiveLogId(logEntry.id);
        },
        onError: setErrorMessage,
        onDiffUpdate: (prev, modified) => {
            const currentOriginalText = originalTextRef.current;
            const baseline = currentOriginalText.trim() ? currentOriginalText : prev;

            if (!currentOriginalText.trim()) {
                setOriginalText(prev);
            }
            setModifiedText(modified);
            performDiff(baseline, modified);
            setMode(ViewMode.DIFF);
        },
    });

    const abortControllerRef = useRef<AbortController | null>(null);

    const cancelAIOperation = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        cancelAsyncOperations();
        setIsPolishing(false);
        setIsFactChecking(false);
        setFactCheckProgress('');
    }, [cancelAsyncOperations]);

    const getSourceTextForAI = useCallback(() => {
        if (previewText.trim()) {
            return { sourceText: previewText, fromRightTab: true };
        }
        const hasLeft = originalText.trim().length > 0;
        const hasRight = modifiedText.trim().length > 0;

        if (hasRight && !hasLeft) {
            return { sourceText: modifiedText, fromRightTab: true };
        } else if (hasLeft) {
            return { sourceText: originalText, fromRightTab: false };
        }
        return { sourceText: '', fromRightTab: false };
    }, [previewText, originalText, modifiedText]);

    const handleLocalSpellCheck = useCallback(async () => {
        try {
            const textarea = previewTextareaRef.current?.getTextarea();
            if (textarea && textarea.selectionStart !== textarea.selectionEnd) {
                const { selectionStart, selectionEnd } = textarea;
                const expanded = expandToWordBoundaries(selectionStart, selectionEnd, previewText);
                const sourceText = previewText.substring(expanded.start, expanded.end);

                if (!sourceText.trim()) return;

                const result = checkSpelling(sourceText);
                if (result.isError) {
                    setErrorMessage(result.errorMessage || 'Spell check failed');
                    return;
                }

                const newText = previewText.substring(0, expanded.start) + result.text + previewText.substring(expanded.end);
                setOriginalText(previewText);
                setPreviewText(newText);
                setModifiedText(newText);
                performDiff(previewText, newText);
                setMode(ViewMode.DIFF);
            } else {
                const { sourceText } = getSourceTextForAI();
                if (!sourceText.trim()) {
                    setErrorMessage('Please enter some text first.');
                    return;
                }

                const result = checkSpelling(sourceText);
                if (result.isError) {
                    setErrorMessage(result.errorMessage || 'Spell check failed');
                    return;
                }

                setOriginalText(sourceText);
                setModifiedText(result.text);
                performDiff(sourceText, result.text);
                setMode(ViewMode.DIFF);
            }
        } catch (e) {
            console.error(e);
            setErrorMessage('Failed to run spell check');
        }
    }, [previewText, previewTextareaRef, setErrorMessage, setOriginalText, setPreviewText, setModifiedText, performDiff, setMode, getSourceTextForAI]);

    const handleAIEdit = useCallback(async (promptId: string) => {
        if (promptId === 'spelling_local') {
            return handleLocalSpellCheck();
        }

        const textarea = previewTextareaRef.current?.getTextarea();
        let start = 0;
        let end = 0;
        let hasSelection = false;

        if (textarea) {
            const { selectionStart, selectionEnd } = textarea;
            if (selectionStart !== selectionEnd) {
                const expanded = expandToWordBoundaries(selectionStart, selectionEnd, previewText);
                start = expanded.start;
                end = expanded.end;
                hasSelection = true;
            }
        }

        if (hasSelection) {
            startOperation(start, end, promptId);
        } else {
            if (!previewText.trim()) {
                setErrorMessage('Please enter some text first.');
                return;
            }
            startOperation(0, previewText.length, promptId);
        }
    }, [handleLocalSpellCheck, previewTextareaRef, previewText, startOperation, setErrorMessage]);

    const handleQuickSend = useCallback((promptId: string = 'grammar') => {
        const textarea = previewTextareaRef.current?.getTextarea();
        if (!textarea) return;

        const { start, end } = expandToWordBoundaries(
            textarea.selectionStart,
            textarea.selectionEnd,
            previewText
        );

        if (start !== end) {
            startOperation(start, end, promptId);
        }
    }, [previewText, startOperation, previewTextareaRef]);

    const handleFactCheck = useCallback(async () => {
        cancelAIOperation();
        const { sourceText } = getSourceTextForAI();
        if (!sourceText.trim()) {
            setErrorMessage('Please enter some text first.');
            return;
        }

        abortControllerRef.current = new AbortController();
        setIsFactChecking(true);
        setFactCheckProgress('Starting fact check...');
        setErrorMessage(null);

        const { session, usage, isError, isCancelled, errorMessage } = await runFactCheck(
            sourceText,
            (stage) => setFactCheckProgress(stage),
            abortControllerRef.current.signal
        );

        if (isCancelled) return;

        if (isError) {
            setErrorMessage(errorMessage || 'Fact check failed.');
            setIsFactChecking(false);
            setFactCheckProgress('');
            return;
        }

        setErrorMessage(null);

        if (usage) {
            const models = getFactCheckModels();
            const extractionCost = (usage.inputTokens * 0.2 / 1_000_000 * models.extraction.inputPrice) +
                (usage.outputTokens * 0.2 / 1_000_000 * models.extraction.outputPrice);
            const verificationCost = (usage.inputTokens * 0.8 / 1_000_000 * models.verification.inputPrice) +
                (usage.outputTokens * 0.8 / 1_000_000 * models.verification.outputPrice);
            setSessionCost(prev => prev + extractionCost + verificationCost);

            const sessionId = crypto.randomUUID();
            const extractionLog: AILogEntry = {
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                modelId: models.extraction.id,
                modelName: models.extraction.name,
                taskType: 'fact-check-extraction',
                inputTokens: Math.round(usage.inputTokens * 0.2),
                outputTokens: Math.round(usage.outputTokens * 0.2),
                cost: extractionCost,
                sessionId
            };

            const verificationLog: AILogEntry = {
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                modelId: models.verification.id,
                modelName: models.verification.name,
                taskType: 'fact-check-verification',
                inputTokens: Math.round(usage.inputTokens * 0.8),
                outputTokens: Math.round(usage.outputTokens * 0.8),
                cost: verificationCost,
                sessionId
            };

            if (window.electron && window.electron.logUsage) {
                await window.electron.logUsage(extractionLog);
                await window.electron.logUsage(verificationLog);
            } else {
                try {
                    const stored = localStorage.getItem('diff-commit-logs');
                    const logs: any[] = stored ? JSON.parse(stored) : [];
                    logs.push(extractionLog, verificationLog);
                    while (logs.length > 1000) logs.shift();
                    localStorage.setItem('diff-commit-logs', JSON.stringify(logs));
                } catch (e) {
                    console.warn('Failed to save log to localStorage:', e);
                }
            }
            setActiveLogId(verificationLog.id);
        }

        setIsFactChecking(false);
        setFactCheckProgress('');
        abortControllerRef.current = null;
    }, [cancelAIOperation, getSourceTextForAI, setErrorMessage, setFactCheckProgress, setIsFactChecking, setSessionCost, setActiveLogId]);

    const handleReadAloud = useCallback(() => {
        if (isSpeaking) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
            return;
        }

        let textToSpeak = previewText;
        const textarea = previewTextareaRef.current?.getTextarea();
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            if (start !== end) {
                textToSpeak = previewText.substring(start, end);
            }
        }

        if (!textToSpeak.trim()) return;

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
    }, [isSpeaking, previewText, previewTextareaRef, setIsSpeaking]);

    const handlePolishSelection = useCallback(async (polishMode: PolishMode) => {
        const textarea = previewTextareaRef.current?.getTextarea();
        let start = 0;
        let end = previewText.length;
        let selectedText = previewText;

        if (textarea) {
            const selStart = textarea.selectionStart;
            const selEnd = textarea.selectionEnd;
            if (selStart !== selEnd) {
                const expanded = expandToWordBoundaries(selStart, selEnd, previewText);
                start = expanded.start;
                end = expanded.end;
                selectedText = previewText.substring(start, end);
            }
        }

        if (!selectedText.trim()) {
            setErrorMessage('Please select some text first.');
            return;
        }

        cancelAIOperation();
        abortControllerRef.current = new AbortController();
        setIsPolishing(true);
        setErrorMessage(null);

        const startTime = Date.now();
        const { results, usage, isError, isCancelled, errorMessage: aiError } = await polishMultipleRanges(
            [{ id: 'selection', text: selectedText }],
            polishMode,
            selectedModel,
            abortControllerRef.current.signal
        );
        const durationMs = Date.now() - startTime;

        if (isCancelled) {
            setIsPolishing(false);
            abortControllerRef.current = null;
            return;
        }

        if (isError) {
            setErrorMessage(aiError || 'AI polish failed.');
            setIsPolishing(false);
            return;
        }
        updateCost(usage);
        const taskName = polishMode === 'spelling' ? 'Spelling (Selection)'
            : polishMode === 'grammar' ? 'Grammar (Selection)'
                : polishMode === 'prompt' ? 'Prompt Expansion (Selection)'
                    : 'Full Polish (Selection)';

        if (usage) {
            const cost = (usage.inputTokens / 1_000_000 * selectedModel.inputPrice) +
                (usage.outputTokens / 1_000_000 * selectedModel.outputPrice);

            const logEntry: AILogEntry = {
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                modelId: selectedModel.id,
                modelName: selectedModel.name,
                taskType: taskName,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                cost,
                durationMs
            };

            if (window.electron && window.electron.logUsage) {
                await window.electron.logUsage(logEntry);
            } else {
                try {
                    const stored = localStorage.getItem('diff-commit-logs');
                    const logs: any[] = stored ? JSON.parse(stored) : [];
                    logs.push(logEntry);
                    if (logs.length > 1000) logs.shift();
                    localStorage.setItem('diff-commit-logs', JSON.stringify(logs));
                } catch (e) {
                    console.warn('Failed to save log to localStorage:', e);
                }
            }
            setActiveLogId(logEntry.id);
        }

        if (results.length > 0) {
            const result = results[0].result;
            const newText = previewText.slice(0, start) + result + previewText.slice(end);

            setOriginalText(previewText);
            setPreviewText(newText);
            setModifiedText(newText);
            performDiff(previewText, newText);
            setMode(ViewMode.DIFF);
        }

        setIsPolishing(false);
        abortControllerRef.current = null;
    }, [previewTextareaRef, previewText, cancelAIOperation, selectedModel, updateCost, setActiveLogId, setOriginalText, setPreviewText, setModifiedText, performDiff, setMode, setErrorMessage]);

    const handleSaveAsPrompt = useCallback(() => {
        if (contextMenu?.selection) {
            setPendingPromptText(contextMenu.selection);
            setSavePromptDialogOpen(true);
            setContextMenu(null);
        }
    }, [contextMenu, setPendingPromptText, setSavePromptDialogOpen, setContextMenu]);

    const handleSavePromptSubmit = useCallback(async (prompt: AIPrompt) => {
        try {
            await createPrompt({
                name: prompt.name,
                systemInstruction: prompt.systemInstruction,
                promptTask: prompt.promptTask,
                color: prompt.color,
            });
            setSavePromptDialogOpen(false);
            setPendingPromptText('');
            setShowPromptsModal(true);
        } catch (e) {
            console.error(e);
            setErrorMessage('Failed to save prompt');
        }
    }, [createPrompt, setSavePromptDialogOpen, setPendingPromptText, setShowPromptsModal, setErrorMessage]);

    const handleRate = useCallback(async (id: string, rating: number, feedback?: string) => {
        if (window.electron && window.electron.updateLogRating) {
            await window.electron.updateLogRating(id, rating, feedback);
        } else {
            console.log('Rating saved locally (mock):', { id, rating, feedback });
        }
        setActiveLogId(null);
    }, [setActiveLogId]);

    return (
        <AIContext.Provider value={{
            aiPrompts, builtInPrompts, customPrompts, getPrompt, createPrompt, updatePrompt, deletePrompt, resetBuiltIn, promptsLoading,
            pendingOperations, startOperation, cancelAsyncOperations,
            isPolishing, isFactChecking, factCheckProgress, setFactCheckProgress,
            pendingPromptText, setPendingPromptText,
            selectedModel, setSelectedModel, sessionCost, setSessionCost, updateCost,
            handleAIEdit, handleFactCheck, handleLocalSpellCheck, handleReadAloud, cancelAIOperation,
            handleQuickSend,
            handlePolishSelection, handleSaveAsPrompt, handleSavePromptSubmit, handleRate
        }}>
            {children}
        </AIContext.Provider>
    );
}

export function useAI() {
    const context = useContext(AIContext);
    if (context === undefined) {
        throw new Error('useAI must be used within an AIProvider');
    }
    return context;
}
