import React, { createContext, useContext, useState, ReactNode, useCallback, useRef, useMemo } from 'react';
import { usePrompts } from '../hooks/usePrompts';
import { useAsyncAI, PendingOperation } from '../hooks/useAsyncAI';
import { useEditor } from './EditorContext';
import { useUI } from './UIContext';
import { useModels } from '../hooks/useModels';
import { MODELS, Model } from '../constants/models';
import { runFactCheck, resolveFactCheckModels } from '../services/factChecker';
import { checkSpelling } from '../services/spellChecker';
import { polishMultipleRanges, runAnalysisInstruction } from '../services/ai';
import { expandToWordBoundaries } from '../utils/textUtils';
import { ViewMode, AILogEntry, PolishMode, AIPrompt } from '../types';
import {
    isImageGenerationRequest,
    extractImagePrompt,
    isImageCapable,
    generateImage,
    generateFilename
} from '../services/imageGenerationService';

const IMAGE_ONLY_MODEL_ERROR = "Your chosen AI model doesn't perform this task. Please select a text-capable model from the Model Manager.";

export interface AnalysisArtifact {
    id: string;
    type: 'fact_check' | 'critical_review' | 'analysis';
    title: string;
    content: string;
    modelId?: string;
    modelName?: string;
    createdAt: number;
}

interface AIContextType {
    // usePrompts
    aiPrompts: AIPrompt[];
    builtInPrompts: AIPrompt[];
    customPrompts: AIPrompt[];
    getPrompt: (id: string) => AIPrompt | undefined;
    createPrompt: (prompt: Partial<AIPrompt>) => Promise<AIPrompt>;
    updatePrompt: (id: string, updates: Partial<AIPrompt>) => Promise<void>;
    deletePrompt: (id: string) => Promise<void>;
    resetBuiltIn: (id: string) => Promise<void>;
    promptsLoading: boolean;
    hasStagedPromptChanges: boolean;
    sessionCreatedPromptCount: number;
    saveStagedPrompts: () => Promise<void>;
    discardStagedPrompts: () => void;

    // useAsyncAI
    pendingOperations: PendingOperation[];
    startOperation: (start: number, end: number, promptId: string, customPrompt?: AIPrompt) => Promise<void>;
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
    setDefaultModel: (model: Model) => void;
    selectedImageModel: Model | null;
    setDefaultImageModel: (model: Model | null) => void;
    sessionCost: number;
    setSessionCost: (cost: number) => void;
    updateCost: (usage?: { inputTokens: number; outputTokens: number }) => void;
    activePromptId: string;
    setActivePromptId: (id: string) => void;
    setDefaultPrompt: (id: string) => void;
    activePrompt: AIPrompt | null;

    // Handlers
    handleAIEdit: (promptId: string, options?: { autoSave?: boolean }) => Promise<void>;
    handlePromptPanelInstruction: (instruction: string, useAnalysisContext: boolean) => Promise<void>;
    handleAnalysisInstruction: (instruction: string, title?: string, type?: 'critical_review' | 'analysis') => Promise<void>;
    handleFactCheck: () => Promise<void>;
    handleLocalSpellCheck: () => Promise<void>;
    handleReadAloud: () => void;
    cancelAIOperation: () => void;
    handlePolishSelection: (polishMode: PolishMode) => Promise<void>;
    handleSaveAsPrompt: () => void;
    handleSavePromptSubmit: (prompt: Partial<AIPrompt>) => Promise<void>; handleRate: (id: string, rating: number, feedback?: string) => Promise<void>;

    // Image Generation
    isGeneratingImage: boolean;
    generatedImage: { data: string; prompt: string } | null;
    handleImageGeneration: (prompt: string, base64Image?: string, skipExtraction?: boolean) => Promise<void>;
    handleImageRegenerate: (additionalInstructions?: string) => Promise<void>;
    handleImageSave: () => Promise<void>;
    clearGeneratedImage: () => void;

