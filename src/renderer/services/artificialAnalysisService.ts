/**
 * Artificial Analysis API Service
 * Handles fetching and matching benchmark data with OpenRouter models
 */

import {
    matchBenchmark as matchBenchmarkCore,
    parseBenchmarks as parseBenchmarksCore,
    type ModelBenchmark,
} from '../../shared/artificialAnalysis';

export type { ModelBenchmark };

/**
 * Raw benchmark data from Artificial Analysis API
 */
export interface AABenchmarkRaw {
    model_name?: string;
    creator?: string;
    intelligence_index?: number;
    coding_index?: number;
    math_index?: number;
    output_speed?: number;
    latency?: number;
    price_input?: number;
    price_output?: number;
}

const CACHE_KEY = 'aa-benchmarks-cache';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
    timestamp: number;
    data: ModelBenchmark[];
}

function loadFromCache(): ModelBenchmark[] | null {
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (!stored) return null;

        const cache: CacheEntry = JSON.parse(stored);
        const age = Date.now() - cache.timestamp;

        if (age > CACHE_DURATION_MS) {
            console.log('[ArtificialAnalysis] Cache expired, age:', Math.round(age / 1000 / 60), 'minutes');
            return null;
        }

        console.log('[ArtificialAnalysis] Using cached benchmarks, age:', Math.round(age / 1000 / 60), 'minutes');
        return cache.data;
    } catch (e) {
        console.warn('[ArtificialAnalysis] Failed to load cache:', e);
        return null;
    }
}

function saveToCache(data: ModelBenchmark[]): void {
    try {
        const cache: CacheEntry = {
            timestamp: Date.now(),
            data,
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        console.log('[ArtificialAnalysis] Saved', data.length, 'benchmarks to cache');
    } catch (e) {
        console.warn('[ArtificialAnalysis] Failed to save cache:', e);
    }
}

function loadFromCacheIgnoreExpiry(): ModelBenchmark[] | null {
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (!stored) return null;
        const cache: CacheEntry = JSON.parse(stored);
        return cache.data;
    } catch (e) {
        console.warn('[ArtificialAnalysis] Failed to load cache:', e);
        return null;
    }
}

export async function fetchBenchmarks(forceRefresh = false): Promise<ModelBenchmark[]> {
    if (!forceRefresh) {
        const cached = loadFromCache();
        if (cached) return cached;
    }

    if (typeof window !== 'undefined' && window.electron?.artificialAnalysis) {
        try {
            const raw = await window.electron.artificialAnalysis.fetchBenchmarks();
            const benchmarks = parseBenchmarksCore(raw);
            saveToCache(benchmarks);
            return benchmarks;
        } catch (e) {
            console.error('[ArtificialAnalysis] API fetch failed:', e);
            const staleCache = loadFromCacheIgnoreExpiry();
            if (staleCache) {
                console.log('[ArtificialAnalysis] Returning stale cache due to error');
                return staleCache;
            }
            throw e;
        }
    }

    throw new Error('Artificial Analysis not available in browser mode');
}

export function matchBenchmark(
    modelId: string,
    modelName: string,
    benchmarks: ModelBenchmark[]
): ModelBenchmark | undefined {
    const match = matchBenchmarkCore(modelId, modelName, benchmarks);
    if (match) {
        console.log(`[ArtificialAnalysis] Matched "${modelName}" -> "${match.modelName}"`);
    }
    return match;
}

export function clearBenchmarkCache(): void {
    try {
        localStorage.removeItem(CACHE_KEY);
        console.log('[ArtificialAnalysis] Cache cleared');
    } catch (e) {
        console.warn('[ArtificialAnalysis] Failed to clear cache:', e);
    }
}

export function getCacheInfo(): { exists: boolean; age?: number; count?: number } {
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (!stored) return { exists: false };

        const cache: CacheEntry = JSON.parse(stored);
        return {
            exists: true,
            age: Date.now() - cache.timestamp,
            count: cache.data.length,
        };
    } catch {
        return { exists: false };
    }
}
