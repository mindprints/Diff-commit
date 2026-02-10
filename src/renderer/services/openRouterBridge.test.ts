import { describe, expect, it, vi } from 'vitest';
import { requestOpenRouterChatCompletions } from './openRouterBridge';

interface TestWindow {
    electron?: {
        openRouter?: {
            chatCompletions: (payload: unknown) => Promise<unknown>;
            chatCompletionsStart?: (requestId: string, payload: unknown) => Promise<unknown>;
            chatCompletionsCancel?: (requestId: string) => Promise<boolean>;
        };
    };
}

function setTestWindow(value: TestWindow): void {
    (globalThis as unknown as { window: TestWindow }).window = value;
}

describe('openRouterBridge', () => {
    it('uses start/cancel flow and maps aborted requests to AbortError', async () => {
        let rejectStart: ((reason?: unknown) => void) | undefined;
        const chatCompletionsStart = vi.fn(
            () => new Promise<unknown>((_resolve, reject) => {
                rejectStart = reject;
            })
        );
        const chatCompletionsCancel = vi.fn(async () => {
            rejectStart?.(new Error('cancelled'));
            return true;
        });

        setTestWindow({
            electron: {
                openRouter: {
                    chatCompletions: vi.fn(),
                    chatCompletionsStart,
                    chatCompletionsCancel,
                },
            },
        });

        const controller = new AbortController();
        const request = requestOpenRouterChatCompletions(
            { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
            controller.signal
        );
        controller.abort();

        await expect(request).rejects.toMatchObject({ name: 'AbortError' });
        expect(chatCompletionsStart).toHaveBeenCalledTimes(1);
        expect(chatCompletionsCancel).toHaveBeenCalledTimes(1);
    });

    it('falls back to non-cancellable chatCompletions when start/cancel is unavailable', async () => {
        const chatCompletions = vi.fn(async () => ({ choices: [] }));
        setTestWindow({
            electron: {
                openRouter: {
                    chatCompletions,
                },
            },
        });

        const result = await requestOpenRouterChatCompletions({
            model: 'm',
            messages: [{ role: 'user', content: 'hello' }],
        });

        expect(chatCompletions).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ choices: [] });
    });
});