    // Analysis results
    analysisArtifacts: AnalysisArtifact[];
    latestAnalysisArtifact: AnalysisArtifact | null;
    promptPanelUseAnalysisContext: boolean;
    setPromptPanelUseAnalysisContext: (enabled: boolean) => void;
    closeAnalysisViewer: () => void;
    openLatestAnalysisViewer: () => void;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

// Initialize text model from localStorage or fallback to first model
const getInitialModel = (): Model => {
    try {
        const stored = localStorage.getItem('diff-commit-default-model');
        if (stored) {
            const found = MODELS.find(m => m.id === stored);
            if (found) return found;
        }
    } catch (e) {
        console.warn('Failed to read default model from localStorage:', e);
    }
    return MODELS[0];
};

// Initialize image model from localStorage - only check built-in MODELS
// (importedModels isn't populated yet during useState initialization)
const getInitialImageModel = (): Model | null => {
    try {
        const stored = localStorage.getItem('diff-commit-default-image-model');
        if (stored) {
            // Only check built-in models during initialization
            const found = MODELS.find(m => m.id === stored);
            if (found) return found;
        }
    } catch (e) {
        console.warn('Failed to read default image model from localStorage:', e);
    }
    return null;
};

// Initialize prompt from localStorage or fallback to 'grammar'
const getInitialPromptId = (): string => {
    try {
        const stored = localStorage.getItem('diff-commit-default-prompt');
        if (stored) return stored;
    } catch (e) {
        console.warn('Failed to read default prompt from localStorage:', e);
    }
    return 'grammar';
};

export function AIProvider({ children }: { children: ReactNode }) {
    const {
        setPreviewText, originalText, setOriginalText, setModifiedText,
        performDiff, setMode, originalTextRef, previewTextRef, modifiedTextRef, previewTextareaRef,
        frozenSelection, setFrozenSelection
    } = useEditor();
    const {
        setErrorMessage, setActiveLogId, contextMenu, setSavePromptDialogOpen,
        setContextMenu, setIsSpeaking, isSpeaking, setShowPromptsModal,
        setShowImageViewer, setShowAnalysisViewer
    } = useUI();

    const { models: importedModels } = useModels();
    const allAvailableModels = useMemo(() => {
        const byId = new Map<string, Model>();
        for (const baseModel of MODELS) {
            byId.set(baseModel.id, baseModel);
        }
        for (const imported of importedModels) {
            if (!byId.has(imported.id)) {
                byId.set(imported.id, imported);
            }
        }
        return Array.from(byId.values());
    }, [importedModels]);

    const [selectedModel, setSelectedModel] = useState<Model>(getInitialModel);
    const [selectedImageModel, setSelectedImageModel] = useState<Model | null>(getInitialImageModel);
    const [sessionCost, setSessionCost] = useState(0);
    const [isPolishing, setIsPolishing] = useState(false);
    const [isFactChecking, setIsFactChecking] = useState(false);
    const [factCheckProgress, setFactCheckProgress] = useState('');
    const [pendingPromptText, setPendingPromptText] = useState('');

    const [activePromptId, setActivePromptId] = useState(getInitialPromptId);
    const restoredDefaultModelRef = useRef(false);

    // Restore selectedModel from imported models once they have loaded.
    // Initial state can only resolve built-in MODELS because importedModels
    // are populated asynchronously after the provider mounts.
    React.useEffect(() => {
        if (restoredDefaultModelRef.current || allAvailableModels.length === 0) return;

        try {
            const stored = localStorage.getItem('diff-commit-default-model');
            if (stored) {
                const restored = allAvailableModels.find((model) => model.id === stored);
                if (restored) {
                    setSelectedModel(restored);
                    restoredDefaultModelRef.current = true;
                }
                // If stored exists but not found yet, we don't set the ref to true,
                // allowing a retry when allAvailableModels updates (e.g. after imported models load).
            } else {
                // No stored ID means nothing to restore
                restoredDefaultModelRef.current = true;
            }
        } catch (e) {
            console.warn('Failed to restore text model from importedModels:', e);
            restoredDefaultModelRef.current = true;
        }
    }, [allAvailableModels]);

    // Restore selectedImageModel from importedModels when they become available
    React.useEffect(() => {
        // Skip if we already have a selectedImageModel set
        if (selectedImageModel) return;
        // Skip if importedModels hasn't loaded yet
        if (importedModels.length === 0) return;

        try {
            const stored = localStorage.getItem('diff-commit-default-image-model');
            if (stored) {
                const foundImported = importedModels.find(m => m.id === stored);
                if (foundImported) {
                    setSelectedImageModel(foundImported);
                }
            }
        } catch (e) {
            console.warn('Failed to restore image model from importedModels:', e);
        }
    }, [importedModels, selectedImageModel]);

    // Image generation state
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<{ data: string; prompt: string } | null>(null);
    const [analysisArtifacts, setAnalysisArtifacts] = useState<AnalysisArtifact[]>([]);
    const [promptPanelUseAnalysisContext, setPromptPanelUseAnalysisContext] = useState(false);
    const lastImagePromptRef = useRef<string>('');
    // Ref to break circular dependency - handleQuickSend needs to call handleImageGeneration
    const handleImageGenerationRef = useRef<(prompt: string, base64Image?: string) => Promise<void>>(async () => { });


    const {
        prompts: aiPrompts,
        builtInPrompts,
        customPrompts,
        getPrompt,
        createPrompt,
        updatePrompt,
        deletePrompt,
        resetBuiltIn,
        saveStagedChanges: saveStagedPrompts,
        discardStagedChanges: discardStagedPrompts,
        hasStagedChanges: hasStagedPromptChanges,
        sessionCreatedPromptCount,
        isLoading: promptsLoading,
    } = usePrompts();

    const updateCost = useCallback((usage?: { inputTokens: number; outputTokens: number }, modelOverride?: Model) => {
        if (!usage) return;
        const targetModel = modelOverride || selectedModel;
        const cost = (usage.inputTokens / 1_000_000 * targetModel.inputPrice) +
            (usage.outputTokens / 1_000_000 * targetModel.outputPrice);
        setSessionCost(prev => prev + cost);
        return cost; // Return the calculated cost for reuse in logging
    }, [selectedModel]);

    const persistLogEntry = useCallback(async (
        taskType: string,
        model: Model,
        usage: { inputTokens: number; outputTokens: number },
        durationMs: number,
        sessionId?: string
    ) => {
        // Calculate and update session cost via helper
        const cost = updateCost(usage, model) || 0;

        const logEntry: AILogEntry = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            modelId: model.id,
            modelName: model.name,
            taskType,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cost,
            durationMs,
            sessionId
        };

        if (window.electron && window.electron.logUsage) {
            await window.electron.logUsage(logEntry);
        } else {
            try {
                const stored = localStorage.getItem('diff-commit-logs');
                const logs: AILogEntry[] = stored ? JSON.parse(stored) : [];
                logs.push(logEntry);
                while (logs.length > 1000) logs.shift();
                localStorage.setItem('diff-commit-logs', JSON.stringify(logs));
            } catch (e) {
                console.warn('Failed to save log to localStorage:', e);
            }
        }
        setActiveLogId(logEntry.id);
        return logEntry;
    }, [updateCost, setActiveLogId]);

