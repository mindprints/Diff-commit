import { describe, expect, it, vi } from 'vitest';
import { loadGraphData, saveGraphData } from './graphService';

interface TestWindow {
    electron?: {
        loadGraphData?: (repoPath: string) => Promise<{ nodes: Array<{ id: string; x: number; y: number }>; edges: Array<{ from: string; to: string }> }>;
        saveGraphData?: (repoPath: string, data: { nodes: Array<{ id: string; x: number; y: number }>; edges: Array<{ from: string; to: string }> }) => Promise<boolean>;
    };
}

function setTestWindow(value: TestWindow): void {
    (globalThis as unknown as { window: TestWindow }).window = value;
}

describe('graphService', () => {
    it('loads graph data via Electron IPC when available', async () => {
        const loadGraphDataMock = vi.fn(async () => ({
            nodes: [{ id: 'a', x: 1, y: 2 }],
            edges: [{ from: 'a', to: 'b' }],
        }));

        setTestWindow({
            electron: {
                loadGraphData: loadGraphDataMock,
            },
        });

        const result = await loadGraphData('C:/repos/demo');
        expect(loadGraphDataMock).toHaveBeenCalledWith('C:/repos/demo');
        expect(result.nodes).toHaveLength(1);
    });

    it('saves graph data via Electron IPC when available', async () => {
        const saveGraphDataMock = vi.fn(async () => true);
        setTestWindow({
            electron: {
                saveGraphData: saveGraphDataMock,
            },
        });

        const payload = { nodes: [{ id: 'p', x: 3, y: 4 }], edges: [] };
        await saveGraphData('C:/repos/demo', payload);
        expect(saveGraphDataMock).toHaveBeenCalledWith('C:/repos/demo', payload);
    });
});
