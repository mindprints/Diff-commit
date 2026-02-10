/**
 * OpenRouter API Service
 * Handles fetching models and pricing from OpenRouter
 */

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

/**
 * Model data as returned by OpenRouter API
 */
export interface OpenRouterModel {
    id: string;
    name: string;
    description?: string;
    context_length: number;
    pricing: {
        prompt: string;      // Price per token as string (e.g., "0.0000003")
        completion: string;  // Price per token as string
    };
    architecture?: {
        modality: string;    // e.g., "text->text", "text+image->text"
        tokenizer?: string;
        instruct_type?: string;
    };
    top_provider?: {
        max_completion_tokens?: number;
        is_moderated?: boolean;
    };
    supported_parameters?: string[];  // e.g., ['tools', 'temperature', 'top_p']
    capabilities?: string[];  // e.g., ['image-generation', 'text+image']
    supported_generation_methods?: string[];  // e.g., ['chat']
}

/**
 * Parsed model data for our application
 */
export interface ParsedModel {
    id: string;
    name: string;
    provider: string;
    contextWindow: number;
    inputPrice: number;   // Price per million tokens
    outputPrice: number;  // Price per million tokens
    modality?: string;    // e.g., "text->text", "text+image->text"
    description?: string;
    supportedParams?: string[];  // e.g., ['tools', 'temperature', 'top_p']
    capabilities?: string[];  // e.g., ['image-generation']
}

interface OpenRouterPingResponse {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
}

/**
 * Extract provider name from model ID
 * e.g., "anthropic/claude-3-opus" -> "Anthropic"
 */
function extractProvider(modelId: string): string {
    const parts = modelId.split('/');
    if (parts.length < 2) return 'Unknown';

    const providerSlug = parts[0];
    // Capitalize and clean up provider name
    const providerMap: Record<string, string> = {
        'openai': 'OpenAI',
        'anthropic': 'Anthropic',
        'google': 'Google',
        'meta-llama': 'Meta',
        'mistralai': 'Mistral',
        'cohere': 'Cohere',
        'deepseek': 'DeepSeek',
        'perplexity': 'Perplexity',
        'x-ai': 'xAI',
        'amazon': 'Amazon',
        'microsoft': 'Microsoft',
        'nvidia': 'NVIDIA',
        'qwen': 'Qwen',
        'moonshotai': 'Moonshot AI',
        'minimax': 'MiniMax',
    };

    return providerMap[providerSlug.toLowerCase()] ||
        providerSlug.charAt(0).toUpperCase() + providerSlug.slice(1);
}

/**
 * Parse modality string - keep full modality for capability detection
 * e.g., "text+image->text" stays as "text+image->text"
 */
function parseModality(modality?: string): string {
    if (!modality) return 'text->text';
    return modality.toLowerCase();
}

/**
 * Convert per-token price string to per-million-tokens number
 */
function tokenPriceToMillionPrice(pricePerToken: string): number {
    const price = parseFloat(pricePerToken);
    if (isNaN(price)) return 0;
    return price * 1_000_000;
}

/**
 * Convert OpenRouter model to our ParsedModel format
 */
function parseOpenRouterModel(model: OpenRouterModel): ParsedModel {
    return {
        id: model.id,
        name: model.name,
        provider: extractProvider(model.id),
        contextWindow: model.context_length,
        inputPrice: tokenPriceToMillionPrice(model.pricing.prompt),
        outputPrice: tokenPriceToMillionPrice(model.pricing.completion),
        modality: parseModality(model.architecture?.modality),
        description: model.description,
        supportedParams: model.supported_parameters,
        capabilities: model.capabilities,
    };
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

    return models.map(parseOpenRouterModel);
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
        inputPrice: tokenPriceToMillionPrice(model.pricing.prompt),
        outputPrice: tokenPriceToMillionPrice(model.pricing.completion),
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

    const payload = {
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

/**
 * Check if model supports vision (image input)
 */
export function supportsVision(modality?: string): boolean {
    // Check INPUT part (before ->) for image capability
    const inputPart = modality?.split('->')[0] || '';
    return inputPart.includes('image');
}

/**
 * Check if model supports audio input
 */
export function supportsAudio(modality?: string): boolean {
    // Check INPUT part (before ->) for audio capability
    const inputPart = modality?.split('->')[0] || '';
    return inputPart.includes('audio');
}

/**
 * Check if model supports tool/function calling
 */
export function supportsTools(supportedParams?: string[]): boolean {
    return supportedParams?.includes('tools') ?? false;
}

/**
 * Check if model supports image generation
 * Priority: capabilities array > modality output > name/ID keywords
 */
export function supportsImageGeneration(
    modality?: string,
    modelId?: string,
    modelName?: string,
    capabilities?: string[]
): boolean {
    // 1. Check capabilities array (most reliable)
    if (capabilities && capabilities.length > 0) {
        const capLower = capabilities.map(c => c.toLowerCase());
        if (capLower.some(c => c.includes('image-generation') || c.includes('image') || c === 'images')) {
            return true;
        }
    }

    // 2. Check if output side of modality includes image
    // Format is usually "input->output" e.g., "text->image"
    const outputPart = modality?.split('->')[1] || '';
    if (outputPart.includes('image')) return true;

    // 3. Fallback: check model name and ID for image generation keywords
    const lowerName = (modelName || '').toLowerCase();
    const lowerId = (modelId || '').toLowerCase();
    const combined = lowerName + ' ' + lowerId;

    // Known image generation model patterns
    const imageGenKeywords = [
        'image', 'flux', 'dall-e', 'dalle', 'stable-diffusion', 'sd-', 'sdxl',
        'midjourney', 'imagen', 'ideogram', 'playground', 'kandinsky',
        'dreamshaper', 'deliberate', 'proteus', 'juggernaut'
    ];

    return imageGenKeywords.some(kw => combined.includes(kw));
}

/**
 * Check if model supports file/PDF input
 * Models with vision typically can handle PDFs via OpenRouter's PDF plugin
 */
export function supportsFileInput(modality?: string, supportedParams?: string[]): boolean {
    // Vision models can typically handle PDFs through OpenRouter's PDF plugin
    // Also check for 'file' in supportedParams if OpenRouter adds it
    return supportsVision(modality) || (supportedParams?.includes('file') ?? false);
}

/**
 * Check if model likely supports web/search retrieval.
 * Uses capabilities, supported params, and model naming heuristics.
 */
export function supportsSearchCapability(
    modelId?: string,
    modelName?: string,
    capabilities?: string[],
    supportedParams?: string[]
): boolean {
    const capValues = (capabilities || []).map((c) => c.toLowerCase());
    const paramValues = (supportedParams || []).map((p) => p.toLowerCase());

    if (capValues.some((c) => c.includes('search') || c.includes('web') || c.includes('retrieval') || c.includes('browse'))) {
        return true;
    }

    if (paramValues.some((p) => p.includes('search') || p.includes('web') || p.includes('browse') || p.includes('retrieval'))) {
        return true;
    }

    const combined = `${modelId || ''} ${modelName || ''}`.toLowerCase();
    const keywords = ['sonar', 'perplexity', 'search', 'web-search', 'web search', 'retrieval', 'browse'];
    return keywords.some((kw) => combined.includes(kw));
}
