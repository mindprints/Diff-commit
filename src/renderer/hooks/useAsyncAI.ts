import { useState, useCallback, useRef } from 'react';
import { polishMultipleRanges, polishMultipleRangesWithPrompt } from '../services/ai';
import { AIPrompt, PolishMode } from '../types';
import { Model } from '../constants/models';

/**
 * Represents a pending AI operation on a text range.
 */
export interface PendingOperation {
    id: string;
    originalStart: number;   // Position when request was sent
    originalEnd: number;
    originalText: string;    // Snapshot of selected text
    promptId: string;        // Which AI action
    status: 'pending' | 'completed' | 'error';
    result?: string;         // AI response when completed
    error?: string;          // Error message if failed
}

interface UseAsyncAIOptions {
    getText: () => string;
    setText: (text: string) => void;
    getModel: () => Model | undefined;
    getPrompt: (id: string) => AIPrompt | undefined;
    onCostUpdate: (usage: { inputTokens: number; outputTokens: number }) => void;
    onLog: (taskName: string, usage: { inputTokens: number; outputTokens: number }, durationMs: number) => void;
    onError: (message: string) => void;
    onDiffUpdate: (original: string, modified: string) => void;
}

/**
 * Hook for managing async parallel AI operations.
 * Allows users to:
 * - Select text → send to AI → continue working
 * - Multiple selections can be processing simultaneously
 * - Results apply as they return, adjusting positions for prior changes
 */
