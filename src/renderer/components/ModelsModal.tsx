import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, Cpu, MessageSquare, RefreshCw, Trash2, Plus, Eye, Mic, Search, Loader2, Zap, Brain, Code2, Calculator, BarChart3 } from 'lucide-react';
import clsx from 'clsx';
import { Model, getCostTier, getCostTierColor } from '../constants/models';
import { useModels, ExtendedModel } from '../hooks/useModels';
import { ParsedModel, supportsVision, supportsAudio } from '../services/openRouterService';

// Task categories for filtering/sorting models
type TaskCategory = 'all' | 'coding' | 'intelligence' | 'math' | 'speed' | 'value';

const TASK_CATEGORIES: { value: TaskCategory; label: string; icon: React.ReactNode; description: string }[] = [
    { value: 'all', label: 'All Tasks', icon: <BarChart3 className="w-4 h-4" />, description: 'Default order' },
    { value: 'coding', label: 'Coding', icon: <Code2 className="w-4 h-4" />, description: 'Sort by coding benchmark' },
    { value: 'intelligence', label: 'Intelligence', icon: <Brain className="w-4 h-4" />, description: 'Sort by intelligence index' },
    { value: 'math', label: 'Math', icon: <Calculator className="w-4 h-4" />, description: 'Sort by math benchmark' },
    { value: 'speed', label: 'Speed', icon: <Zap className="w-4 h-4" />, description: 'Sort by tokens/second' },
    { value: 'value', label: 'Value', icon: <BarChart3 className="w-4 h-4" />, description: 'Best price/performance' },
];

interface ModelsModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedModel: Model;
    onSetDefault: (model: Model) => void;
}

function formatContextWindow(tokens: number): string {
    if (tokens >= 1_000_000) {
        return `${(tokens / 1_000_000).toFixed(1)}M`;
    }
    return `${Math.round(tokens / 1000)}K`;
}

function formatPrice(price: number): string {
    if (price < 0.1) return `$${price.toFixed(3)}`;
    if (price < 1) return `$${price.toFixed(2)}`;
    return `$${price.toFixed(2)}`;
}

