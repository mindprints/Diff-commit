import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    runFactCheck,
    setFactCheckExtractionModelId,
    setFactCheckVerificationModelId
} from './factChecker';

const requestOpenRouterChatCompletionsMock = vi.fn();

vi.mock('./openRouterBridge', () => ({
    requestOpenRouterChatCompletions: (payload: unknown, signal?: AbortSignal) =>
        requestOpenRouterChatCompletionsMock(payload, signal),
}));

const FACTCHECK_SEARCH_MODE_KEY = 'diff-commit-factcheck-search-mode';

function ensureLocalStorage(): Storage {
    if (typeof localStorage !== 'undefined') {
        return localStorage;
    }

    const store = new Map<string, string>();
    const shim = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, String(value));
        },
        removeItem: (key: string) => {
            store.delete(key);
        },
        clear: () => {
            store.clear();
        },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() {
            return store.size;
        },
    } as Storage;

    Object.defineProperty(globalThis, 'localStorage', {
        value: shim,
        configurable: true,
    });

    return shim;
}

function ensureWindow(): void {
    const w = (globalThis as unknown as { window?: Record<string, unknown> }).window ?? {};
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
        ...w,
        electron: {
            openRouter: {
                chatCompletions: vi.fn(),
            },
        },
    };
}

function queueSuccessfulFactCheckResponses(): void {
    requestOpenRouterChatCompletionsMock
        .mockResolvedValueOnce({
            choices: [
                {
                    message: {
                        content: '[{"claim":"Earth is round","category":"other","context":"Earth is round"}]',
                    },
                },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
        })
        .mockResolvedValueOnce({
            choices: [
                {
                    message: {
                        content: '{"status":"verified","sources":["https://example.com"],"confidence":"high"}',
                    },
                },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
        });
}

describe('factChecker search mode runtime', () => {
    beforeEach(() => {
        ensureWindow();
        ensureLocalStorage().clear();
        requestOpenRouterChatCompletionsMock.mockReset();
    });

    it('uses configured extraction and verification model IDs', async () => {
        setFactCheckExtractionModelId('openai/gpt-oss-120b');
        setFactCheckVerificationModelId('anthropic/claude-haiku-4.5');
        localStorage.setItem(FACTCHECK_SEARCH_MODE_KEY, 'off');

        queueSuccessfulFactCheckResponses();
        const result = await runFactCheck('Earth is round.');

        expect(result.isError).toBeFalsy();
        expect(requestOpenRouterChatCompletionsMock).toHaveBeenCalledTimes(2);
        const extractionPayload = requestOpenRouterChatCompletionsMock.mock.calls[0][0] as Record<string, unknown>;
        const verificationPayload = requestOpenRouterChatCompletionsMock.mock.calls[1][0] as Record<string, unknown>;
        expect(extractionPayload.model).toBe('openai/gpt-oss-120b');
        expect(verificationPayload.model).toBe('anthropic/claude-haiku-4.5');
    });

    it('filters subjective/non-verifiable claims before verification', async () => {
        setFactCheckExtractionModelId('deepseek/deepseek-v3.2');
        setFactCheckVerificationModelId('perplexity/sonar-pro');
        localStorage.setItem(FACTCHECK_SEARCH_MODE_KEY, 'off');

        requestOpenRouterChatCompletionsMock
            .mockResolvedValueOnce({
                choices: [
                    {
                        message: {
                            content: JSON.stringify([
                                { statement: 'The Louvre has moved to Berlin.', category: 'event', context: 'museum', verifiable: true },
                                { statement: 'The Louvre has moved to Berlin.', category: 'event', context: 'duplicate', verifiable: true },
                                { statement: 'We had a great time in France.', category: 'other', context: 'subjective', verifiable: true },
                                { statement: 'I wrote a letter to Mom.', category: 'other', context: 'private', verifiable: false }
                            ]),
                        },
                    },
                ],
                usage: { prompt_tokens: 5, completion_tokens: 5 },
            })
            .mockResolvedValueOnce({
                choices: [
                    {
                        message: {
                            content: '{"status":"incorrect","sources":["https://example.com"],"confidence":"high"}',
                        },
                    },
                ],
                usage: { prompt_tokens: 3, completion_tokens: 4 },
            });

        const result = await runFactCheck('sample text');
        expect(result.isError).toBeFalsy();
        expect(result.session.claims).toHaveLength(1);
        expect(result.session.claims[0].claim).toBe('The Louvre has moved to Berlin.');
        expect(result.session.verifications).toHaveLength(1);
        expect(requestOpenRouterChatCompletionsMock).toHaveBeenCalledTimes(2);
    });

    it.each([
        {
            mode: 'off',
            assertPayload: (payload: Record<string, unknown>) => {
                expect(payload.model).toBe('perplexity/sonar-pro');
                expect(payload.plugins).toBeUndefined();
            },
        },
        {
            mode: 'auto',
            assertPayload: (payload: Record<string, unknown>) => {
                expect(payload.model).toBe('perplexity/sonar-pro');
                expect(payload.plugins).toBeUndefined();
            },
        },
        {
            mode: 'online_suffix',
            assertPayload: (payload: Record<string, unknown>) => {
                expect(payload.model).toBe('perplexity/sonar-pro:online');
                expect(payload.plugins).toBeUndefined();
            },
        },
        {
            mode: 'web_plugin',
            assertPayload: (payload: Record<string, unknown>) => {
                expect(payload.model).toBe('perplexity/sonar-pro');
                expect(payload.plugins).toEqual([{ id: 'web', max_results: 5 }]);
            },
        },
    ])('applies "$mode" to verification request payload', async ({ mode, assertPayload }) => {
        localStorage.setItem(FACTCHECK_SEARCH_MODE_KEY, mode);
        queueSuccessfulFactCheckResponses();

        const result = await runFactCheck('Earth is round.');

        expect(result.isError).toBeFalsy();
        expect(result.session.verifications.length).toBe(1);
        expect(requestOpenRouterChatCompletionsMock).toHaveBeenCalledTimes(2);

        const verificationPayload = requestOpenRouterChatCompletionsMock.mock.calls[1][0] as Record<string, unknown>;
        assertPayload(verificationPayload);
    });
});