    // Set default text model
    const setDefaultModel = useCallback((model: Model) => {
        try {
            localStorage.setItem('diff-commit-default-model', model.id);
        } catch (e) {
            console.warn('Failed to save default model to localStorage:', e);
        }
        setSelectedModel(model);
    }, []);

    // Set default image model
    const setDefaultImageModel = useCallback((model: Model | null) => {
        try {
            if (model) {
                localStorage.setItem('diff-commit-default-image-model', model.id);
            } else {
                localStorage.removeItem('diff-commit-default-image-model');
            }
        } catch (e) {
            console.warn('Failed to save default image model to localStorage:', e);
        }
        setSelectedImageModel(model);
    }, []);

    // Set default prompt
    const setDefaultPrompt = useCallback((promptId: string) => {
        try {
            localStorage.setItem('diff-commit-default-prompt', promptId);
        } catch (e) {
            console.warn('Failed to save default prompt to localStorage:', e);
        }
        setActivePromptId(promptId);
    }, []);

    const findActivePrompt = useCallback((id: string, builtIn: AIPrompt[], custom: AIPrompt[]): AIPrompt | null => {
        return custom.find(p => p.id === id) ??
            builtIn.find(p => p.id === id) ??
            builtIn[0] ??
            null;
    }, []);

    const activePrompt = useMemo(
        () => findActivePrompt(activePromptId, builtInPrompts, customPrompts),
        [findActivePrompt, activePromptId, builtInPrompts, customPrompts]
    );

    /**
     * Check if a model is image-generation ONLY (cannot handle text tasks)
     * These are models like FLUX, DALL-E, Stable Diffusion that can't do text editing
     */
    const isImageOnlyModel = useCallback((model: Model): boolean => {
        const lowerId = model.id.toLowerCase();
        const imageOnlyPatterns = [
            'black-forest-labs/',  // FLUX models
            'stability-ai/',        // Stable Diffusion
            'dall-e',               // DALL-E models
            '/flux',                // Additional FLUX patterns
            '/sdxl',                // SDXL
            '/stable-diffusion',    // Stable Diffusion
        ];
        return imageOnlyPatterns.some(pattern => lowerId.includes(pattern));
    }, []);

    /**
     * Canonical source selector for AI operations.
     * Priority: previewText (editor content) > modifiedText > originalText
     * This ensures AI always operates on what the user sees/expects.
     */
    const getSourceTextForAI = useCallback((): { sourceText: string; fromRightTab: boolean } => {
        const pText = previewTextRef.current;
        const oText = originalTextRef.current;
        const mText = modifiedTextRef.current;

        // Priority 1: previewText (editor content) - what user is actively editing
        if (pText && pText.trim()) {
            return { sourceText: pText, fromRightTab: true };
        }

        // Priority 2: modifiedText - AI-modified content awaiting review
        if (mText && mText.trim()) {
            return { sourceText: mText, fromRightTab: true };
        }

        // Priority 3: originalText - baseline/committed content
        if (oText && oText.trim()) {
            return { sourceText: oText, fromRightTab: false };
        }

        // No content available
        return { sourceText: '', fromRightTab: false };
    }, [previewTextRef, originalTextRef, modifiedTextRef]);

