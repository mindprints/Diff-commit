import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Model, MODELS as SEED_MODELS } from '../constants/models';
import { ParsedModel, fetchOpenRouterModels, fetchModelPricing } from '../services/openRouterService';
import { fetchBenchmarks as fetchAABenchmarks, matchBenchmark, ModelBenchmark } from '../services/artificialAnalysisService';

const STORAGE_KEY = 'diff-commit-models';

/**
 * Extended Model interface with optional modality
 */
export interface ExtendedModel extends Model {
    modality?: string;
    description?: string;
    isImported?: boolean;
    // Benchmark data from Artificial Analysis
    intelligenceIndex?: number;
    codingIndex?: number;
    mathIndex?: number;
    outputSpeed?: number;       // tokens per second
    latency?: number;           // milliseconds
    benchmarkMatched?: boolean; // true if matched to AA benchmark
}

interface ModelsContextType {
    models: ExtendedModel[];
    isLoading: boolean;
    error: string | null;
    addModel: (model: ParsedModel) => void;
    addModels: (models: ParsedModel[]) => void;
    removeModel: (modelId: string) => void;
    updatePricing: (modelId: string) => Promise<void>;
    fetchAvailableModels: () => Promise<ParsedModel[]>;
    fetchBenchmarks: (forceRefresh?: boolean) => Promise<void>;
    resetToDefaults: () => void;
    getModel: (modelId: string) => ExtendedModel | undefined;
}

const ModelsContext = createContext<ModelsContextType | null>(null);

function parsedToExtended(parsed: ParsedModel): ExtendedModel {
    return {
        id: parsed.id,
        name: parsed.name,
        provider: parsed.provider,
        contextWindow: parsed.contextWindow,
        inputPrice: parsed.inputPrice,
        outputPrice: parsed.outputPrice,
        modality: parsed.modality,
        description: parsed.description,
        isImported: true,
    };
}

function seedToExtended(model: Model): ExtendedModel {
    return { ...model, modality: 'text', isImported: false };
}

function loadModels(): ExtendedModel[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored) as ExtendedModel[];
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {
        console.warn('Failed to load models:', e);
    }
    return SEED_MODELS.map(seedToExtended);
}

function saveModels(models: ExtendedModel[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
    } catch (e) {
        console.warn('Failed to save models:', e);
    }
}

export function ModelsProvider({ children }: { children: ReactNode }) {
    const [models, setModels] = useState<ExtendedModel[]>(() => loadModels());
    const [loadingCount, setLoadingCount] = useState(0);
    const [error, setError] = useState<string | null>(null);

    // Derive isLoading from loadingCount to handle concurrent operations
    const isLoading = loadingCount > 0;

    // Ref for stable getModel callback
    const modelsRef = useRef(models);

    useEffect(() => {
        modelsRef.current = models;
        saveModels(models);
    }, [models]);

    const addModel = useCallback((model: ParsedModel) => {
        setModels(prev => {
            if (prev.some(m => m.id === model.id)) return prev;
            return [...prev, parsedToExtended(model)];
        });
    }, []);

    const addModels = useCallback((newModels: ParsedModel[]) => {
        setModels(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const toAdd = newModels.filter(m => !existingIds.has(m.id)).map(parsedToExtended);
            return [...prev, ...toAdd];
        });
    }, []);

    const removeModel = useCallback((modelId: string) => {
        setModels(prev => prev.filter(m => m.id !== modelId));
    }, []);

    const updatePricing = useCallback(async (modelId: string) => {
        setLoadingCount(c => c + 1);
        setError(null);
        try {
            const pricing = await fetchModelPricing(modelId);
            setModels(prev => prev.map(m =>
                m.id === modelId ? { ...m, inputPrice: pricing.inputPrice, outputPrice: pricing.outputPrice } : m
            ));
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Failed to fetch pricing';
            setError(message);
            throw e;
        } finally {
            setLoadingCount(c => c - 1);
        }
    }, []);

    const fetchAvailableModels = useCallback(async (): Promise<ParsedModel[]> => {
        setLoadingCount(c => c + 1);
        setError(null);
        try {
            return await fetchOpenRouterModels();
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Failed to fetch models';
            setError(message);
            throw e;
        } finally {
            setLoadingCount(c => c - 1);
        }
    }, []);

    const fetchBenchmarks = useCallback(async (forceRefresh = false): Promise<void> => {
        setLoadingCount(c => c + 1);
        setError(null);
        try {
            const benchmarks = await fetchAABenchmarks(forceRefresh);
            console.log('[ModelsContext] Fetched', benchmarks.length, 'benchmarks, matching to', models.length, 'models');

            // Match benchmarks to models and update
            setModels(prev => prev.map(model => {
                const benchmark = matchBenchmark(model.id, model.name, benchmarks);
                if (benchmark) {
                    return {
                        ...model,
                        intelligenceIndex: benchmark.intelligenceIndex,
                        codingIndex: benchmark.codingIndex,
                        mathIndex: benchmark.mathIndex,
                        outputSpeed: benchmark.outputSpeed,
                        latency: benchmark.latency,
                        benchmarkMatched: true,
                    };
                }
                return { ...model, benchmarkMatched: false };
            }));
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Failed to fetch benchmarks';
            setError(message);
            console.error('[ModelsContext] Benchmark fetch error:', e);
            // Don't rethrow - benchmarks are optional enhancement
        } finally {
            setLoadingCount(c => c - 1);
        }
    }, [models.length]); // Depend on models.length to re-match when models change

    const resetToDefaults = useCallback(() => {
        setModels(SEED_MODELS.map(seedToExtended));
    }, []);

    const getModel = useCallback((modelId: string) => {
        return modelsRef.current.find(m => m.id === modelId);
    }, []);

    return (
        <ModelsContext.Provider value={{
            models, isLoading, error, addModel, addModels,
            removeModel, updatePricing, fetchAvailableModels, fetchBenchmarks, resetToDefaults, getModel
        }}>
            {children}
        </ModelsContext.Provider>
    );
}

export function useModels() {
    const context = useContext(ModelsContext);
    if (!context) {
        throw new Error('useModels must be used within a ModelsProvider');
    }
    return context;
}
