import React, { useState, useEffect, useMemo } from 'react';
import { X, Cpu, MessageSquare, RefreshCw, Trash2, Plus, Eye, Mic, Search, Loader2, Zap, Brain, Code2, Calculator, BarChart3, Star, Image, FileText, Wrench, Palette, Radio } from 'lucide-react';
import clsx from 'clsx';
import { Model, getCostTier, getCostTierColor } from '../constants/models';
import { useModels } from '../hooks/useModels';
import { ParsedModel, supportsVision, supportsAudio, supportsTools, supportsImageGeneration, supportsFileInput, supportsSearchCapability } from '../services/openRouterService';
import { fetchBenchmarks as fetchAABenchmarks, matchBenchmark, ModelBenchmark } from '../services/artificialAnalysisService';

// Task categories for filtering/sorting models
type TaskCategory = 'all' | 'coding' | 'intelligence' | 'math' | 'speed' | 'value' | 'search' | 'image-gen' | 'files';

const TASK_CATEGORIES: { value: TaskCategory; label: string; icon: React.ReactNode; description: string }[] = [
    { value: 'all', label: 'All Tasks', icon: <BarChart3 className="w-4 h-4" />, description: 'Default order' },
    { value: 'coding', label: 'Coding', icon: <Code2 className="w-4 h-4" />, description: 'Sort by coding benchmark' },
    { value: 'intelligence', label: 'Intelligence', icon: <Brain className="w-4 h-4" />, description: 'Sort by intelligence index' },
    { value: 'math', label: 'Math', icon: <Calculator className="w-4 h-4" />, description: 'Sort by math benchmark' },
    { value: 'speed', label: 'Speed', icon: <Zap className="w-4 h-4" />, description: 'Sort by tokens/second' },
    { value: 'value', label: 'Value', icon: <BarChart3 className="w-4 h-4" />, description: 'Best price/performance' },
    { value: 'search', label: 'Search', icon: <Search className="w-4 h-4" />, description: 'Search/web-capable models' },
    { value: 'image-gen', label: 'Image', icon: <Image className="w-4 h-4" />, description: 'Image generation models' },
    { value: 'files', label: 'Files', icon: <FileText className="w-4 h-4" />, description: 'PDF/file capable models' },
];

type ImportRankCategory = 'default' | 'intelligence' | 'coding' | 'math' | 'speed' | 'value';

