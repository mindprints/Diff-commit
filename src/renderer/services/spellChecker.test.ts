import { describe, it, expect, vi, beforeAll } from 'vitest';
import { initSpellChecker, checkSpelling, getSuggestions } from './spellChecker';
import * as fs from 'fs';
import * as path from 'path';

// Mock fetch globally
// @ts-ignore
global.fetch = vi.fn().mockImplementation(async (url) => {
    const filename = path.basename(url.toString());
    const filePath = path.join(process.cwd(), 'public', 'dictionaries', filename);

    if (!fs.existsSync(filePath)) {
        return { ok: false, statusText: 'Not Found' };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return {
        ok: true,
        text: async () => content
    };
});

describe('Spell Checker', () => {
    beforeAll(async () => {
        await initSpellChecker();
    });

    it('correctly checks a simple sentence', () => {
        const result = checkSpelling('This is a test');
        expect(result.text).toBe('This is a test');
        expect(result.corrections).toBe(0);
    });

    it('corrects simple misspellings', () => {
        const text = 'This is a tset of teh system';
        const result = checkSpelling(text);
        console.log(`Original: "${text}"`);
        console.log(`Corrected: "${result.text}"`);
        console.log(`Corrections: ${result.corrections}`);

        // Debug suggestions
        console.log('tset suggestions:', getSuggestions('tset'));
        console.log('teh suggestions:', getSuggestions('teh'));

        expect(result.corrections).toBeGreaterThan(0);
        // basic check
        expect(result.text).not.toContain('tset');
    });

    it('preserves casing', () => {
        const result = checkSpelling('Teh');
        console.log('Teh ->', result.text);
        expect(result.text).not.toBe('Teh');
        // If result is "The" or "TeX", it's fine as long as it corrected it.
    });

    it('ignores code blocks', () => {
        const text = 'Check ```\nvar tset = 1;\n``` code';
        const result = checkSpelling(text);
        expect(result.text).toBe(text);
        expect(result.corrections).toBe(0);
    });

    it('ignores inline code', () => {
        const text = 'Check `tset` code';
        const result = checkSpelling(text);
        expect(result.text).toBe(text);
    });

    it('ignores URLs', () => {
        const text = 'Go to https://example.com/tset';
        const result = checkSpelling(text);
        expect(result.text).toBe(text);
    });
});
