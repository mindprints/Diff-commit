import { describe, expect, it } from 'vitest';
import {
    extractProvider,
    normalizeModality,
    normalizeOpenRouterModel,
    supportsAudio,
    supportsFileInput,
    supportsImageGeneration,
    supportsSearchCapability,
    supportsTools,
    supportsVision,
    tokenPriceToMillionPrice,
} from './openRouterModels';

describe('openRouterModels', () => {
    it('extracts known provider names', () => {
        expect(extractProvider('openai/gpt-4.1')).toBe('OpenAI');
        expect(extractProvider('z-ai/glm-4.6')).toBe('Z-AI');
    });

    it('normalizes modality to canonical lowercased shape', () => {
        expect(normalizeModality(undefined)).toBe('text->text');
        expect(normalizeModality('Text+Image->Text')).toBe('text+image->text');
    });

    it('converts token pricing to per-million pricing', () => {
        expect(tokenPriceToMillionPrice('0.000001')).toBe(1);
        expect(tokenPriceToMillionPrice(undefined)).toBe(0);
        expect(tokenPriceToMillionPrice('invalid')).toBe(0);
    });

    it('normalizes raw OpenRouter model payload', () => {
        const normalized = normalizeOpenRouterModel({
            id: 'anthropic/claude-haiku-4.5',
            name: 'Claude Haiku 4.5',
            context_length: 200000,
            pricing: { prompt: '0.000001', completion: '0.000005' },
            architecture: { modality: 'Text->Text' },
            supported_parameters: ['tools'],
            capabilities: ['search'],
        });

        expect(normalized).toMatchObject({
            id: 'anthropic/claude-haiku-4.5',
            provider: 'Anthropic',
            contextWindow: 200000,
            inputPrice: 1,
            outputPrice: 5,
            modality: 'text->text',
            supportedParams: ['tools'],
            capabilities: ['search'],
        });
    });

    it('detects capabilities consistently', () => {
        expect(supportsVision('text+image->text')).toBe(true);
        expect(supportsAudio('text+audio->text')).toBe(true);
        expect(supportsTools(['tools', 'temperature'])).toBe(true);
        expect(supportsFileInput('text+image->text', undefined)).toBe(true);
        expect(supportsImageGeneration('text->image')).toBe(true);
        expect(supportsSearchCapability('perplexity/sonar-pro', 'Sonar Pro', [], [])).toBe(true);
    });
});
