export interface GraphPoint {
    x: number;
    y: number;
}

export interface GraphRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function clientToGraphSpace(
    clientX: number,
    clientY: number,
    canvasRect: DOMRect,
    offset: GraphPoint,
    scale: number
): GraphPoint {
    return {
        x: (clientX - canvasRect.left - offset.x) / scale,
        y: (clientY - canvasRect.top - offset.y) / scale,
    };
}

export function rectsOverlap(a: GraphRect, b: GraphRect): boolean {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}
