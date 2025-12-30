import React, { useState } from 'react';
import {
    ArrowRightLeft,
    Copy,
    Trash2,
    ChevronRight,
    FolderOpen,
    Moon,
    Sun,
    Settings,
    Type as TypeIcon,
    Check,
    Link2,
    BarChart3,
    History,
    HelpCircle
} from 'lucide-react';
import clsx from 'clsx';
import { ViewMode, FontFamily } from '../types';
import { MODELS, Model, getCostTier } from '../constants/models';
import headerIcon from '../header_icon_styled.png';
import { Button } from './Button';
import { FontSize, fontClasses, sizeClasses } from '../constants/ui';
import { useUI, useProject, useAI, useEditor } from '../contexts';

export function AppHeader() {
    const {
        repositoryPath, openRepository, currentProject, projects,
        handleClearAll, commits
    } = useProject();

    const {
        backgroundHue, setBackgroundHue, isDarkMode, setIsDarkMode,
        setShowLogs, setShowCommitHistory, setShowHelp, setShowProjectsPanel
    } = useUI();

    const {
        sessionCost, selectedModel, setSelectedModel
    } = useAI();

    const {
        fontFamily, setFontFamily, fontSize, setFontSize,
        isScrollSyncEnabled, setIsScrollSyncEnabled,
        mode, handleCopyFinal
    } = useEditor();

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    return (
        <header
            className="flex-none h-16 px-4 flex items-center justify-between z-30 transition-colors duration-200 select-none shadow-sm"
            style={{ backgroundColor: 'var(--bg-header)', borderBottom: '1px solid var(--border-color)' }}
        >
            <div className="flex items-center gap-4 flex-1">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 overflow-hidden border-2 border-white/10">
                        <img src={headerIcon} alt="Logo" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col">
                        <h1 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white leading-tight">
                            Diff & Commit <span className="text-indigo-500 dark:text-indigo-400">AI</span>
                        </h1>
                        <div className="flex items-center text-[10px] font-medium text-gray-500 dark:text-slate-400">
                            <span className="bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded mr-1.5 uppercase tracking-wider">v2.0</span>
                            Professional Text Editor
                        </div>
                    </div>
                </div>

                {/* Dynamic Breadcrumbs for Repository and Project */}
                {repositoryPath && (
                    <div className="ml-4 flex items-center bg-white/50 dark:bg-slate-800/50 px-3 py-1.5 rounded-full border border-gray-200 dark:border-slate-800 backdrop-blur-sm transition-all hover:bg-white dark:hover:bg-slate-800 group">
                        <button
                            onClick={openRepository}
                            className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                            title="Change repository"
                        >
                            <FolderOpen className="w-3.5 h-3.5" />
                            <span className="max-w-[120px] truncate font-medium">
                                {repositoryPath.split(/[\\/]/).pop()}
                            </span>
                        </button>

                        <ChevronRight className="w-3 h-3 mx-2 text-gray-300 dark:text-slate-700" />

                        <button
                            onClick={() => setShowProjectsPanel(true)}
                            className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold transition-colors"
                            title="Switch project"
                        >
                            <span className="max-w-[150px] truncate">
                                {currentProject ? currentProject.name : 'Select Project'}
                            </span>
                            <ArrowRightLeft className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-3">
                <Button
                    variant="outline"
                    onClick={handleClearAll}
                    size="sm"
                    icon={<Trash2 className="w-4 h-4" />}
                >
                    Clear All
                </Button>

                {mode === ViewMode.DIFF && (
                    <Button variant="primary" size="sm" onClick={handleCopyFinal} icon={<Copy className="w-4 h-4" />}>
                        Copy
                    </Button>
                )}
            </div>

            <div id="header-controls" className="flex items-center gap-3 ml-4">
                <div className="flex items-center gap-3 mr-2">
                    {/* Background Hue Slider + Model Selector & Cost */}
                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-800/50 p-1 rounded-lg border border-gray-200 dark:border-slate-800">
                        {/* Compact Hue Slider */}
                        <input
                            type="range"
                            min="0"
                            max="360"
                            value={backgroundHue}
                            onChange={(e) => setBackgroundHue(Number(e.target.value))}
                            className="w-16 h-4 cursor-pointer appearance-none rounded"
                            style={{
                                background: `linear-gradient(to right, 
                  hsl(0, 70%, ${isDarkMode ? '15%' : '95%'}),
                  hsl(60, 70%, ${isDarkMode ? '15%' : '95%'}),
                  hsl(120, 70%, ${isDarkMode ? '15%' : '95%'}),
                  hsl(180, 70%, ${isDarkMode ? '15%' : '95%'}),
                  hsl(240, 70%, ${isDarkMode ? '15%' : '95%'}),
                  hsl(300, 70%, ${isDarkMode ? '15%' : '95%'}),
                  hsl(360, 70%, ${isDarkMode ? '15%' : '95%'})
                )`
                            }}
                            title={`Background Hue: ${backgroundHue}°`}
                        />
                        <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-medium ml-1 mr-1 min-w-[3rem] text-right">
                            ${sessionCost.toFixed(4)}
                        </span>
                        <select
                            className="text-xs bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded px-2 py-1 text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[14rem] truncate"
                            value={selectedModel.id}
                            onChange={(e) => {
                                const model = MODELS.find(m => m.id === e.target.value);
                                if (model) setSelectedModel(model);
                            }}
                            title={`Select AI Model - Current: ${selectedModel.name} (${getCostTier(selectedModel)})`}
                        >
                            {MODELS.map(m => (
                                <option key={m.id} value={m.id}>{m.name} ({getCostTier(m)})</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-2 border-l border-gray-200 dark:border-slate-800 pl-3">
                    <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className="p-2 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-all hover:scale-105"
                        title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </button>

                    <div className="relative">
                        <button
                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                            className={clsx(
                                "p-2 rounded-lg transition-all hover:scale-105",
                                isSettingsOpen ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400" : "text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
                            )}
                            title="Appearance & Settings"
                        >
                            <Settings className="w-5 h-5" />
                        </button>

                        {isSettingsOpen && <div className="fixed inset-0 z-40" onClick={() => setIsSettingsOpen(false)} />}
                        {isSettingsOpen && (
                            <div className="absolute top-full right-0 mt-3 w-72 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700 py-3 z-50 animate-in fade-in zoom-in-95 duration-200">
                                <div className="px-4 py-2 border-b border-gray-50 dark:border-slate-700 mb-2">
                                    <h3 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Settings</h3>
                                </div>

                                <div className="px-4 py-3 space-y-4">
                                    {/* Font Family */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <TypeIcon className="w-3 h-3" />
                                            Typeface
                                        </label>
                                        <div className="flex rounded-lg bg-gray-50 dark:bg-slate-900/50 p-1 border border-gray-100 dark:border-slate-700/50">
                                            {(['sans', 'serif', 'mono'] as const).map((f) => (
                                                <button
                                                    key={f}
                                                    onClick={() => setFontFamily(f)}
                                                    className={clsx(
                                                        "flex-1 py-1.5 text-xs rounded-md transition-all font-medium capitalize",
                                                        fontFamily === f ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                                                    )}
                                                >
                                                    {f}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Font Size */}
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Scale</label>
                                            <select
                                                value={fontSize}
                                                onChange={(e) => setFontSize(e.target.value as FontSize)}
                                                className="w-full text-xs bg-gray-50 dark:bg-slate-900/50 border border-gray-100 dark:border-slate-700/50 rounded-lg px-2 py-2 text-gray-700 dark:text-slate-200 outline-none"
                                            >
                                                <option value="sm">Small</option>
                                                <option value="base">Normal</option>
                                                <option value="lg">Large</option>
                                                <option value="xl">XL</option>
                                            </select>
                                        </div>

                                        {/* Scroll Sync Toggle */}
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                                <Link2 className="w-3 h-3" />
                                                Syncing
                                            </label>
                                            <button
                                                onClick={() => setIsScrollSyncEnabled(!isScrollSyncEnabled)}
                                                className={clsx(
                                                    "w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all",
                                                    isScrollSyncEnabled
                                                        ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-900/40 text-indigo-600 dark:text-indigo-400 shadow-sm shadow-indigo-500/5"
                                                        : "bg-gray-50 dark:bg-slate-900/50 border-gray-100 dark:border-slate-700/50 text-gray-400"
                                                )}
                                            >
                                                <span className="text-xs font-medium">{isScrollSyncEnabled ? 'On' : 'Off'}</span>
                                                <div className={clsx("w-2 h-2 rounded-full", isScrollSyncEnabled ? "bg-indigo-500 animate-pulse" : "bg-gray-300 dark:bg-slate-700")}></div>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="border-t border-gray-50 dark:border-slate-700 my-1 pt-3">
                                        <div className="flex flex-col gap-1.5">
                                            <button onClick={() => { setShowLogs(true); setIsSettingsOpen(false); }} className="flex items-center gap-3 w-full px-3 py-2 text-xs text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-900/50 rounded-lg transition-colors group">
                                                <BarChart3 className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                                                AI Usage Statistics
                                            </button>
                                            <button onClick={() => { setShowCommitHistory(true); setIsSettingsOpen(false); }} className="flex items-center gap-3 w-full px-3 py-2 text-xs text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-900/50 rounded-lg transition-colors group">
                                                <History className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                                                Version History
                                                {commits.length > 0 && <span className="ml-auto bg-gray-100 dark:bg-slate-700 text-[10px] px-1.5 py-0.5 rounded-full">{commits.length}</span>}
                                            </button>
                                            <button onClick={() => { setShowHelp(true); setIsSettingsOpen(false); }} className="flex items-center gap-3 w-full px-3 py-2 text-xs text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-900/50 rounded-lg transition-colors group">
                                                <HelpCircle className="w-4 h-4 text-gray-400 group-hover:text-amber-500 transition-colors" />
                                                Help & Support
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-2 px-4 py-2 bg-gray-50/50 dark:bg-slate-900/30 text-[9px] text-gray-400 dark:text-slate-500 flex justify-between items-center rounded-b-2xl">
                                    <span>System Preferences</span>
                                    <div className="flex items-center gap-1 text-emerald-500">
                                        <Check className="w-2.5 h-2.5" />
                                        Auto-saved
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}
