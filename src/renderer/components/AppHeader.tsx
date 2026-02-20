import React from 'react';
import {
    ArrowRightLeft,
    Copy,
    Trash2,
    ChevronRight,
    FolderOpen,
    Moon,
    Sun,
    Settings,
    PanelTopClose,
    PanelTopOpen,
    Network
} from 'lucide-react';
import { ViewMode } from '../types';
import { getCostTier } from '../constants/models';
// Logo import removed
import { Button } from './Button';
import { useUI, useProject, useAI, useEditor } from '../contexts';

export function AppHeader() {
    const {
        repositoryPath, openRepository, currentProject,
        handleClearAll
    } = useProject();

    const {
        backgroundHue, setBackgroundHue, isDarkMode, setIsDarkMode,
        setShowProjectsPanel,
        isHeaderVisible, setIsHeaderVisible, setShowModelsModal, setShowGraphModal, setShowSettingsModal
    } = useUI();

    const {
        sessionCost, selectedModel
    } = useAI();

    const {
        mode, handleCopyFinal, previewText
    } = useEditor();
    const isElectron = !!window.electron;

    // In Electron, we need a persistent toggle since MenuBar is hidden
    if (!isHeaderVisible) {
        if (isElectron) {
            return (
                <div className="absolute top-2 right-2 z-50">
                    <button
                        onClick={() => setIsHeaderVisible(true)}
                        className="p-1.5 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-gray-200 dark:border-slate-700 rounded-lg text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-slate-700 shadow-sm transition-all"
                        title="Show Header"
                    >
                        <PanelTopOpen className="w-4 h-4" />
                    </button>
                </div>
            );
        }
        return null;
    }

    return (
        <header
            className="flex-none h-12 px-4 flex items-center justify-between z-30 transition-colors duration-200 select-none shadow-sm"
            style={{ backgroundColor: 'var(--bg-header)', borderBottom: '1px solid var(--border-color)' }}
        >
            <div className="flex items-center gap-4 flex-1">
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
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs px-2 text-gray-500 hover:text-indigo-600"
                    onClick={() => setShowGraphModal(true)}
                    icon={<Network className="w-3.5 h-3.5" />}
                    title="Project Graph View"
                >
                    Graph
                </Button>

                <Button
                    variant="outline"
                    onClick={handleClearAll}
                    size="sm"
                    className="h-7 text-xs px-2"
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                    Clear All
                </Button>

                {mode === ViewMode.DIFF && !!previewText && (
                    <Button variant="primary" size="sm" onClick={handleCopyFinal} icon={<Copy className="w-3.5 h-3.5" />} className="h-7 text-xs px-2">
                        Copy
                    </Button>
                )}
            </div>

            <div id="header-controls" className="flex items-center gap-2 ml-4">
                <div className="flex items-center gap-2 mr-2">
                    {/* Background Hue Slider + Model Selector & Cost */}
                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-800/50 p-0.5 rounded-lg border border-gray-200 dark:border-slate-800">

                        <input
                            type="range"
                            min="0"
                            max="360"
                            value={backgroundHue}
                            onChange={(e) => setBackgroundHue(Number(e.target.value))}
                            className="w-12 h-1 cursor-pointer appearance-none rounded-full"
                            style={{
                                background: 'linear-gradient(to right, hsl(0, 50%, 50%), hsl(60, 50%, 50%), hsl(120, 50%, 50%), hsl(180, 50%, 50%), hsl(240, 50%, 50%), hsl(300, 50%, 50%), hsl(360, 50%, 50%))'
                            }}
                            title={`Background Hue: ${backgroundHue}°`}
                        />
                        <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-medium ml-1 mr-1 min-w-[2.5rem] text-right">
                            ${sessionCost.toFixed(4)}
                        </span>
                        <button
                            onClick={() => setShowModelsModal(true)}
                            className="text-[10px] py-0.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded px-2 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[10rem] truncate h-6 flex items-center gap-1 transition-colors"
                            title={`Select AI Model - Current: ${selectedModel.name} (${getCostTier(selectedModel)})`}
                        >
                            <span className="truncate">{selectedModel.name}</span>
                            <span className="text-gray-400 dark:text-slate-500">({getCostTier(selectedModel)})</span>
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-1 border-l border-gray-200 dark:border-slate-800 pl-2">
                    <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className="p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-all hover:scale-105"
                        title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </button>

                    <div className="relative">
                        <button
                            onClick={() => setShowSettingsModal(true)}
                            className="p-1.5 rounded-lg transition-all hover:scale-105 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
                            title="Appearance & Settings"
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {isElectron && (
                    <div className="pl-2 border-l border-gray-200 dark:border-slate-800">
                        <button
                            onClick={() => setIsHeaderVisible(false)}
                            className="p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
                            title="Hide Header"
                        >
                            <PanelTopClose className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}
