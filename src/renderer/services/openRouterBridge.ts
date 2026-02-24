type ChatPayload = {
    model: string;
    messages: Array<{ role: string; content: unknown }>;
    modalities?: string[];
    temperature?: number;
    response_format?: unknown;
    generation_config?: unknown;
    plugins?: Array<{ id: string; [key: string]: unknown }>;
};

function createRequestId(): string {
    return `or_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isAbortLikeError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.toLowerCase().includes('aborted') || message.toLowerCase().includes('cancel');
}

export async function requestOpenRouterChatCompletions(payload: ChatPayload, signal?: AbortSignal): Promise<unknown> {
    if (!window.electron?.openRouter) {
        throw new Error('OpenRouter Electron bridge unavailable');
    }

    const openRouter = window.electron.openRouter;

    if (!openRouter.chatCompletionsStart || !openRouter.chatCompletionsCancel) {
        if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }
        return openRouter.chatCompletions(payload);
    }

    const requestId = createRequestId();
    const onAbort = () => {
        void openRouter.chatCompletionsCancel?.(requestId).catch(() => undefined);
    };

    if (signal?.aborted) {
        onAbort();
        throw new DOMException('Aborted', 'AbortError');
    }

    signal?.addEventListener('abort', onAbort, { once: true });
    try {
        return await openRouter.chatCompletionsStart(requestId, payload);
    } catch (error) {
        if (signal?.aborted || isAbortLikeError(error)) {
            throw new DOMException('Aborted', 'AbortError');
        }
        throw error;
    } finally {
        signal?.removeEventListener('abort', onAbort);
    }
}
