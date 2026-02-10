import React from 'react';
import clsx from 'clsx';

interface GraphNodeTooltipProps {
    title: string;
    subtitle?: string;
    persistent?: boolean;
    children: React.ReactNode;
}

export function GraphNodeTooltip({
    title,
    subtitle,
    persistent = false,
    children,
}: GraphNodeTooltipProps) {
    return (
        <div
            className={clsx('node-tooltip', persistent && 'persistent')}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className="font-bold border-b border-gray-700 pb-1 mb-1 text-xs flex justify-between items-center">
                <span>{title}</span>
                {subtitle && <span className="text-[10px] text-gray-400 font-normal">{subtitle}</span>}
            </div>
            {children}
        </div>
    );
}