interface ModelsModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedModel: Model;
    selectedImageModel: Model | null;
    onSetDefault: (model: Model) => void;
    onSetImageDefault: (model: Model) => void;
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
    benchmarks,
    existingIds,
    onImport,
    isLoading,
}: {
    isOpen: boolean;
    onClose: () => void;
    availableModels: ParsedModel[];
    benchmarks: ModelBenchmark[];
    existingIds: Set<string>;
    onImport: (models: ParsedModel[]) => void;
    isLoading: boolean;
}) {
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [capabilityFilters, setCapabilityFilters] = useState<Set<string>>(new Set());
    const [rankBy, setRankBy] = useState<ImportRankCategory>('intelligence');

    const toggleFilter = (filter: string) => {
        const newSet = new Set(capabilityFilters);
        if (newSet.has(filter)) {
            newSet.delete(filter);
        } else {
            newSet.add(filter);
        }
        setCapabilityFilters(newSet);
    };

    const candidates = useMemo(() => availableModels.map((m) => {
        const benchmark = matchBenchmark(m.id, m.name, benchmarks);
        return { model: m, benchmark };
    }), [availableModels, benchmarks]);

    const filtered = candidates.filter(({ model: m }) => {
        // Exclude already imported
        if (existingIds.has(m.id)) return false;

        // Text search
        const matchesSearch = !search ||
            m.name.toLowerCase().includes(search.toLowerCase()) ||
            m.provider.toLowerCase().includes(search.toLowerCase()) ||
            m.id.toLowerCase().includes(search.toLowerCase());

        if (!matchesSearch) return false;

        // Capability filters (AND logic - must match all selected)
        if (capabilityFilters.has('vision') && !supportsVision(m.modality)) return false;
        if (capabilityFilters.has('audio') && !supportsAudio(m.modality)) return false;
        if (capabilityFilters.has('tools') && !supportsTools(m.supportedParams)) return false;
        if (capabilityFilters.has('image-gen') && !supportsImageGeneration(m.modality, m.id, m.name, m.capabilities)) return false;
        if (capabilityFilters.has('search') && !supportsSearchCapability(m.id, m.name, m.capabilities, m.supportedParams)) return false;
        if (capabilityFilters.has('pdf') && !supportsFileInput(m.modality, m.supportedParams)) return false;

        return true;
    });

    const sorted = useMemo(() => {
        if (rankBy === 'default') return filtered;
        return [...filtered].sort((a, b) => {
            const aBench = a.benchmark;
            const bBench = b.benchmark;
            if (!aBench && !bBench) return 0;
            if (!aBench) return 1;
            if (!bBench) return -1;

            let aVal = 0;
            let bVal = 0;
            switch (rankBy) {
                case 'intelligence':
                    aVal = aBench.intelligenceIndex ?? 0;
                    bVal = bBench.intelligenceIndex ?? 0;
                    break;
                case 'coding':
                    aVal = aBench.codingIndex ?? 0;
                    bVal = bBench.codingIndex ?? 0;
                    break;
                case 'math':
                    aVal = aBench.mathIndex ?? 0;
                    bVal = bBench.mathIndex ?? 0;
                    break;
                case 'speed':
                    aVal = aBench.outputSpeed ?? 0;
                    bVal = bBench.outputSpeed ?? 0;
                    break;
                case 'value': {
                    const aPrice = (a.model.inputPrice || 0) + (a.model.outputPrice || 0);
                    const bPrice = (b.model.inputPrice || 0) + (b.model.outputPrice || 0);
                    aVal = aPrice > 0 ? (aBench.intelligenceIndex ?? 0) / aPrice : 0;
                    bVal = bPrice > 0 ? (bBench.intelligenceIndex ?? 0) / bPrice : 0;
                    break;
                }
                default:
                    break;
            }
            return bVal - aVal;
        });
    }, [filtered, rankBy]);

    if (!isOpen) return null;

    const handleImport = () => {
        const toImport = availableModels.filter(m => selected.has(m.id));
        onImport(toImport);
        setSelected(new Set());
        onClose();
    };

    const handleCloseImport = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setSelected(new Set());
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={handleCloseImport} />
            <div
                className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden border border-gray-200 dark:border-slate-700"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Import from OpenRouter</h3>
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                            {filtered.length} models available • {selected.size} selected
                        </p>
                    </div>
                    <button onClick={handleCloseImport} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Capability Filters */}
                <div className="px-6 py-3 border-b border-gray-100 dark:border-slate-800">
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => toggleFilter('vision')}
                            title="Can process images as input (vision/multimodal)"
                            className={clsx(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                                capabilityFilters.has('vision')
                                    ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700"
                                    : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border border-transparent hover:bg-gray-200 dark:hover:bg-slate-700"
                            )}
                        >
                            <Eye className="w-3.5 h-3.5" /> Vision
                        </button>
                        <button
                            onClick={() => toggleFilter('audio')}
                            title="Can process audio input"
                            className={clsx(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                                capabilityFilters.has('audio')
                                    ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700"
                                    : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border border-transparent hover:bg-gray-200 dark:hover:bg-slate-700"
                            )}
                        >
                            <Mic className="w-3.5 h-3.5" /> Audio
                        </button>
                        <button
                            onClick={() => toggleFilter('tools')}
                            title="Supports tool/function calling"
                            className={clsx(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                                capabilityFilters.has('tools')
                                    ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700"
                                    : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border border-transparent hover:bg-gray-200 dark:hover:bg-slate-700"
                            )}
                        >
                            <Wrench className="w-3.5 h-3.5" /> Tools
                        </button>
                        <button
                            onClick={() => toggleFilter('image-gen')}
                            title="Can generate images"
                            className={clsx(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                                capabilityFilters.has('image-gen')
                                    ? "bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 border border-pink-300 dark:border-pink-700"
                                    : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border border-transparent hover:bg-gray-200 dark:hover:bg-slate-700"
                            )}
                        >
                            <Image className="w-3.5 h-3.5" /> Image Gen
                        </button>
                        <button
                            onClick={() => toggleFilter('search')}
                            title="Has built-in search/web retrieval capability"
                            className={clsx(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                                capabilityFilters.has('search')
                                    ? "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-700"
                                    : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border border-transparent hover:bg-gray-200 dark:hover:bg-slate-700"
                            )}
                        >
                            <Search className="w-3.5 h-3.5" /> Search
                        </button>
                        <button
                            onClick={() => toggleFilter('pdf')}
                            title="Can handle files/PDFs (often via vision/file support)"
                            className={clsx(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                                capabilityFilters.has('pdf')
                                    ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                                    : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border border-transparent hover:bg-gray-200 dark:hover:bg-slate-700"
                            )}
                        >
                            <FileText className="w-3.5 h-3.5" /> PDF/Files
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                        <span className="text-[11px] text-gray-500 dark:text-slate-400 self-center">Rank by:</span>
                        {([
                            ['default', 'Default'],
                            ['intelligence', 'Intelligence'],
                            ['coding', 'Coding'],
                            ['math', 'Math'],
                            ['speed', 'Speed'],
                            ['value', 'Value'],
                        ] as Array<[ImportRankCategory, string]>).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => setRankBy(key)}
                                title={`Sort import list by ${label}`}
                                className={clsx(
                                    "px-2.5 py-1 text-[11px] rounded-md border transition-colors",
                                    rankBy === key
                                        ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700"
                                        : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-transparent hover:bg-gray-200 dark:hover:bg-slate-700"
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
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
                    ) : sorted.length === 0 ? (
                        <p className="text-center text-gray-500 dark:text-slate-400 py-8">
                            {search ? 'No models match your search' : 'All available models already imported'}
                        </p>
                    ) : (
                        <div className="grid gap-2">
                            {sorted.map(({ model, benchmark }) => (
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
                                                {supportsTools(model.supportedParams) && (
                                                    <Wrench className="w-3.5 h-3.5 text-blue-500" title="Supports tools/functions" />
                                                )}
                                                {supportsImageGeneration(model.modality, model.id, model.name, model.capabilities) && (
                                                    <Image className="w-3.5 h-3.5 text-pink-500" title="Image generation" />
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-slate-400">{model.provider}</div>
                                            {benchmark ? (
                                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                    {benchmark.intelligenceIndex !== undefined && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                                            IQ {benchmark.intelligenceIndex.toFixed(0)}
                                                        </span>
                                                    )}
                                                    {benchmark.codingIndex !== undefined && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                                            Code {benchmark.codingIndex.toFixed(0)}
                                                        </span>
                                                    )}
                                                    {benchmark.outputSpeed !== undefined && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                                                            Speed {benchmark.outputSpeed.toFixed(0)}/s
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="text-[10px] mt-1 text-gray-400 dark:text-slate-500">No AA benchmark match</div>
                                            )}
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
                        onClick={handleCloseImport}
                        className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        Back to Model Manager
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

export function ModelsModal({ isOpen, onClose, selectedModel, selectedImageModel, onSetDefault, onSetImageDefault }: ModelsModalProps) {
    const {
        models,
        isLoading,
        error,
        addModels,
        removeModel,
        updatePricing,
        pingModel,
        fetchAvailableModels,
        fetchBenchmarks: refreshBenchmarks,
    } = useModels();

    const [showImportBrowser, setShowImportBrowser] = useState(false);
    const [availableModels, setAvailableModels] = useState<ParsedModel[]>([]);
    const [importBenchmarks, setImportBenchmarks] = useState<ModelBenchmark[]>([]);
    const [isImportLoading, setIsImportLoading] = useState(false);
    const [refreshingId, setRefreshingId] = useState<string | null>(null);
    const [pingingId, setPingingId] = useState<string | null>(null);
    const [pingResults, setPingResults] = useState<Record<string, { ok: boolean; latencyMs?: number; message: string }>>({});
    const [taskCategory, setTaskCategory] = useState<TaskCategory>('all');
    const [benchmarksLoaded, setBenchmarksLoaded] = useState(false);

    // Auto-fetch benchmarks when modal opens (if not already loaded)
    useEffect(() => {
        if (isOpen && !benchmarksLoaded && !isLoading) {
            refreshBenchmarks()
                .then(() => setBenchmarksLoaded(true))
                .catch((e) => console.error('Failed to fetch benchmarks:', e));
        }
    }, [isOpen, benchmarksLoaded, isLoading, refreshBenchmarks]);

    // Sort models based on selected task category
    const sortedModels = useMemo(() => {
        // Capability-based filtering (not sorting)
        if (taskCategory === 'image-gen') {
            return models.filter(m => supportsImageGeneration(m.modality, m.id, m.name, m.capabilities));
        }
        if (taskCategory === 'files') {
            return models.filter(m => supportsFileInput(m.modality, m.supportedParams));
        }
        if (taskCategory === 'search') {
            return models.filter(m => supportsSearchCapability(m.id, m.name, m.capabilities, m.supportedParams));
        }

        if (taskCategory === 'all') return models;

        // Benchmark-based sorting
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
                {
                    // Value = intelligence / (input price + output price), higher is better
                    // Use nullish coalescing to treat 0 as valid (free models)
                    const aPrice = (a.inputPrice ?? 1) + (a.outputPrice ?? 1);
                    const bPrice = (b.inputPrice ?? 1) + (b.outputPrice ?? 1);
                    // Guard against zero price (free models get max value if they have intelligence)
                    aVal = aPrice > 0 ? (a.intelligenceIndex ?? 0) / aPrice : 0;
                    bVal = bPrice > 0 ? (b.intelligenceIndex ?? 0) / bPrice : 0;
                    break;
                }
            }
            return bVal - aVal; // Descending order
        });
    }, [models, taskCategory]);

    // Fetch available models when import browser opens
    const handleOpenImport = async () => {
        setIsImportLoading(true);
        try {
            const [available, aaBenchmarks] = await Promise.all([
                fetchAvailableModels(),
                fetchAABenchmarks().catch((e) => {
                    console.warn('Failed to fetch AA benchmarks for import ranking:', e);
                    return [];
                }),
            ]);
            setAvailableModels(available);
            setImportBenchmarks(aaBenchmarks);
            setShowImportBrowser(true);
        } catch (e) {
            console.error('Failed to fetch models:', e);
        } finally {
            setIsImportLoading(false);
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

    const handlePingModel = async (modelId: string) => {
        setPingingId(modelId);
        try {
            const result = await pingModel(modelId);
            setPingResults((prev) => ({
                ...prev,
                [modelId]: {
                    ok: result.ok,
                    latencyMs: result.latencyMs,
                    message: result.message,
                },
            }));
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Ping failed';
            setPingResults((prev) => ({
                ...prev,
                [modelId]: {
                    ok: false,
                    message,
                },
            }));
        } finally {
            setPingingId(null);
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
                    onClick={() => {
                        if (!showImportBrowser) {
                            onClose();
                        }
                    }}
                />

                {/* Modal */}
                <div className={clsx(
                    "relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden border border-gray-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200",
                    showImportBrowser && "pointer-events-none"
                )}>
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
                                disabled={showImportBrowser}
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
                    <div className="px-6 py-3 border-b border-gray-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-slate-400">Sort by:</span>
                        {TASK_CATEGORIES.map((cat) => (
                            <button
                                key={cat.value}
                                onClick={() => setTaskCategory(cat.value)}
                                title={cat.description}
                                className={clsx(
                                    "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors",
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
                            onClick={() => refreshBenchmarks(true)}
                            disabled={isLoading}
                            className="ml-auto flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors"
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
                                const isImageSelected = selectedImageModel?.id === model.id;
                                const isImageCapable = supportsImageGeneration(model.modality, model.id, model.name, model.capabilities);
                                const isSearchCapable = supportsSearchCapability(model.id, model.name, model.capabilities, model.supportedParams);
                                const tierColor = getCostTierColor(model);
                                const isRefreshing = refreshingId === model.id;
                                const isPinging = pingingId === model.id;
                                const pingResult = pingResults[model.id];

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
                                            {/* Default selection buttons */}
                                            <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                                {/* Star button for text default */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSetDefault(model);
                                                        onClose();
                                                    }}
                                                    className={clsx(
                                                        "p-1.5 rounded-lg transition-colors",
                                                        isSelected
                                                            ? "text-amber-500 bg-amber-50 dark:bg-amber-900/30"
                                                            : "text-gray-300 hover:text-amber-400 hover:bg-amber-50 dark:text-slate-600 dark:hover:text-amber-400 dark:hover:bg-amber-900/20"
                                                    )}
                                                    title={isSelected ? "Current text default" : "Set as text default"}
                                                >
                                                    <Star className={clsx("w-4 h-4", isSelected && "fill-current")} />
                                                </button>
                                                {/* Palette button for image default - only for image-capable models */}
                                                {isImageCapable && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onSetImageDefault(model);
                                                            onClose();
                                                        }}
                                                        className={clsx(
                                                            "p-1.5 rounded-lg transition-colors",
                                                            isImageSelected
                                                                ? "text-pink-500 bg-pink-50 dark:bg-pink-900/30"
                                                                : "text-gray-300 hover:text-pink-400 hover:bg-pink-50 dark:text-slate-600 dark:hover:text-pink-400 dark:hover:bg-pink-900/20"
                                                        )}
                                                        title={isImageSelected ? "Current image default" : "Set as image default"}
                                                    >
                                                        <Palette className={clsx("w-4 h-4", isImageSelected && "fill-current")} />
                                                    </button>
                                                )}
                                            </div>
                                            {/* Model Info - Clickable */}
                                            <button
                                                onClick={() => {
                                                    onSetDefault(model);
                                                    onClose();
                                                }}
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
                                                    <span
                                                        className={clsx(
                                                            "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border",
                                                            isSearchCapable
                                                                ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700"
                                                                : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                                                        )}
                                                        title={isSearchCapable
                                                            ? "Likely supports web/search capability"
                                                            : "Native search support is unclear; :online/plugin search can still be used"}
                                                    >
                                                        <Search className="w-2.5 h-2.5" />
                                                        {isSearchCapable ? "Search" : "Search?"}
                                                    </span>
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
                                                {pingResult && (
                                                    <div
                                                        className={clsx(
                                                            "text-[10px] mt-1",
                                                            pingResult.ok
                                                                ? "text-emerald-600 dark:text-emerald-400"
                                                                : "text-red-600 dark:text-red-400"
                                                        )}
                                                        title={pingResult.message}
                                                    >
                                                        {pingResult.ok
                                                            ? `Ping ${pingResult.latencyMs ?? '-'}ms`
                                                            : 'Ping failed'}
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
                                                        onClick={() => handlePingModel(model.id)}
                                                        disabled={isPinging}
                                                        className="p-1.5 text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition-colors disabled:opacity-50"
                                                        title="Ping model"
                                                    >
                                                        <Radio className={clsx("w-3.5 h-3.5", isPinging && "animate-pulse")} />
                                                    </button>
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
                            <Star className="inline w-3 h-3 mx-1 text-amber-500" /> Text Default •
                            <Palette className="inline w-3 h-3 mx-1 text-pink-500" /> Image Default •
                            <Eye className="inline w-3 h-3 mx-1 text-purple-500" /> Vision •
                            <Mic className="inline w-3 h-3 mx-1 text-green-500" /> Audio •
                            <Search className="inline w-3 h-3 mx-1 text-cyan-500" /> Search
                        </p>
                    </div>
                </div>
            </div>

            {/* Import Browser */}
            <ImportBrowser
                isOpen={showImportBrowser}
                onClose={() => setShowImportBrowser(false)}
                availableModels={availableModels}
                benchmarks={importBenchmarks}
                existingIds={existingIds}
                onImport={handleImportModels}
                isLoading={isLoading || isImportLoading}
            />
        </>
    );
}
