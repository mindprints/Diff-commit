import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Model, MODELS as SEED_MODELS } from '../constants/models';
import { ParsedModel, fetchOpenRouterModels, fetchModelPricing } from '../services/openRouterService';

const STORAGE_KEY = 'diff-commit-models';

/**
 * Extended Model interface with optional modality
 */
export interface ExtendedModel extends Model {
    modality?: string;
    description?: string;
    isImported?: boolean;
}

interface ModelsContextType {
    models: ExtendedModel[];
    isLoading: boolean;
    error: string | null;
    addModel: (model: ParsedModel) => void;
    addModels: (models: ParsedModel[]) => void;
    removeModel: (modelId: string) => void;
    updatePricing: (modelId: string, apiKey: string) => Promise<void>;
    fetchAvailableModels: (apiKey: string) => Promise<ParsedModel[]>;
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
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
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

    const updatePricing = useCallback(async (modelId: string, apiKey: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const pricing = await fetchModelPricing(modelId, apiKey);
            setModels(prev => prev.map(m =>
                m.id === modelId ? { ...m, inputPrice: pricing.inputPrice, outputPrice: pricing.outputPrice } : m
            ));
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Failed to fetch pricing';
            setError(message);
            throw e;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchAvailableModels = useCallback(async (apiKey: string): Promise<ParsedModel[]> => {
        setIsLoading(true);
        setError(null);
        try {
            return await fetchOpenRouterModels(apiKey);
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Failed to fetch models';
            setError(message);
            throw e;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const resetToDefaults = useCallback(() => {
        setModels(SEED_MODELS.map(seedToExtended));
    }, []);

    const getModel = useCallback((modelId: string) => {
        return models.find(m => m.id === modelId);
    }, [models]);

    return (
        <ModelsContext.Provider value={{
            models, isLoading, error, addModel, addModels,
            removeModel, updatePricing, fetchAvailableModels, resetToDefaults, getModel
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
