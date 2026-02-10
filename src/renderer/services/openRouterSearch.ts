export type OpenRouterSearchMode = 'off' | 'auto' | 'online_suffix' | 'web_plugin';

const FACTCHECK_SEARCH_MODE_KEY = 'diff-commit-factcheck-search-mode';

export interface OpenRouterPlugin {
    id: string;
    [key: string]: unknown;
}

export interface OpenRouterChatPayloadWithPlugins {
    model: string;
    messages: Array<{ role: string; content: unknown }>;
    temperature?: number;
    response_format?: unknown;
    generation_config?: unknown;
    plugins?: OpenRouterPlugin[];
}

export function isNativeSearchModel(modelId: string): boolean {
    const normalized = modelId.toLowerCase();
    return (
        normalized.startsWith('perplexity/sonar') ||
        (normalized.startsWith('google/gemini') && normalized.includes('grounding'))
    );
}

function ensureOnlineSuffix(modelId: string): string {
    return modelId.endsWith(':online') ? modelId : `${modelId}:online`;
}

export function getFactCheckSearchMode(): OpenRouterSearchMode {
    try {
        const stored = localStorage.getItem(FACTCHECK_SEARCH_MODE_KEY);
        if (stored === 'off' || stored === 'auto' || stored === 'online_suffix' || stored === 'web_plugin') {
            return stored;
        }
    } catch (error) {
        console.warn('[SearchMode] Failed to read fact-check search mode:', error);
    }
    return 'off';
}

export function setFactCheckSearchMode(mode: OpenRouterSearchMode): void {
    localStorage.setItem(FACTCHECK_SEARCH_MODE_KEY, mode);
}

export function applySearchModeToPayload(
    payload: OpenRouterChatPayloadWithPlugins,
    mode: OpenRouterSearchMode
): OpenRouterChatPayloadWithPlugins {
    if (mode === 'off') {
        return payload;
    }

    if (mode === 'auto') {
        if (isNativeSearchModel(payload.model)) {
            return payload;
        }
        return { ...payload, model: ensureOnlineSuffix(payload.model) };
    }

    if (mode === 'online_suffix') {
        return { ...payload, model: ensureOnlineSuffix(payload.model) };
    }

    const existingPlugins = Array.isArray(payload.plugins) ? payload.plugins : [];
    const hasWebPlugin = existingPlugins.some((plugin) => plugin?.id === 'web');
    if (hasWebPlugin) {
        return payload;
    }

    return {
        ...payload,
        plugins: [...existingPlugins, { id: 'web', max_results: 5 }],
    };
}
