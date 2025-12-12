import { AIPrompt } from '../types';
import { DEFAULT_PROMPTS } from '../constants/prompts';

const STORAGE_KEY = 'ai-prompts';

/**
 * Prompt storage service with automatic environment detection.
 * Uses Electron Store in desktop app, localStorage in browser.
 */

/**
 * Check if running in Electron with prompt APIs available.
 */
function hasElectronPromptAPI(): boolean {
    return !!(window.electron?.getPrompts && window.electron?.savePrompts);
}

/**
 * Get all prompts from storage.
 * Returns default prompts if none are stored.
 */
export async function getPrompts(): Promise<AIPrompt[]> {
    try {
        if (hasElectronPromptAPI()) {
            const prompts = await window.electron!.getPrompts!();
            if (prompts && prompts.length > 0) {
                return prompts;
            }
            // First run - return and save defaults
            await savePrompts(DEFAULT_PROMPTS);
            return DEFAULT_PROMPTS;
        }

        // Browser fallback - localStorage
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }

        // First run - store defaults
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PROMPTS));
        return DEFAULT_PROMPTS;
    } catch (error) {
        console.error('Failed to load prompts:', error);
        return DEFAULT_PROMPTS;
    }
}

/**
 * Save all prompts to storage.
 */
export async function savePrompts(prompts: AIPrompt[]): Promise<void> {
    try {
        if (hasElectronPromptAPI()) {
            await window.electron!.savePrompts!(prompts);
            return;
        }

        // Browser fallback - localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
    } catch (error) {
        console.error('Failed to save prompts:', error);
        throw error;
    }
}

/**
 * Reset a single built-in prompt to its default values.
 * Returns the updated prompts array.
 */
export async function resetBuiltInPrompt(id: string): Promise<AIPrompt[]> {
    const currentPrompts = await getPrompts();
    const defaultPrompt = DEFAULT_PROMPTS.find(p => p.id === id);

    if (!defaultPrompt) {
        throw new Error(`No default prompt found for ID: ${id}`);
    }

    const updatedPrompts = currentPrompts.map(p =>
        p.id === id ? { ...defaultPrompt } : p
    );

    await savePrompts(updatedPrompts);
    return updatedPrompts;
}

/**
 * Reset all prompts to defaults (removes custom prompts).
 */
export async function resetAllPrompts(): Promise<AIPrompt[]> {
    await savePrompts(DEFAULT_PROMPTS);
    return DEFAULT_PROMPTS;
}

/**
 * Add a new custom prompt.
 * Returns the updated prompts array.
 */
export async function addPrompt(prompt: AIPrompt): Promise<AIPrompt[]> {
    const currentPrompts = await getPrompts();

    // Ensure unique ID
    if (currentPrompts.some(p => p.id === prompt.id)) {
        throw new Error(`Prompt with ID "${prompt.id}" already exists`);
    }

    // Add with order at the end
    const maxOrder = Math.max(...currentPrompts.map(p => p.order), 0);
    const newPrompt = { ...prompt, order: maxOrder + 1, isBuiltIn: false };

    const updatedPrompts = [...currentPrompts, newPrompt];
    await savePrompts(updatedPrompts);
    return updatedPrompts;
}

/**
 * Update an existing prompt.
 * Returns the updated prompts array.
 */
export async function updatePrompt(id: string, updates: Partial<AIPrompt>): Promise<AIPrompt[]> {
    const currentPrompts = await getPrompts();
    const index = currentPrompts.findIndex(p => p.id === id);

    if (index === -1) {
        throw new Error(`Prompt with ID "${id}" not found`);
    }

    // Don't allow changing isBuiltIn
    const { isBuiltIn, ...safeUpdates } = updates;

    const updatedPrompts = [...currentPrompts];
    updatedPrompts[index] = { ...updatedPrompts[index], ...safeUpdates };

    await savePrompts(updatedPrompts);
    return updatedPrompts;
}

/**
 * Delete a custom prompt (cannot delete built-in prompts).
 * Returns the updated prompts array.
 */
export async function deletePrompt(id: string): Promise<AIPrompt[]> {
    const currentPrompts = await getPrompts();
    const prompt = currentPrompts.find(p => p.id === id);

    if (!prompt) {
        throw new Error(`Prompt with ID "${id}" not found`);
    }

    if (prompt.isBuiltIn) {
        throw new Error('Cannot delete built-in prompts');
    }

    const updatedPrompts = currentPrompts.filter(p => p.id !== id);
    await savePrompts(updatedPrompts);
    return updatedPrompts;
}
