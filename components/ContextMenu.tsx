import React, { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { Volume2, Wand2, Shield, Sparkles } from 'lucide-react';

interface ContextMenuAction {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    divider?: boolean;
    subLabel?: string;
}

interface ContextMenuProps {
    x: number;
    y: number;
    isOpen: boolean;
    onClose: () => void;
    actions: ContextMenuAction[];
}

export function ContextMenu({ x, y, isOpen, onClose, actions }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    // Adjust position to keep menu within viewport
    useEffect(() => {
        if (!isOpen || !menuRef.current) return;

        const menu = menuRef.current;
        const rect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let adjustedX = x;
        let adjustedY = y;

        if (x + rect.width > viewportWidth) {
            adjustedX = viewportWidth - rect.width - 8;
        }
        if (y + rect.height > viewportHeight) {
            adjustedY = viewportHeight - rect.height - 8;
        }

        menu.style.left = `${adjustedX}px`;
        menu.style.top = `${adjustedY}px`;
    }, [isOpen, x, y]);

    if (!isOpen) return null;

    return (
        <div
            ref={menuRef}
            className="fixed z-50 min-w-[200px] bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 py-1 animate-in fade-in zoom-in-95 duration-100"
            style={{ left: x, top: y }}
        >
            {actions.map((action, index) => (
                <React.Fragment key={index}>
                    {action.divider && index > 0 && (
                        <div className="border-t border-gray-100 dark:border-slate-700 my-1" />
                    )}
                    <button
                        onClick={() => {
                            if (!action.disabled) {
                                action.onClick();
                                onClose();
                            }
                        }}
                        disabled={action.disabled}
                        className={clsx(
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors",
                            action.disabled
                                ? "text-gray-400 dark:text-slate-600 cursor-not-allowed"
                                : "text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-400"
                        )}
                    >
                        {action.icon && (
                            <span className={clsx("w-4 h-4", action.disabled && "opacity-50")}>
                                {action.icon}
                            </span>
                        )}
                        <span className="flex-1">{action.label}</span>
                        {action.subLabel && (
                            <span className="text-xs text-gray-400 dark:text-slate-500">{action.subLabel}</span>
                        )}
                    </button>
                </React.Fragment>
            ))}
        </div>
    );
}
