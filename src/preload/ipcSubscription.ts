export interface IpcSubscriptionAdapter {
    on: (channel: string, listener: (...args: unknown[]) => void) => void;
    off: (channel: string, listener: (...args: unknown[]) => void) => void;
}

export function subscribeIpcChannel<Args extends unknown[]>(
    ipc: IpcSubscriptionAdapter,
    channel: string,
    callback: (...args: Args) => void
): () => void {
    const listener = (_event: unknown, ...args: Args) => callback(...args);
    ipc.on(channel, listener);
    return () => ipc.off(channel, listener);
}
