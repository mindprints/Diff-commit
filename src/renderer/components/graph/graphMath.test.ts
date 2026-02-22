import { describe, expect, it } from 'vitest';
import { clientToGraphSpace, rectsOverlap } from './graphMath';

describe('graphMath', () => {
    it('converts client coordinates into graph world space', () => {
        const canvasRect = { left: 100, top: 50 } as DOMRect;
        const offset = { x: 40, y: -20 };
        const scale = 2;

        const point = clientToGraphSpace(260, 170, canvasRect, offset, scale);

        expect(point).toEqual({ x: 60, y: 70 });
    });

    it('detects overlapping rectangles', () => {
        expect(
            rectsOverlap(
                { x: 0, y: 0, width: 100, height: 100 },
                { x: 50, y: 20, width: 40, height: 40 }
            )
        ).toBe(true);
    });

    it('returns false when rectangles only touch edges', () => {
        expect(
            rectsOverlap(
                { x: 0, y: 0, width: 100, height: 100 },
                { x: 100, y: 0, width: 40, height: 40 }
            )
        ).toBe(false);
    });
});
