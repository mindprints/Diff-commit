import { useState, useEffect, useCallback } from 'react';
import { AIPrompt } from '../types';
import { DEFAULT_PROMPTS, generatePromptId, getPromptById } from '../constants/prompts';
import * as storage from '../services/promptStorage';

/**
 * Hook for managing AI prompts with CRUD operations.
 * Handles loading from storage (Electron Store or localStorage) and provides
 * methods for creating, updating, and deleting prompts.
 */
export function usePrompts() {
    const [prompts, setPrompts] = useState<AIPrompt[]>([]);
    const [persistedPrompts, setPersistedPrompts] = useState<AIPrompt[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hasStagedChanges, setHasStagedChanges] = useState(false);
    const [sessionCreatedPromptIds, setSessionCreatedPromptIds] = useState<Set<string>>(new Set());

    // Load prompts on mount
    useEffect(() => {
        loadPrompts();
    }, []);

    const loadPrompts = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const loaded = await storage.getPrompts();

            // SYNC LOGIC: 
            // 1. Keep all custom prompts
            const customPrompts = loaded.filter(p => !p.isBuiltIn);

            // 2. Use fresh DEFAULT_PROMPTS for built-ins (ensures new IDs like spelling_local existence)
            // This replaces old built-ins (like 'spelling') with new definitions
            const merged = [...DEFAULT_PROMPTS, ...customPrompts];

            // 3. Sort by order
            merged.sort((a, b) => a.order - b.order);

            // 4. Save merged state if it differs from loaded (e.g. first migration)
            // We just save always to be safe and ensure consistency
            await storage.savePrompts(merged);

            setPrompts(merged);
            setPersistedPrompts(merged);
            setHasStagedChanges(false);
            setSessionCreatedPromptIds(new Set());
        } catch (err) {
            console.error('Failed to load prompts:', err);
            setError('Failed to load prompts');
            setPrompts(DEFAULT_PROMPTS);
            setPersistedPrompts(DEFAULT_PROMPTS);
            setHasStagedChanges(false);
            setSessionCreatedPromptIds(new Set());
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Get a single prompt by ID.
     * Falls back to 'polish' if not found.
     */
    const getPrompt = useCallback((id: string): AIPrompt => {
        return getPromptById(prompts, id);
    }, [prompts]);

    /**
     * Create a new custom prompt.
     */
    const createPrompt = useCallback(async (data: Omit<AIPrompt, 'id' | 'isBuiltIn' | 'order'>): Promise<AIPrompt> => {
        const newPrompt: AIPrompt = {
            ...data,
            id: generatePromptId(),
            isBuiltIn: false,
            order: Math.max(...prompts.map(p => p.order), 0) + 1,
        };

        setPrompts(prev => [...prev, newPrompt].sort((a, b) => a.order - b.order));
        setHasStagedChanges(true);
        setSessionCreatedPromptIds(prev => {
            const next = new Set(prev);
            next.add(newPrompt.id);
            return next;
        });
        return newPrompt;
    }, [prompts]);

    /**
     * Update an existing prompt.
     */
    const updatePrompt = useCallback(async (id: string, updates: Partial<AIPrompt>): Promise<void> => {
        setPrompts(prev => {
            const index = prev.findIndex(p => p.id === id);
            if (index === -1) {
                throw new Error(`Prompt with ID "${id}" not found`);
            }
            const next = [...prev];
            const { isBuiltIn, ...safeUpdates } = updates;
            next[index] = { ...next[index], ...safeUpdates };
            return next;
        });
        setHasStagedChanges(true);
    }, []);

    /**
     * Delete a custom prompt (cannot delete built-in prompts).
     */
    const deletePrompt = useCallback(async (id: string): Promise<void> => {
        const prompt = prompts.find(p => p.id === id);
        if (prompt?.isBuiltIn) {
            throw new Error('Cannot delete built-in prompts');
        }

        setPrompts(prev => prev.filter(p => p.id !== id));
        setHasStagedChanges(true);
        setSessionCreatedPromptIds(prev => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, [prompts]);

    /**
     * Reset a built-in prompt to its default values.
     */
    const resetBuiltIn = useCallback(async (id: string): Promise<void> => {
        const defaultPrompt = DEFAULT_PROMPTS.find(p => p.id === id);
        if (!defaultPrompt) {
            throw new Error(`No default prompt found for ID: ${id}`);
        }
        setPrompts(prev => prev.map(p => p.id === id ? { ...defaultPrompt } : p));
        setHasStagedChanges(true);
    }, []);

    /**
     * Reset all prompts to defaults (removes all custom prompts).
     */
    const resetAll = useCallback(async (): Promise<void> => {
        setPrompts(DEFAULT_PROMPTS);
        setHasStagedChanges(true);
        setSessionCreatedPromptIds(new Set());
    }, []);

    const saveStagedChanges = useCallback(async (): Promise<void> => {
        try {
            await storage.savePrompts(prompts);
            setPersistedPrompts(prompts);
            setHasStagedChanges(false);
            setSessionCreatedPromptIds(new Set());
        } catch (err) {
            console.error('Failed to save staged prompts:', err);
            throw err;
        }
    }, [prompts]);

    const discardStagedChanges = useCallback((): void => {
        setPrompts(persistedPrompts);
        setHasStagedChanges(false);
        setSessionCreatedPromptIds(new Set());
    }, [persistedPrompts]);

    /**
     * Get prompts sorted by order for display.
     */
    const sortedPrompts = [...prompts].sort((a, b) => a.order - b.order);

    /**
     * Get only built-in prompts.
     */
    const builtInPrompts = sortedPrompts.filter(p => p.isBuiltIn);

    /**
     * Get only custom prompts.
     */
    const customPrompts = sortedPrompts.filter(p => !p.isBuiltIn);

    return {
        // State
        prompts: sortedPrompts,
        builtInPrompts,
        customPrompts,
        isLoading,
        error,

        // CRUD operations
        getPrompt,
        createPrompt,
        updatePrompt,
        deletePrompt,
        resetBuiltIn,
        resetAll,
        saveStagedChanges,
        discardStagedChanges,
        hasStagedChanges,
        sessionCreatedPromptCount: sessionCreatedPromptIds.size,

        // Reload
        reload: loadPrompts,
    };
}