// Import Browser Component
function ImportBrowser({
    isOpen,
    onClose,
    availableModels,
    existingIds,
    onImport,
    isLoading,
}: {
    isOpen: boolean;
    onClose: () => void;
    availableModels: ParsedModel[];
    existingIds: Set<string>;
    onImport: (models: ParsedModel[]) => void;
    isLoading: boolean;
}) {
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());

    if (!isOpen) return null;

    const filtered = availableModels.filter(m =>
        !existingIds.has(m.id) &&
        (m.name.toLowerCase().includes(search.toLowerCase()) ||
            m.provider.toLowerCase().includes(search.toLowerCase()) ||
            m.id.toLowerCase().includes(search.toLowerCase()))
    );

    const handleImport = () => {
        const toImport = availableModels.filter(m => selected.has(m.id));
        onImport(toImport);
        setSelected(new Set());
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden border border-gray-200 dark:border-slate-700">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Import from OpenRouter</h3>
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                            {filtered.length} models available • {selected.size} selected
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Search */}
                <div className="px-6 py-3 border-b border-gray-100 dark:border-slate-800">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search models..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-slate-800 border-0 rounded-lg text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>

                {/* Models List */}
                <div className="overflow-y-auto max-h-[50vh] p-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <p className="text-center text-gray-500 dark:text-slate-400 py-8">
                            {search ? 'No models match your search' : 'All available models already imported'}
                        </p>
                    ) : (
                        <div className="grid gap-2">
                            {filtered.map((model) => (
                                <button
                                    key={model.id}
                                    onClick={() => {
                                        const newSet = new Set(selected);
                                        if (newSet.has(model.id)) {
                                            newSet.delete(model.id);
                                        } else {
                                            newSet.add(model.id);
                                        }
                                        setSelected(newSet);
                                    }}
                                    className={clsx(
                                        "w-full text-left p-3 rounded-lg border transition-all",
                                        selected.has(model.id)
                                            ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700"
                                            : "bg-white dark:bg-slate-800/50 border-gray-100 dark:border-slate-700 hover:border-indigo-200"
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-sm text-gray-900 dark:text-slate-100">{model.name}</span>
                                                {supportsVision(model.modality) && (
                                                    <Eye className="w-3.5 h-3.5 text-purple-500" title="Supports vision" />
                                                )}
                                                {supportsAudio(model.modality) && (
                                                    <Mic className="w-3.5 h-3.5 text-green-500" title="Supports audio" />
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-slate-400">{model.provider}</div>
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-slate-400">
                                            {formatContextWindow(model.contextWindow)}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleImport}
                        disabled={selected.size === 0}
                        className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Import {selected.size > 0 ? `(${selected.size})` : ''}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function ModelsModal({ isOpen, onClose, selectedModel, onSetDefault }: ModelsModalProps) {
    const {
        models,
        isLoading,
        error,
        addModels,
        removeModel,
        updatePricing,
        fetchAvailableModels,
        fetchBenchmarks,
    } = useModels();

    const [showImportBrowser, setShowImportBrowser] = useState(false);
    const [availableModels, setAvailableModels] = useState<ParsedModel[]>([]);
    const [refreshingId, setRefreshingId] = useState<string | null>(null);
    const [taskCategory, setTaskCategory] = useState<TaskCategory>('all');
    const [benchmarksLoaded, setBenchmarksLoaded] = useState(false);

    // Auto-fetch benchmarks when modal opens (if not already loaded)
    useEffect(() => {
        if (isOpen && !benchmarksLoaded && !isLoading) {
            fetchBenchmarks()
                .then(() => setBenchmarksLoaded(true))
                .catch((e) => console.error('Failed to fetch benchmarks:', e));
        }
    }, [isOpen, benchmarksLoaded, isLoading, fetchBenchmarks]);

    // Sort models based on selected task category
    const sortedModels = useMemo(() => {
        if (taskCategory === 'all') return models;

        return [...models].sort((a, b) => {
            let aVal = 0, bVal = 0;
            switch (taskCategory) {
                case 'coding':
                    aVal = a.codingIndex ?? 0;
                    bVal = b.codingIndex ?? 0;
                    break;
                case 'intelligence':
                    aVal = a.intelligenceIndex ?? 0;
                    bVal = b.intelligenceIndex ?? 0;
                    break;
                case 'math':
                    aVal = a.mathIndex ?? 0;
                    bVal = b.mathIndex ?? 0;
                    break;
                case 'speed':
                    aVal = a.outputSpeed ?? 0;
                    bVal = b.outputSpeed ?? 0;
                    break;
                case 'value':
                    // Value = intelligence / (input price + output price), higher is better
                    // Use nullish coalescing to treat 0 as valid (free models)
                    const aPrice = (a.inputPrice ?? 1) + (a.outputPrice ?? 1);
                    const bPrice = (b.inputPrice ?? 1) + (b.outputPrice ?? 1);
                    // Guard against zero price (free models get max value if they have intelligence)
                    aVal = aPrice > 0 ? (a.intelligenceIndex ?? 0) / aPrice : 0;
                    bVal = bPrice > 0 ? (b.intelligenceIndex ?? 0) / bPrice : 0;
                    break;
            }
            return bVal - aVal; // Descending order
        });
    }, [models, taskCategory]);

    // Fetch available models when import browser opens
    const handleOpenImport = async () => {
        try {
            const available = await fetchAvailableModels();
            setAvailableModels(available);
            setShowImportBrowser(true);
        } catch (e) {
            console.error('Failed to fetch models:', e);
        }
    };

    const handleRefreshPricing = async (modelId: string) => {
        setRefreshingId(modelId);
        try {
            await updatePricing(modelId);
        } catch (e) {
            console.error('Failed to refresh pricing:', e);
        } finally {
            setRefreshingId(null);
        }
    };

    const handleImportModels = (toImport: ParsedModel[]) => {
        addModels(toImport);
    };

    if (!isOpen) return null;

    const existingIds = new Set<string>(models.map(m => m.id));

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                />

                {/* Modal */}
                <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden border border-gray-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                                <Cpu className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Model Manager</h2>
                                <p className="text-xs text-gray-500 dark:text-slate-400">
                                    {models.length} models • Click to set default
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleOpenImport}
                                disabled={isLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                Import
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Error Banner */}
                    {error && (
                        <div className="px-6 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Task Category Filter */}
                    <div className="px-6 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center gap-2 overflow-x-auto">
                        <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">Sort by:</span>
                        {TASK_CATEGORIES.map((cat) => (
                            <button
                                key={cat.value}
                                onClick={() => setTaskCategory(cat.value)}
                                title={cat.description}
                                className={clsx(
                                    "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors shrink-0",
                                    taskCategory === cat.value
                                        ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                                        : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700"
                                )}
                            >
                                {cat.icon}
                                {cat.label}
                            </button>
                        ))}
                        <button
                            onClick={() => fetchBenchmarks(true)}
                            disabled={isLoading}
                            className="ml-auto flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors shrink-0"
                            title="Refresh benchmark data"
                        >
                            <RefreshCw className={clsx("w-3.5 h-3.5", isLoading && "animate-spin")} />
                            Refresh Benchmarks
                        </button>
                    </div>

                    {/* Models List */}
                    <div className="overflow-y-auto max-h-[calc(80vh-200px)] p-4">
                        <div className="space-y-2">
                            {sortedModels.map((model) => {
                                const isSelected = model.id === selectedModel.id;
                                const tierColor = getCostTierColor(model);
                                const isRefreshing = refreshingId === model.id;

                                return (
                                    <div
                                        key={model.id}
                                        className={clsx(
                                            "p-4 rounded-xl border transition-all group",
                                            isSelected
                                                ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 ring-2 ring-indigo-500/20"
                                                : "bg-white dark:bg-slate-800/50 border-gray-100 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800"
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            {/* Model Info - Clickable */}
                                            <button
                                                onClick={() => onSetDefault(model)}
                                                className="flex-1 min-w-0 text-left"
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-semibold text-gray-900 dark:text-slate-100">
                                                        {model.name}
                                                    </span>
                                                    {supportsVision(model.modality) && (
                                                        <Eye className="w-3.5 h-3.5 text-purple-500" title="Vision" />
                                                    )}
                                                    {supportsAudio(model.modality) && (
                                                        <Mic className="w-3.5 h-3.5 text-green-500" title="Audio" />
                                                    )}
                                                    {isSelected && (
                                                        <span className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 rounded-full">
                                                            <Check className="w-3 h-3" />
                                                            Default
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-slate-400">
                                                    {model.provider}
                                                </div>
                                                {/* Benchmark Indicators */}
                                                {model.benchmarkMatched && (
                                                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                                        {model.intelligenceIndex !== undefined && (
                                                            <span
                                                                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                                                                title="Intelligence Index"
                                                            >
                                                                <Brain className="w-2.5 h-2.5" />
                                                                {model.intelligenceIndex.toFixed(0)}
                                                            </span>
                                                        )}
                                                        {model.codingIndex !== undefined && (
                                                            <span
                                                                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                                                                title="Coding Index"
                                                            >
                                                                <Code2 className="w-2.5 h-2.5" />
                                                                {model.codingIndex.toFixed(0)}
                                                            </span>
                                                        )}
                                                        {model.outputSpeed !== undefined && (
                                                            <span
                                                                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                                                                title="Output Speed (tokens/sec)"
                                                            >
                                                                <Zap className="w-2.5 h-2.5" />
                                                                {model.outputSpeed.toFixed(0)}/s
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                {model.benchmarkMatched === false && (
                                                    <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">
                                                        No benchmark data
                                                    </div>
                                                )}
                                            </button>

                                            {/* Stats & Actions */}
                                            <div className="flex items-center gap-3 text-xs">
                                                {/* Context Window */}
                                                <div className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400" title="Context Window">
                                                    <MessageSquare className="w-3.5 h-3.5" />
                                                    <span className="font-mono">{formatContextWindow(model.contextWindow)}</span>
                                                </div>

                                                {/* Pricing */}
                                                <div className="flex flex-col items-end gap-0.5">
                                                    <div className="flex items-center gap-1 text-gray-400 dark:text-slate-500">
                                                        <span className="text-[10px]">IN</span>
                                                        <span className="font-mono text-gray-600 dark:text-slate-300">{formatPrice(model.inputPrice)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 text-gray-400 dark:text-slate-500">
                                                        <span className="text-[10px]">OUT</span>
                                                        <span className="font-mono text-gray-600 dark:text-slate-300">{formatPrice(model.outputPrice)}</span>
                                                    </div>
                                                </div>

                                                {/* Cost Tier */}
                                                <div className={clsx("font-bold text-sm min-w-[3rem] text-right", tierColor)}>
                                                    {getCostTier(model)}
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleRefreshPricing(model.id)}
                                                        disabled={isRefreshing}
                                                        className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors disabled:opacity-50"
                                                        title="Refresh pricing"
                                                    >
                                                        <RefreshCw className={clsx("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
                                                    </button>
                                                    <button
                                                        onClick={() => removeModel(model.id)}
                                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                        title="Remove model"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-3 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800">
                        <p className="text-xs text-gray-500 dark:text-slate-400 text-center">
                            Prices per million tokens •
                            <Eye className="inline w-3 h-3 mx-1 text-purple-500" /> Vision •
                            <Mic className="inline w-3 h-3 mx-1 text-green-500" /> Audio
                        </p>
                    </div>
                </div>
            </div>

            {/* Import Browser */}
            <ImportBrowser
                isOpen={showImportBrowser}
                onClose={() => setShowImportBrowser(false)}
                availableModels={availableModels}
                existingIds={existingIds}
                onImport={handleImportModels}
                isLoading={isLoading}
            />
        </>
    );
}
