import React from 'react';
import clsx from 'clsx';

export interface GraphContextMenuItem {
    key: string;
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    tone?: 'default' | 'danger' | 'warning';
    dividerBefore?: boolean;
    disabled?: boolean;
}

interface GraphContextMenuProps {
    x: number;
    y: number;
    minWidthClassName?: string;
    zIndexClassName?: string;
    items: GraphContextMenuItem[];
}

export function GraphContextMenu({
    x,
    y,
    minWidthClassName = 'min-w-[140px]',
    zIndexClassName = 'z-50',
    items,
}: GraphContextMenuProps) {
    return (
        <div
            className={clsx(
                'fixed bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 py-1',
                minWidthClassName,
                zIndexClassName
            )}
            style={{ left: x, top: y }}
        >
            {items.map((item) => (
                <React.Fragment key={item.key}>
                    {item.dividerBefore && (
                        <div className="border-t border-gray-100 dark:border-slate-700 my-1" />
                    )}
                    <button
                        className={clsx(
                            'w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center gap-2',
                            item.tone === 'danger'
                                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                : item.tone === 'warning'
                                    ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                                    : 'text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/30',
                            item.disabled && 'opacity-50 cursor-not-allowed'
                        )}
                        onClick={item.onClick}
                        disabled={item.disabled}
                    >
                        {item.icon}
                        {item.label}
                    </button>
                </React.Fragment>
            ))}
        </div>
    );
}
