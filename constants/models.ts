
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
        id: "deepseek/deepseek-v3.2", // Note: The file said v3.2 but typically IDs form is model_provider/model_name. I will use the ID from the md file if possible. The md says "deepseek/deepseek-v3.2". Wait, I should double check the exact IDs from the md file carefully.
        // The md says: ### [deepseek](https://openrouter.ai/deepseek)/deepseek-v3.2
        // So ID is "deepseek/deepseek-v3.2" likely.
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
    }
];

export const DEFAULT_MODEL = MODELS[0];
