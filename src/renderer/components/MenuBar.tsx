import React, { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { ViewMode } from '../types';
import { version } from '../../../package.json';

interface MenuBarProps {
    mode: ViewMode;
    onFileOpen: (content: string) => void;
    onSaveFile: () => void; // For browser, this will trigger a download of current text
    onExportCommits: () => void;
    onImportCommits: (content: string) => void;
    onClearAll: () => void;
    onToggleDark: () => void;
    onFontSize: (size: 'sm' | 'base' | 'lg' | 'xl') => void;
    onFontFamily: (family: 'sans' | 'serif' | 'mono') => void;
    onShowHelp: () => void;
    onShowLogs: () => void;
    onShowCommitHistory: () => void;
    // Tools props (optional since we are adding them)
    onPolish?: (mode: 'spelling' | 'grammar' | 'polish' | 'spelling_local' | 'spelling_ai') => void;
    onFactCheck?: () => void;
    onManagePrompts?: () => void;
    onManageProjects?: () => void;
    // Project/Repository props for browser mode
    onOpenRepository?: () => void;
    onCreateRepository?: () => void;
    onNewProject?: () => void;
}

export function MenuBar({
    mode,
    onFileOpen,
    onSaveFile,
    onExportCommits,
    onImportCommits,
    onClearAll,
    onToggleDark,
    onFontSize,
    onFontFamily,
    onShowHelp,
    onShowLogs,
    onShowCommitHistory,
    onPolish,
    onFactCheck,
    onManagePrompts,
    onManageProjects,
    onOpenRepository,
    onCreateRepository,
    onNewProject
}: MenuBarProps) {
    // Only show in browser (not electron)
    if (window.electron) return null;

    // ... (rest of implementation)
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const importInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setActiveMenu(null);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            onFileOpen(content);
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset
    };

    const handleImportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            onImportCommits(content);
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset
    };

    const MenuButton = ({ label, id, children }: { label: string, id: string, children: React.ReactNode }) => (
        <div className="relative">
            <button
                className={clsx(
                    "px-3 py-1 text-sm transition-colors rounded-sm",
                    activeMenu === id
                        ? "bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-slate-100"
                        : "text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
                )}
                onClick={() => setActiveMenu(activeMenu === id ? null : id)}
                onMouseEnter={() => activeMenu && setActiveMenu(id)}
            >
                {label}
            </button>
            {activeMenu === id && (
                <div className="absolute left-0 top-full mt-1 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 py-1 z-50">
                    {children}
                </div>
            )}
        </div>
    );

    const MenuItem = ({ label, shortcut, onClick, separator = false, disabled = false, subItems }: { label?: string, shortcut?: string, onClick?: () => void, separator?: boolean, disabled?: boolean, subItems?: { label: string, onClick: () => void }[] }) => {
        if (separator) return <div className="border-t border-gray-100 dark:border-slate-700 my-1"></div>;

        if (subItems) {
            return (
                <div className="relative group px-4 py-1.5 flex justify-between items-center hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-sm text-gray-700 dark:text-slate-200 cursor-default">
                    <span>{label}</span>
                    <span className="text-gray-400">▶</span>
                    <div className="absolute left-full top-0 ml-0.5 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 py-1 hidden group-hover:block">
                        {subItems.map((item, i) => (
                            <button
                                key={i}
                                className="w-full text-left px-4 py-1.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                                onClick={() => {
                                    item.onClick();
                                    setActiveMenu(null);
                                }}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
            );
        }

        return (
            <button
                className="w-full text-left px-4 py-1.5 flex justify-between items-center hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-sm text-gray-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => {
                    if (!disabled && onClick) {
                        onClick();
                        setActiveMenu(null);
                    }
                }}
                disabled={disabled}
            >
                <span>{label}</span>
                {shortcut && <span className="text-xs text-gray-400 ml-4">{shortcut}</span>}
            </button>
        );
    };

    return (
        <div ref={menuRef} className="bg-white dark:bg-slate-950 border-b border-gray-200 dark:border-slate-800 px-2 py-0.5 flex items-center select-none shadow-sm z-50">
            <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.md" onChange={handleFileChange} />
            <input type="file" ref={importInputRef} className="hidden" accept=".json" onChange={handleImportChange} />

            {/* File Menu */}
            <MenuButton label="File" id="file">
                <MenuItem label="Open Repository..." shortcut="Ctrl+Shift+O" onClick={onOpenRepository} />
                <MenuItem label="Create Repository..." onClick={onCreateRepository} />
                <MenuItem separator />
                <MenuItem label="New Project..." shortcut="Ctrl+N" onClick={onNewProject} />
                <MenuItem separator />
                <MenuItem label="Import File..." shortcut="Ctrl+O" onClick={() => fileInputRef.current?.click()} />
                <MenuItem label="Save Preview As..." shortcut="Ctrl+S" onClick={onSaveFile} />
                <MenuItem separator />
                <MenuItem label="Export Commits..." onClick={onExportCommits} />
                <MenuItem label="Import Commits..." onClick={() => importInputRef.current?.click()} />
                <MenuItem separator />
                <MenuItem label="Exit" disabled />
            </MenuButton>

            {/* Edit Menu */}
            <MenuButton label="Edit" id="edit">
                <MenuItem label="Undo" shortcut="Ctrl+Z" disabled />
                <MenuItem label="Redo" shortcut="Ctrl+Shift+Z" disabled />
                <MenuItem separator />
                <MenuItem label="Clear All" onClick={onClearAll} />
            </MenuButton>

            {/* View Menu */}
            <MenuButton label="View" id="view">
                <MenuItem label="Toggle Dark Mode" shortcut="Ctrl+D" onClick={onToggleDark} />
                <MenuItem separator />
                {/* Submenus are tricky without more complex logic or a library, let's keep it flattened for simplicity or use the hover trick */}
                <MenuItem label="Font Size" subItems={[
                    { label: 'Small', onClick: () => onFontSize('sm') },
                    { label: 'Medium', onClick: () => onFontSize('base') },
                    { label: 'Large', onClick: () => onFontSize('lg') },
                    { label: 'Extra Large', onClick: () => onFontSize('xl') },
                ]} />
                <MenuItem label="Font Family" subItems={[
                    { label: 'Sans Serif', onClick: () => onFontFamily('sans') },
                    { label: 'Serif', onClick: () => onFontFamily('serif') },
                    { label: 'Monounce', onClick: () => onFontFamily('mono') },
                ]} />
            </MenuButton>

            {/* Tools Menu */}
            <MenuButton label="Tools" id="tools">
                <MenuItem label="Check Spelling (Local)" onClick={() => onPolish && onPolish('spelling_local')} />
                <MenuItem label="Check Spelling (AI)" onClick={() => onPolish && onPolish('spelling_ai')} />
                <MenuItem label="Fix Grammar" onClick={() => onPolish && onPolish('grammar')} />
                <MenuItem label="Full Polish" onClick={() => onPolish && onPolish('polish')} />
                <MenuItem separator />
                <MenuItem label="Fact Check" onClick={() => onFactCheck && onFactCheck()} />
                <MenuItem separator />
                <MenuItem label="Manage Prompts..." onClick={() => onManagePrompts && onManagePrompts()} />
                <MenuItem label="Project Manager..." onClick={() => onManageProjects && onManageProjects()} />
            </MenuButton>

            {/* Window Menu */}
            <MenuButton label="Window" id="window">
                <MenuItem label="Minimize" disabled />
                <MenuItem label="Close" disabled />
            </MenuButton>

            {/* Help Menu */}
            <MenuButton label="Help" id="help">
                <MenuItem label="Instructions" shortcut="F1" onClick={onShowHelp} />
                <MenuItem label="View AI Usage Logs" onClick={onShowLogs} />
                <MenuItem label="Commit History" onClick={onShowCommitHistory} />
                <MenuItem separator />
                <MenuItem label="About" onClick={() => alert(`Diff & Commit AI\nVersion ${version}`)} />
            </MenuButton>
        </div>
    );
}
