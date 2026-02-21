import { describe, expect, it } from 'vitest';
import { isImageCapable } from './imageGenerationService';

describe('imageGenerationService capability resolver', () => {
    it('treats models with image-generation capabilities as image-capable even without image-like IDs', () => {
        const model = {
            id: 'vendor/custom-model-42',
            name: 'Custom Multimodal',
            modality: 'text->text',
            capabilities: ['image-generation'],
        };

        expect(isImageCapable(model)).toBe(true);
    });

    it('returns false for plain text-only model metadata', () => {
        const model = {
            id: 'vendor/text-only',
            name: 'Text Only',
            modality: 'text->text',
            capabilities: ['chat'],
        };

        expect(isImageCapable(model)).toBe(false);
    });
});
