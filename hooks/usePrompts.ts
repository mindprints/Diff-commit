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
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
        } catch (err) {
            console.error('Failed to load prompts:', err);
            setError('Failed to load prompts');
            setPrompts(DEFAULT_PROMPTS);
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

        try {
            const updated = await storage.addPrompt(newPrompt);
            setPrompts(updated);
            return newPrompt;
        } catch (err) {
            console.error('Failed to create prompt:', err);
            throw err;
        }
    }, [prompts]);

    /**
     * Update an existing prompt.
     */
    const updatePrompt = useCallback(async (id: string, updates: Partial<AIPrompt>): Promise<void> => {
        try {
            const updated = await storage.updatePrompt(id, updates);
            setPrompts(updated);
        } catch (err) {
            console.error('Failed to update prompt:', err);
            throw err;
        }
    }, []);

    /**
     * Delete a custom prompt (cannot delete built-in prompts).
     */
    const deletePrompt = useCallback(async (id: string): Promise<void> => {
        const prompt = prompts.find(p => p.id === id);
        if (prompt?.isBuiltIn) {
            throw new Error('Cannot delete built-in prompts');
        }

        try {
            const updated = await storage.deletePrompt(id);
            setPrompts(updated);
        } catch (err) {
            console.error('Failed to delete prompt:', err);
            throw err;
        }
    }, [prompts]);

    /**
     * Reset a built-in prompt to its default values.
     */
    const resetBuiltIn = useCallback(async (id: string): Promise<void> => {
        try {
            const updated = await storage.resetBuiltInPrompt(id);
            setPrompts(updated);
        } catch (err) {
            console.error('Failed to reset prompt:', err);
            throw err;
        }
    }, []);

    /**
     * Reset all prompts to defaults (removes all custom prompts).
     */
    const resetAll = useCallback(async (): Promise<void> => {
        try {
            const updated = await storage.resetAllPrompts();
            setPrompts(updated);
        } catch (err) {
            console.error('Failed to reset all prompts:', err);
            throw err;
        }
    }, []);

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

        // Reload
        reload: loadPrompts,
    };
}
