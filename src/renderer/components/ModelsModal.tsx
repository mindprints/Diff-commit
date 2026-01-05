import React, { useState, useEffect } from 'react';
import { X, Check, Cpu, MessageSquare, RefreshCw, Trash2, Plus, Eye, Mic, Search, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { Model, getCostTier, getCostTierColor } from '../constants/models';
import { useModels, ExtendedModel } from '../hooks/useModels';
import { ParsedModel, supportsVision, supportsAudio } from '../services/openRouterService';

interface ModelsModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedModel: Model;
    onSetDefault: (model: Model) => void;
    apiKey?: string;
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

export function ModelsModal({ isOpen, onClose, selectedModel, onSetDefault, apiKey }: ModelsModalProps) {
    const {
        models,
        isLoading,
        error,
        addModels,
        removeModel,
        updatePricing,
        fetchAvailableModels
    } = useModels();

    const [showImportBrowser, setShowImportBrowser] = useState(false);
    const [availableModels, setAvailableModels] = useState<ParsedModel[]>([]);
    const [refreshingId, setRefreshingId] = useState<string | null>(null);

    // Fetch available models when import browser opens
    const handleOpenImport = async () => {
        if (!apiKey) {
            alert('OpenRouter API key required. Set it in your environment.');
            return;
        }
        try {
            const available = await fetchAvailableModels(apiKey);
            setAvailableModels(available);
            setShowImportBrowser(true);
        } catch (e) {
            console.error('Failed to fetch models:', e);
        }
    };

    const handleRefreshPricing = async (modelId: string) => {
        if (!apiKey) return;
        setRefreshingId(modelId);
        try {
            await updatePricing(modelId, apiKey);
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

    const existingIds = new Set(models.map(m => m.id));

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

                    {/* Models List */}
                    <div className="overflow-y-auto max-h-[calc(80vh-140px)] p-4">
                        <div className="space-y-2">
                            {models.map((model) => {
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
                                                        disabled={isRefreshing || !apiKey}
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
