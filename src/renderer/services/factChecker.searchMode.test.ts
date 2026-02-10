import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runFactCheck } from './factChecker';

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
