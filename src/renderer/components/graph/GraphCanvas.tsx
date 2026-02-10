import React from 'react';
import '../ProjectNodeModal.css';

interface GraphCanvasProps {
    canvasRef: React.RefObject<HTMLDivElement | null>;
    offset: { x: number; y: number };
    scale: number;
    onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseUp: (e: React.MouseEvent<HTMLDivElement>) => void;
    children: React.ReactNode;
}

export function GraphCanvas({
    canvasRef,
    offset,
    scale,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    children,
}: GraphCanvasProps) {
    return (
        <div
            ref={canvasRef}
            className="project-node-canvas"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
        >
            <div
                style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    transformOrigin: '0 0',
                    width: '100%',
                    height: '100%',
                }}
            >
                {children}
            </div>
        </div>
    );
}
