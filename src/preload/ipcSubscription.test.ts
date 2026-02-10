import { describe, expect, it, vi } from 'vitest';
import { subscribeIpcChannel } from './ipcSubscription';

describe('subscribeIpcChannel', () => {
    it('unsubscribes only the registered listener', () => {
        const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
        const ipc = {
            on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
                const existing = listeners.get(channel) || [];
                existing.push(listener);
                listeners.set(channel, existing);
            }),
            off: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
                const existing = listeners.get(channel) || [];
                listeners.set(channel, existing.filter((entry) => entry !== listener));
            }),
        };

        const callbackA = vi.fn();
        const callbackB = vi.fn();

        const unsubscribeA = subscribeIpcChannel(ipc, 'menu-show-help', callbackA);
        subscribeIpcChannel(ipc, 'menu-show-help', callbackB);

        const [listenerA] = listeners.get('menu-show-help') || [];
        listenerA?.({}, 'arg');
        expect(callbackA).toHaveBeenCalledWith('arg');
        expect(callbackB).not.toHaveBeenCalled();

        unsubscribeA();
        const remainingListeners = listeners.get('menu-show-help') || [];
        expect(remainingListeners).toHaveLength(1);
    });
});
