/**
 * OpenRouter API Service
 * Handles fetching models and pricing from OpenRouter
 */

import {
    normalizeOpenRouterModel,
    supportsAudio,
    supportsFileInput,
    supportsImageGeneration,
    supportsSearchCapability,
    supportsTools,
    supportsVision,
    tokenPriceToMillionPrice,
    type OpenRouterModel,
    type ParsedModel,
} from '../../shared/openRouterModels';
import { ChatCompletionPayload } from '../electron';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

export type { OpenRouterModel, ParsedModel };
export {
    supportsVision,
    supportsAudio,
    supportsTools,
    supportsImageGeneration,
    supportsFileInput,
    supportsSearchCapability,
};

interface OpenRouterPingResponse {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
}

/**
 * Fetch all available models from OpenRouter
 * In Electron: Uses IPC to main process (API key stays secure)
 * In browser: Falls back to VITE_OPENROUTER_API_KEY for development
 */
export async function fetchOpenRouterModels(): Promise<ParsedModel[]> {
    // Use IPC bridge in Electron environment
    if (typeof window !== 'undefined' && window.electron?.openRouter) {
        return window.electron.openRouter.fetchModels();
    }

    // Browser fallback for development
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error('OpenRouter API key not configured. Run in Electron or set VITE_OPENROUTER_API_KEY.');
    }

    const response = await fetch(`${OPENROUTER_API_BASE}/models`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const models: OpenRouterModel[] = data.data || [];
    return models.map(normalizeOpenRouterModel);
}

/**
 * Fetch pricing for a specific model
 * In Electron: Uses IPC to main process (API key stays secure)
 * In browser: Falls back to VITE_OPENROUTER_API_KEY for development
 */
export async function fetchModelPricing(
    modelId: string
): Promise<{ inputPrice: number; outputPrice: number }> {
    // Use IPC bridge in Electron environment
    if (typeof window !== 'undefined' && window.electron?.openRouter) {
        return window.electron.openRouter.fetchPricing(modelId);
    }

    // Browser fallback for development
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error('OpenRouter API key not configured. Run in Electron or set VITE_OPENROUTER_API_KEY.');
    }

    const response = await fetch(`${OPENROUTER_API_BASE}/models`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const models: OpenRouterModel[] = data.data || [];
    const model = models.find(m => m.id === modelId);

    if (!model) {
        throw new Error(`Model not found: ${modelId}`);
    }

    return {
        inputPrice: tokenPriceToMillionPrice(model.pricing?.prompt),
        outputPrice: tokenPriceToMillionPrice(model.pricing?.completion),
    };
}

/**
 * Send a lightweight ping request to verify a model is reachable.
 * Returns round-trip latency and a simple response snippet.
 */
export async function pingModel(modelId: string): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    if (!modelId) {
        throw new Error('Model ID is required');
    }

    const payload: ChatCompletionPayload = {
        model: modelId,
        messages: [{ role: 'user', content: 'Reply with only: PONG' }],
        temperature: 0,
    };

    const start = performance.now();

    if (typeof window !== 'undefined' && window.electron?.openRouter?.chatCompletions) {
        const data = await window.electron.openRouter.chatCompletions(payload) as OpenRouterPingResponse;
        const latencyMs = Math.round(performance.now() - start);
        const message = data.choices?.[0]?.message?.content?.toString().trim() || 'No response content';
        return { ok: true, latencyMs, message };
    }

    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error('OpenRouter API key not configured. Run in Electron or set VITE_OPENROUTER_API_KEY.');
    }

    const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    const latencyMs = Math.round(performance.now() - start);
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as OpenRouterPingResponse;
    const message = data.choices?.[0]?.message?.content?.toString().trim() || 'No response content';
    return { ok: true, latencyMs, message };
}