export function useAsyncAI({
    getText,
    setText,
    getModel,
    getPrompt,
    onCostUpdate,
    onLog,
    onError,
    onDiffUpdate,
}: UseAsyncAIOptions) {
    const [pendingOperations, setPendingOperations] = useState<Map<string, PendingOperation>>(new Map());
    const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

    let operationCounter = useRef(0);

    /**
     * Start a new AI operation on a text range.
     * Returns immediately - operation runs in background.
     */
    const startOperation = useCallback(async (
        start: number,
        end: number,
        promptId: string
    ): Promise<string | null> => {
        const model = getModel();
        if (!model) {
            onError('No AI model selected');
            return null;
        }

        const text = getText();
        const selectedText = text.substring(start, end);

        if (!selectedText.trim()) {
            onError('Please select some text first');
            return null;
        }

        // Generate unique operation ID
        const opId = `op_${Date.now()}_${operationCounter.current++}`;

        // Create abort controller for this operation
        const abortController = new AbortController();
        abortControllersRef.current.set(opId, abortController);

        // Add to pending operations
        const operation: PendingOperation = {
            id: opId,
            originalStart: start,
            originalEnd: end,
            originalText: selectedText,
            promptId,
            status: 'pending',
        };

        setPendingOperations(prev => new Map(prev).set(opId, operation));

        // Fire the request (don't await - let it run in background)
        processOperation(opId, operation, abortController.signal);

        return opId;
    }, [getText, getModel, onError]);

    /**
     * Process an AI operation (runs async in background).
     */
    const processOperation = async (
        opId: string,
        operation: PendingOperation,
        signal: AbortSignal
    ) => {
        const model = getModel();
        if (!model) return;

        const startTime = Date.now();

        try {
            // Get the prompt
            const prompt = getPrompt(operation.promptId);

            let results: { id: string; result: string }[];
            let usage: { inputTokens: number; outputTokens: number } | undefined;
            let isError = false;
            let isCancelled = false;
            let errorMessage: string | undefined;

            if (prompt) {
                // Use prompt-based polishing
                const response = await polishMultipleRangesWithPrompt(
                    [{ id: 'selection', text: operation.originalText }],
                    prompt,
                    model,
                    signal
                );
                results = response.results;
                usage = response.usage;
                isError = response.isError;
                isCancelled = response.isCancelled;
                errorMessage = response.errorMessage;
            } else {
                // Fallback to basic polish mode
                const polishMode = operation.promptId as PolishMode;
                const response = await polishMultipleRanges(
                    [{ id: 'selection', text: operation.originalText }],
                    polishMode,
                    model,
                    signal
                );
                results = response.results;
                usage = response.usage;
                isError = response.isError;
                isCancelled = response.isCancelled;
                errorMessage = response.errorMessage;
            }

            const durationMs = Date.now() - startTime;

            // If cancelled, just remove from pending
            if (isCancelled) {
                setPendingOperations(prev => {
                    const next = new Map(prev);
                    next.delete(opId);
                    return next;
                });
                return;
            }

            // Handle error
            if (isError) {
                setPendingOperations((prev: Map<string, PendingOperation>) => {
                    const next = new Map<string, PendingOperation>(prev);
                    const op = next.get(opId);
                    if (op) {
                        next.set(opId, {
                            id: op.id,
                            originalStart: op.originalStart,
                            originalEnd: op.originalEnd,
                            originalText: op.originalText,
                            promptId: op.promptId,
                            status: 'error' as const,
                            error: errorMessage,
                        });
                    }
                    return next;
                });
                onError(errorMessage || 'AI operation failed');
                return;
            }

            // Success - apply result
            if (results.length > 0 && usage) {
                const result = results[0].result;

                // Log usage
                onCostUpdate(usage);
                onLog(`${prompt?.name || operation.promptId} (Async)`, usage, durationMs);

                // Apply the result to the text
                applyResult(opId, result);
            }

        } catch (err) {
            // Handle unexpected errors
            if ((err as Error).name !== 'AbortError') {
                setPendingOperations((prev: Map<string, PendingOperation>) => {
                    const next = new Map<string, PendingOperation>(prev);
                    const op = next.get(opId);
                    if (op) {
                        next.set(opId, {
                            id: op.id,
                            originalStart: op.originalStart,
                            originalEnd: op.originalEnd,
                            originalText: op.originalText,
                            promptId: op.promptId,
                            status: 'error' as const,
                            error: (err as Error).message,
                        });
                    }
                    return next;
                });
                onError((err as Error).message);
            }
        } finally {
            // Clean up abort controller
            abortControllersRef.current.delete(opId);
        }
    };

    /**
     * Apply a completed operation's result to the text.
     * Adjusts positions based on any completed operations that came before.
     */
    const applyResult = useCallback((opId: string, result: string) => {
        setPendingOperations(prev => {
            const op = prev.get(opId);
            if (!op) return prev;

            // Calculate current positions based on completed operations
            let adjustedStart = op.originalStart;
            let adjustedEnd = op.originalEnd;

            // Adjust for any operations that completed before us and were before our position
            prev.forEach((otherOp, otherId) => {
                if (otherId !== opId && otherOp.status === 'completed' && otherOp.result !== undefined) {
                    if (otherOp.originalEnd <= op.originalStart) {
                        // This completed operation was before us - adjust our positions
                        const delta = otherOp.result.length - otherOp.originalText.length;
                        adjustedStart += delta;
                        adjustedEnd += delta;
                    }
                }
            });

            // Get current text and apply the change
            const currentText = getText();
            const newText = currentText.slice(0, adjustedStart) + result + currentText.slice(adjustedEnd);

            // Update the text
            setText(newText);

            // Trigger diff update
            const originalText = currentText; // The text before this edit
            onDiffUpdate(originalText, newText);

            // Mark this operation as completed
            const next = new Map(prev);
            const completedOp: PendingOperation = { ...op, status: 'completed', result };
            next.set(opId, completedOp);

            // Clean up completed operations after a delay
            setTimeout(() => {
                setPendingOperations(current => {
                    const updated = new Map(current);
                    updated.delete(opId);
                    return updated;
                });
            }, 2000);

            return next;
        });
    }, [getText, setText, onDiffUpdate]);

    /**
     * Cancel a specific pending operation.
     */
    const cancelOperation = useCallback((opId: string) => {
        const controller = abortControllersRef.current.get(opId);
        if (controller) {
            controller.abort();
        }
        setPendingOperations(prev => {
            const next = new Map(prev);
            next.delete(opId);
            return next;
        });
    }, []);

    /**
     * Cancel all pending operations.
     */
    const cancelAllOperations = useCallback(() => {
        abortControllersRef.current.forEach(controller => controller.abort());
        abortControllersRef.current.clear();
        setPendingOperations(new Map());
    }, []);

    /**
     * Check if a position is within a pending operation range.
     * Used to prevent editing within ranges that have pending AI operations.
     */
    const isPositionLocked = useCallback((position: number): boolean => {
        for (const op of pendingOperations.values()) {
            if (op.status === 'pending' && position >= op.originalStart && position <= op.originalEnd) {
                return true;
            }
        }
        return false;
    }, [pendingOperations]);

    /**
     * Get all pending operations as an array.
     */
    const getPendingOperations = useCallback((): PendingOperation[] => {
        return Array.from(pendingOperations.values());
    }, [pendingOperations]);

    /**
     * Check if there are any pending operations.
     */
    const hasPendingOperations = useCallback((): boolean => {
        return pendingOperations.size > 0;
    }, [pendingOperations]);

    return {
        pendingOperations: getPendingOperations(),
        startOperation,
        cancelOperation,
        cancelAllOperations,
        isPositionLocked,
        hasPendingOperations,
    };
}