    const {
        pendingOperations,
        startOperation,
        cancelAllOperations: cancelAsyncOperations,
        resetSession,
    } = useAsyncAI({
        // Use canonical source selector for consistent text source across all AI operations
        getText: () => getSourceTextForAI().sourceText,
        setText: setModifiedText,
        getModel: () => selectedModel,
        getPrompt,
        onCostUpdate: updateCost,
        onLog: (taskName, usage, durationMs) => {
            persistLogEntry(taskName, selectedModel, usage, durationMs);
        },
        onError: setErrorMessage,
        onDiffUpdate: (original, modified) => {
            const baseline = originalTextRef.current || original;

            if (!originalTextRef.current) {
                setOriginalText(baseline);
            }
            setModifiedText(modified);
            // Auto-accept: Show AI changes in editor immediately (opt-in to reject)
            // User can still use "Reject All" in diff view to revert
            setPreviewText(modified);
            performDiff(baseline, modified);
            setMode(ViewMode.DIFF);
        },
    });

    // Reset the AI session (history of edits) whenever the baseline text changes (commit/load)
    // This ensures we don't try to shift coordinates based on edits from a previous file/version
    React.useEffect(() => {
        resetSession();
    }, [originalText, resetSession]);

    const abortControllerRef = useRef<AbortController | null>(null);

