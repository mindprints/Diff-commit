
export interface Model {
    id: string;
    name: string;
    provider: string;
    contextWindow: number;
    inputPrice: number; // Price per million tokens
    outputPrice: number; // Price per million tokens
}

export const MODELS: Model[] = [
    {
        id: "deepseek/deepseek-v3.2",
        name: "DeepSeek v3.2",
        provider: "DeepSeek",
        contextWindow: 163840,
        inputPrice: 0.26,
        outputPrice: 0.39
    },
    {
        id: "moonshotai/kimi-k2-thinking",
        name: "Kimi K2 Thinking",
        provider: "Moonshot AI",
        contextWindow: 262144,
        inputPrice: 0.45,
        outputPrice: 2.35
    },
    {
        id: "x-ai/grok-4.1-fast", // md says: ### [x-ai](...)/grok-4.1-fast. Assuming ID is associated with the provider in the link.
        name: "Grok 4.1 Fast",
        provider: "xAI",
        contextWindow: 2000000,
        inputPrice: 0.20,
        outputPrice: 0.50
    },
    {
        id: "openai/gpt-oss-120b",
        name: "GPT-OSS 120B",
        provider: "OpenAI",
        contextWindow: 131072,
        inputPrice: 0.039,
        outputPrice: 0.19
    },
    {
        id: "minimax/minimax-m2",
        name: "MiniMax M2",
        provider: "MiniMax",
        contextWindow: 204800,
        inputPrice: 0.255,
        outputPrice: 1.02
    },
    {
        id: "z-ai/glm-4.6",
        name: "GLM 4.6",
        provider: "Z-AI",
        contextWindow: 202752,
        inputPrice: 0.40,
        outputPrice: 1.75
    },
    {
        id: "google/gemini-3-pro-preview",
        name: "Gemini 3 Pro Preview",
        provider: "Google",
        contextWindow: 1048576,
        inputPrice: 2.00,
        outputPrice: 12.00
    },
    {
        id: "anthropic/claude-haiku-4.5",
        name: "Claude Haiku 4.5",
        provider: "Anthropic",
        contextWindow: 200000,
        inputPrice: 1.00,
        outputPrice: 5.00
    },
    {
        id: "amazon/nova-2-lite-v1",
        name: "Nova 2 Lite v1",
        provider: "Amazon",
        contextWindow: 1000000,
        inputPrice: 0.30,
        outputPrice: 2.50
    },
    {
        id: "google/gemini-3-flash-preview",
        name: "Gemini 3 Flash Preview",
        provider: "Google",
        contextWindow: 1000000,
        inputPrice: 0.50,
        outputPrice: 3.00
    },
    {
        id: "perplexity/sonar-pro",
        name: "Perplexity Sonar Pro",
        provider: "Perplexity",
        contextWindow: 200000,
        inputPrice: 3.00,
        outputPrice: 15.00
    }
];

export const DEFAULT_MODEL = MODELS[0];

/**
 * Returns a cost tier indicator ($ to $$$$) based on average price per million tokens
 * $    = < $0.50 (budget)
 * $$   = $0.50 - $2.00 (standard)
 * $$$  = $2.00 - $5.00 (premium)
 * $$$$ = > $5.00 (expensive)
 */
export function getCostTier(model: Model): string {
    const avgPrice = (model.inputPrice + model.outputPrice) / 2;
    if (avgPrice < 0.50) return '$';
    if (avgPrice < 2.00) return '$$';
    if (avgPrice < 5.00) return '$$$';
    return '$$$$';
}

/**
 * Returns a CSS color class based on cost tier
 */
export function getCostTierColor(model: Model): string {
    const tier = getCostTier(model);
    switch (tier) {
        case '$': return 'text-green-600 dark:text-green-400';
        case '$$': return 'text-yellow-600 dark:text-yellow-400';
        case '$$$': return 'text-orange-600 dark:text-orange-400';
        case '$$$$': return 'text-red-600 dark:text-red-400';
        default: return 'text-gray-600 dark:text-gray-400';
    }
}
