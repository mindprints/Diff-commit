import React from 'react';
import clsx from 'clsx';
import { MoreVertical } from 'lucide-react';

interface GraphNodeCardProps {
    key?: React.Key;
    x: number;
    y: number;
    className?: string;
    onMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
    onDoubleClick?: () => void;
    onMenuClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
    header: React.ReactNode;
    body?: React.ReactNode;
    footer?: React.ReactNode;
    overlay?: React.ReactNode;
    tooltip?: React.ReactNode;
}

export function GraphNodeCard({
    x,
    y,
    className,
    onMouseDown,
    onMouseEnter,
    onMouseLeave,
    onContextMenu,
    onDoubleClick,
    onMenuClick,
    header,
    body,
    footer,
    overlay,
    tooltip,
}: GraphNodeCardProps) {
    return (
        <div
            className={clsx('project-node group', className)}
            style={{ transform: `translate(${x}px, ${y}px)` }}
            onMouseDown={onMouseDown}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onContextMenu={onContextMenu}
            onDoubleClick={onDoubleClick}
        >
            <div className="flex items-center gap-2 mb-2">
                {header}
                {onMenuClick && (
                    <button
                        className="ml-auto p-0.5 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-slate-600 rounded transition-opacity"
                        onClick={onMenuClick}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <MoreVertical className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                )}
            </div>
            {body}
            {footer}
            {overlay}
            {tooltip}
        </div>
    );
}