    const cancelAIOperation = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        cancelAsyncOperations();
        setIsPolishing(false);
        setIsFactChecking(false);
        setIsGeneratingImage(false);
        setFactCheckProgress('');
    }, [cancelAsyncOperations]);

    const latestAnalysisArtifact = useMemo<AnalysisArtifact | null>(
        () => analysisArtifacts[0] || null,
        [analysisArtifacts]
    );

    const addAnalysisArtifact = useCallback((artifact: Omit<AnalysisArtifact, 'id' | 'createdAt'>) => {
        const next: AnalysisArtifact = {
            ...artifact,
            id: crypto.randomUUID(),
            createdAt: Date.now()
        };
        setAnalysisArtifacts((prev) => [next, ...prev].slice(0, 20));
        return next;
    }, []);

    const closeAnalysisViewer = useCallback(() => {
        setShowAnalysisViewer(false);
    }, [setShowAnalysisViewer]);

    const openLatestAnalysisViewer = useCallback(() => {
        if (!latestAnalysisArtifact) return;
        setShowAnalysisViewer(true);
    }, [latestAnalysisArtifact, setShowAnalysisViewer]);

    const handleLocalSpellCheck = useCallback(async () => {
        try {
            const textarea = previewTextareaRef.current?.getTextarea();
            if (textarea && textarea.selectionStart !== textarea.selectionEnd) {
                const { selectionStart, selectionEnd } = textarea;
                const expanded = expandToWordBoundaries(selectionStart, selectionEnd, previewTextRef.current);
                const sourceText = previewTextRef.current.substring(expanded.start, expanded.end);

                if (!sourceText.trim()) return;

                const result = checkSpelling(sourceText);
                if (result.isError) {
                    setErrorMessage(result.errorMessage || 'Spell check failed');
                    return;
                }

                const newText = previewTextRef.current.substring(0, expanded.start) + result.text + previewTextRef.current.substring(expanded.end);

                setOriginalText(previewTextRef.current);
                setModifiedText(newText);
                performDiff(previewTextRef.current, newText);
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
    }, [previewTextRef, previewTextareaRef, setErrorMessage, setOriginalText, setModifiedText, performDiff, setMode, getSourceTextForAI]);

    const handleAIEdit = useCallback(async (promptIdOrInstruction: string, options?: { autoSave?: boolean }) => {
        setErrorMessage(null);
        if (promptIdOrInstruction === 'spelling_local') {
            return handleLocalSpellCheck();
        }

        // Check if this is an image generation request
        if (isImageGenerationRequest(promptIdOrInstruction)) {
            return handleImageGenerationRef.current(promptIdOrInstruction);
        }

        // Check for task mismatch: trying to use a text task on an image-only model
        if (isImageOnlyModel(selectedModel)) {
            setErrorMessage(IMAGE_ONLY_MODEL_ERROR);
            return;
        }

        const isKnownBuiltIn = builtInPrompts.some(p => p.id === promptIdOrInstruction);
        const isKnownCustom = customPrompts.some(p => p.id === promptIdOrInstruction);
        const isKnownPrompt = isKnownBuiltIn || isKnownCustom;

        let start = 0;
        let end = 0;
        let hasSelection = false;
        const textarea = previewTextareaRef.current?.getTextarea();

        if (textarea) {
            const { selectionStart, selectionEnd } = textarea;
            if (selectionStart !== selectionEnd) {
                const expanded = expandToWordBoundaries(selectionStart, selectionEnd, previewTextRef.current);
                start = expanded.start;
                end = expanded.end;
                hasSelection = true;
            }
        }

        // If no active selection, check for frozen selection
        if (!hasSelection && frozenSelection) {
            start = frozenSelection.start;
            end = frozenSelection.end;
            hasSelection = true;
        }

        if (isKnownPrompt) {
            // Standard prompt or preset - needs text to operate on
            if (hasSelection) {
                try {
                    await startOperation(start, end, promptIdOrInstruction);
                    setFrozenSelection(null);
                } catch (e) {
                    console.error('Failed to start standard AI operation:', e);
                }
            } else {
                if (!previewTextRef.current.trim()) {
                    setErrorMessage('Please enter some text first.');
                    return;
                }
                try {
                    await startOperation(0, previewTextRef.current.length, promptIdOrInstruction);
                    setFrozenSelection(null);
                } catch (e) {
                    console.error('Failed to start full-text AI operation:', e);
                }
            }
        } else {
            // Custom instruction from prompt panel - fallback to full text if no selection
            const finalStart = hasSelection ? start : 0;
            const finalEnd = hasSelection ? end : previewTextRef.current.length;

            const customPrompt: AIPrompt = {
                id: 'custom_instruction',
                name: 'Custom Instruction',
                systemInstruction: "You are an expert editor and creative writer. If the provided text is empty, generate new content based on the instruction. If text is provided, modify it according to the instruction. Return ONLY the final processed text.",
                promptTask: promptIdOrInstruction,
                isBuiltIn: false,
                order: 99
            };

            try {
                // Auto-save this custom instruction if it's not already specialized
                // We use the instruction itself as the name for now
                await startOperation(finalStart, finalEnd, 'custom', customPrompt);
                setFrozenSelection(null);

                // Proactively add to custom prompts for reuse
                if (options?.autoSave !== false) {
                    createPrompt({
                        name: promptIdOrInstruction.length > 30 ? promptIdOrInstruction.substring(0, 27) + "..." : promptIdOrInstruction,
                        systemInstruction: customPrompt.systemInstruction,
                        promptTask: promptIdOrInstruction,
                        color: 'bg-indigo-400'
                    }).catch(e => console.warn('Failed to auto-save custom prompt:', e));
                }
            } catch (e) {
                console.error('Failed to start custom AI instruction:', e);
            }
        }
    }, [handleLocalSpellCheck, previewTextareaRef, previewTextRef, startOperation, setErrorMessage, builtInPrompts, customPrompts, frozenSelection, setFrozenSelection, createPrompt, isImageOnlyModel, selectedModel, handleImageGenerationRef]);

    const handlePromptPanelInstruction = useCallback(async (instruction: string, useAnalysisContext: boolean) => {
        if (!useAnalysisContext || !latestAnalysisArtifact) {
            await handleAIEdit(instruction);
            return;
        }

        const contextualInstruction = `Use the analysis report below as guidance while editing the text.
Keep the author's tone and intent unless the instruction explicitly says otherwise.
Do not output a report. Return only revised text.

Analysis Report:
${latestAnalysisArtifact.content}

User Instruction:
${instruction}`;

        await handleAIEdit(contextualInstruction, { autoSave: false });
    }, [handleAIEdit, latestAnalysisArtifact]);

    const handleAnalysisInstruction = useCallback(async (
        instruction: string,
        title = 'Analysis',
        type: 'critical_review' | 'analysis' = 'analysis'
    ) => {
        if (isImageOnlyModel(selectedModel)) {
            setErrorMessage(IMAGE_ONLY_MODEL_ERROR);
            return;
        }

        cancelAIOperation();
        const { sourceText } = getSourceTextForAI();
        if (!sourceText.trim()) {
            setErrorMessage('Please enter some text first.');
            return;
        }

        abortControllerRef.current = new AbortController();
        setIsPolishing(true);
        setErrorMessage(null);

        try {
            const startTime = Date.now();
            const response = await runAnalysisInstruction(
                sourceText,
                instruction,
                selectedModel,
                abortControllerRef.current.signal
            );
            const durationMs = Date.now() - startTime;

            if (response.isCancelled) {
                return;
            }
            if (response.isError) {
                setErrorMessage(response.text || 'Analysis failed.');
                return;
            }

            const artifact = addAnalysisArtifact({
                type,
                title: `${title} (${new Date().toLocaleTimeString()})`,
                content: response.text,
                modelId: selectedModel.id,
                modelName: selectedModel.name
            });
            if (artifact) {
                setShowAnalysisViewer(true);
            }

            if (response.usage) {
                persistLogEntry(type === 'critical_review' ? 'critical-review' : 'analysis', selectedModel, response.usage, durationMs);
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return;
            }
            console.error('Analysis failed:', error);
            setErrorMessage(error instanceof Error ? error.message : 'Analysis failed.');
        } finally {
            setIsPolishing(false);
            abortControllerRef.current = null;
        }
    }, [isImageOnlyModel, selectedModel, cancelAIOperation, getSourceTextForAI, setErrorMessage, addAnalysisArtifact, setShowAnalysisViewer, updateCost, setActiveLogId]);

    const handleQuickSend = useCallback((promptId?: string) => {
        setErrorMessage(null);
        const idToUse = promptId || activePromptId;
        const prompt = getPrompt(idToUse);

        // Check if this is an image mode prompt
        if (prompt?.isImageMode) {
            const editorContent = previewTextRef.current?.trim() || '';
            if (editorContent) {
                handleImageGenerationRef.current(editorContent);
            } else {
                setErrorMessage('Please enter an image description in the editor.');
            }
            return;
        }

        // Check for task mismatch: trying to use a text task on an image-only model
        if (isImageOnlyModel(selectedModel)) {
            setErrorMessage(IMAGE_ONLY_MODEL_ERROR);
            return;
        }

        const textarea = previewTextareaRef.current?.getTextarea();
        if (!textarea) return;

        // Auto-baseline: Ensure originalText is set to current editor content before AI operation
        // This ensures diff view has a proper baseline to compare against
        if (previewTextRef.current && (!originalTextRef.current || originalTextRef.current.trim() === '')) {
            setOriginalText(previewTextRef.current);
        }

        const { selectionStart, selectionEnd } = textarea;

        // If no text is selected, check for frozen selection
        if (selectionStart === selectionEnd) {
            if (frozenSelection) {
                startOperation(frozenSelection.start, frozenSelection.end, idToUse)
                    .then(() => setFrozenSelection(null))
                    .catch(e => console.error('Failed to start frozen selection operation:', e));
                return;
            } else if (previewTextRef.current) {
                startOperation(0, previewTextRef.current.length, idToUse)
                    .catch(e => console.error('Failed to start full-text quick send:', e));
                return;
            }
            return;
        }

        const { start, end } = expandToWordBoundaries(
            selectionStart,
            selectionEnd,
            previewTextRef.current
        );

        if (start !== end) {
            startOperation(start, end, idToUse)
                .then(() => setFrozenSelection(null))
                .catch(e => console.error('Failed to start selection quick send:', e));
        }
    }, [previewTextRef, startOperation, previewTextareaRef, activePromptId, frozenSelection, setFrozenSelection, getPrompt, setErrorMessage, originalTextRef, setOriginalText, isImageOnlyModel, selectedModel]);

    const handleFactCheck = useCallback(async () => {
        // Check for task mismatch: trying to use a text task on an image-only model
        if (isImageOnlyModel(selectedModel)) {
            setErrorMessage(IMAGE_ONLY_MODEL_ERROR);
            return;
        }

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
        try {
            const factCheckModels = resolveFactCheckModels(allAvailableModels);
            const { session, usage, stageUsage, models, isError, isCancelled, errorMessage } = await runFactCheck(
                sourceText,
                (stage) => setFactCheckProgress(stage),
                abortControllerRef.current.signal,
                {
                    extractionModel: factCheckModels.extraction,
                    verificationModel: factCheckModels.verification
                }
            );

            if (isCancelled) {
                return;
            }

            if (isError) {
                setErrorMessage(errorMessage || 'Fact check failed.');
                return;
            }

            setErrorMessage(null);

            if (usage) {
                const resolvedModels = models || factCheckModels;
                const extractionTokens = stageUsage?.extraction || { inputTokens: Math.round(usage.inputTokens * 0.2), outputTokens: Math.round(usage.outputTokens * 0.2) };
                const verificationTokens = stageUsage?.verification || { inputTokens: usage.inputTokens - extractionTokens.inputTokens, outputTokens: usage.outputTokens - extractionTokens.outputTokens };

                const sessionId = crypto.randomUUID();
                await persistLogEntry('fact-check-extraction', resolvedModels.extraction, extractionTokens, 0, sessionId);
                await persistLogEntry('fact-check-verification', resolvedModels.verification, verificationTokens, 0, sessionId);
            }

            const artifact = addAnalysisArtifact({
                type: 'fact_check',
                title: `Fact Check (${new Date().toLocaleTimeString()})`,
                content: session.report,
                modelId: factCheckModels.verification.id,
                modelName: factCheckModels.verification.name
            });
            if (artifact) {
                setShowAnalysisViewer(true);
            }
        } catch (error) {
            console.error('Fact-check run failed:', error);
            setErrorMessage(error instanceof Error ? error.message : 'Fact check failed.');
        } finally {
            setIsFactChecking(false);
            setFactCheckProgress('');
            abortControllerRef.current = null;
        }
    }, [cancelAIOperation, getSourceTextForAI, setErrorMessage, setFactCheckProgress, setIsFactChecking, setSessionCost, setActiveLogId, isImageOnlyModel, selectedModel, allAvailableModels, addAnalysisArtifact, setShowAnalysisViewer]);

    const handleReadAloud = useCallback(() => {
        if (isSpeaking) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
            return;
        }

        let textToSpeak = previewTextRef.current;
        const textarea = previewTextareaRef.current?.getTextarea();
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            if (start !== end) {
                textToSpeak = previewTextRef.current.substring(start, end);
            }
        }

        if (!textToSpeak.trim()) return;

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
    }, [isSpeaking, previewTextRef, previewTextareaRef, setIsSpeaking]);

    const handlePolishSelection = useCallback(async (polishMode: PolishMode) => {
        // Check for task mismatch: trying to use a text task on an image-only model
        if (isImageOnlyModel(selectedModel)) {
            setErrorMessage(IMAGE_ONLY_MODEL_ERROR);
            return;
        }

        const textarea = previewTextareaRef.current?.getTextarea();
        const originalTextAtStart = previewTextRef.current; // Snapshot text before async call
        let start = 0;
        let end = originalTextAtStart.length;
        let selectedText = originalTextAtStart;

        if (textarea) {
            const selStart = textarea.selectionStart;
            const selEnd = textarea.selectionEnd;
            if (selStart !== selEnd) {
                const expanded = expandToWordBoundaries(selStart, selEnd, originalTextAtStart);
                start = expanded.start;
                end = expanded.end;
                selectedText = originalTextAtStart.substring(start, end);
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
        try {
            const { results, usage, isError, isCancelled, errorMessage: aiError } = await polishMultipleRanges(
                [{ id: 'selection', text: selectedText }],
                polishMode,
                selectedModel,
                abortControllerRef.current.signal
            );
            const durationMs = Date.now() - startTime;

            if (isCancelled) {
                return;
            }

            if (isError) {
                setErrorMessage(aiError || 'AI polish failed.');
                return;
            }
            updateCost(usage);
            const taskName = polishMode === 'spelling' ? 'Spelling (Selection)'
                : polishMode === 'grammar' ? 'Grammar (Selection)'
                    : polishMode === 'prompt' ? 'Prompt Expansion (Selection)'
                        : 'Full Polish (Selection)';

            if (usage) {
                persistLogEntry(taskName, selectedModel, usage, durationMs);
            }

            if (results.length > 0) {
                const result = results[0].result;
                // Use originalTextAtStart snapshot to ensure indices match the text structure
                const newText = originalTextAtStart.slice(0, start) + result + originalTextAtStart.slice(end);

                setOriginalText(originalTextAtStart);
                setModifiedText(newText);
                performDiff(originalTextAtStart, newText);
                setMode(ViewMode.DIFF);
            }
        } catch (e) {
            console.error('Failed to run AI polish:', e);
            setErrorMessage(e instanceof Error ? e.message : 'An unexpected error occurred during AI polish.');
        } finally {
            setIsPolishing(false);
            abortControllerRef.current = null;
        }
    }, [previewTextareaRef, previewTextRef, cancelAIOperation, selectedModel, updateCost, setActiveLogId, setOriginalText, setModifiedText, performDiff, setMode, setErrorMessage, isImageOnlyModel]);

    const handleSaveAsPrompt = useCallback(() => {
        if (contextMenu?.selection) {
            setPendingPromptText(contextMenu.selection);
            setSavePromptDialogOpen(true);
            setContextMenu(null);
        }
    }, [contextMenu, setPendingPromptText, setSavePromptDialogOpen, setContextMenu]);

    const handleSavePromptSubmit = useCallback(async (prompt: Partial<AIPrompt>) => {
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

    // ========================================
    // Image Generation Handlers
    // ========================================

    /**
     * Find an image-capable model from the user's imported models
     */
    const findImageCapableModel = useCallback((): Model | null => {
        // Priority 1: Use the user-configured default image model if set and valid
        if (isImageCapable(selectedImageModel as Model & { modality?: string; capabilities?: string[] })) {
            return selectedImageModel;
        }

        // Priority 2: Check if current text model is image-capable
        if (isImageCapable(selectedModel as Model & { modality?: string; capabilities?: string[] })) {
            return selectedModel;
        }

        // Priority 3: Search through imported models
        for (const model of importedModels) {
            if (isImageCapable(model)) {
                return model;
            }
        }

        // Priority 4: Search through default models
        for (const model of MODELS) {
            if (isImageCapable(model)) {
                return model;
            }
        }

        return null;
    }, [selectedImageModel, selectedModel, importedModels]);

    /**
     * Handle image generation request
     */
    const handleImageGeneration = useCallback(async (prompt: string, base64Image?: string, skipExtraction = false) => {
        const imageModel = findImageCapableModel();

        if (!imageModel) {
            setErrorMessage(
                'No image generation model available. Please import an image model (e.g., FLUX, DALL-E) from the Model Manager.'
            );
            return;
        }

        // Extract the actual image prompt or use as-is
        const imagePrompt = skipExtraction ? prompt : extractImagePrompt(prompt);
        if (!imagePrompt.trim()) {
            setErrorMessage('Please provide a description for the image.');
            return;
        }

        // Store prompt for regeneration
        lastImagePromptRef.current = imagePrompt;

        // Get editor content as additional context
        const editorContent = previewTextRef.current?.trim() || '';

        setIsGeneratingImage(true);
        setGeneratedImage(null);
        setShowImageViewer(true);
        setErrorMessage(null);

        const startTime = Date.now();
        abortControllerRef.current = new AbortController();
        const response = await generateImage(
            imagePrompt,
            imageModel,
            editorContent,
            base64Image,
            abortControllerRef.current.signal
        );
        const durationMs = Date.now() - startTime;
        abortControllerRef.current = null;

        if (response.isCancelled) {
            setIsGeneratingImage(false);
            return;
        }

        if (response.isError || !response.imageData) {
            setErrorMessage(response.errorMessage || 'Image generation failed.');
            setIsGeneratingImage(false);
            return;
        }

        setGeneratedImage({
            data: response.imageData,
            prompt: imagePrompt
        });
        setIsGeneratingImage(false);

        // Log usage and cost
        if (response.usage) {
            persistLogEntry('image-generation', imageModel, response.usage, durationMs);
        }
    }, [findImageCapableModel, previewTextRef, setErrorMessage, setShowImageViewer, updateCost, setActiveLogId]);

    // Update ref after handleImageGeneration is defined
    React.useEffect(() => {
        handleImageGenerationRef.current = handleImageGeneration;
    }, [handleImageGeneration]);

    /**
     * Regenerate the last image with the same prompt, optionally with additional instructions
     */
    const handleImageRegenerate = useCallback(async (additionalInstructions?: string) => {
        const basePrompt = lastImagePromptRef.current;
        if (!basePrompt) return;

        // Combine base prompt with any new instructions
        let finalPrompt = basePrompt;
        let baseImage = undefined;

        if (additionalInstructions?.trim()) {
            finalPrompt = `${basePrompt}. Additional instructions: ${additionalInstructions.trim()}`;
            // If we have modification instructions, send the current image for context/editing
            baseImage = generatedImage?.data || undefined;
        }

        await handleImageGeneration(finalPrompt, baseImage, true);
    }, [handleImageGeneration, generatedImage]);

    /**
     * Save the generated image to disk
     */
    const handleImageSave = useCallback(async () => {
        if (!generatedImage) return;

        const filename = generateFilename(generatedImage.prompt);

        if (window.electron && window.electron.saveImage) {
            try {
                const savedPath = await window.electron.saveImage(
                    generatedImage.data,
                    filename
                );
                if (savedPath) {
                    console.log('[ImageGen] Saved to:', savedPath);
                }
            } catch (e) {
                console.error('[ImageGen] Save failed:', e);
                setErrorMessage('Failed to save image.');
            }
        } else {
            // Fallback: download via browser
            const link = document.createElement('a');
            link.href = generatedImage.data;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }, [generatedImage, setErrorMessage]);

    /**
     * Clear the generated image and close the viewer
     */
    const clearGeneratedImage = useCallback(() => {
        setGeneratedImage(null);
        setIsGeneratingImage(false);
        setShowImageViewer(false);
        lastImagePromptRef.current = '';
    }, [setShowImageViewer]);

    return (
        <AIContext.Provider value={{
            aiPrompts, builtInPrompts, customPrompts, getPrompt, createPrompt, updatePrompt, deletePrompt, resetBuiltIn, promptsLoading,
            hasStagedPromptChanges, sessionCreatedPromptCount, saveStagedPrompts, discardStagedPrompts,
            pendingOperations, startOperation, cancelAsyncOperations,
            isPolishing, isFactChecking, factCheckProgress, setFactCheckProgress,
            pendingPromptText, setPendingPromptText,
            activePromptId, setActivePromptId, setDefaultPrompt, activePrompt,
            selectedModel, setSelectedModel, setDefaultModel, selectedImageModel, setDefaultImageModel, sessionCost, setSessionCost, updateCost,
            handleAIEdit, handleFactCheck, handleLocalSpellCheck, handleReadAloud, cancelAIOperation,
            handleQuickSend, handlePromptPanelInstruction, handleAnalysisInstruction,
            handlePolishSelection, handleSaveAsPrompt, handleSavePromptSubmit, handleRate,
            // Image generation
            isGeneratingImage, generatedImage,
            handleImageGeneration, handleImageRegenerate, handleImageSave, clearGeneratedImage,
            // Analysis results
            analysisArtifacts, latestAnalysisArtifact, promptPanelUseAnalysisContext, setPromptPanelUseAnalysisContext, closeAnalysisViewer, openLatestAnalysisViewer
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
