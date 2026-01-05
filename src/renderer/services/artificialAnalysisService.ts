/**
 * Artificial Analysis API Service
 * Handles fetching and matching benchmark data with OpenRouter models
 */

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

/**
 * Parsed benchmark data for our application
 */
export interface ModelBenchmark {
    modelName: string;
    creator: string;
    intelligenceIndex?: number;
    codingIndex?: number;
    mathIndex?: number;
    outputSpeed?: number;       // tokens per second
    latency?: number;           // milliseconds
    priceInput?: number;        // per million tokens
    priceOutput?: number;       // per million tokens
}

const CACHE_KEY = 'aa-benchmarks-cache';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
    timestamp: number;
    data: ModelBenchmark[];
}

/**
 * Load benchmarks from localStorage cache
 */
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

/**
 * Save benchmarks to localStorage cache
 */
function saveToCache(data: ModelBenchmark[]): void {
    try {
        const cache: CacheEntry = {
            timestamp: Date.now(),
            data
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        console.log('[ArtificialAnalysis] Saved', data.length, 'benchmarks to cache');
    } catch (e) {
        console.warn('[ArtificialAnalysis] Failed to save cache:', e);
    }
}

/**
 * Parse raw API response to our benchmark format
 * The API may return an array directly or wrap it in an object
 */
function parseBenchmarks(raw: unknown): ModelBenchmark[] {
    // Handle object wrapper - check common wrapper keys
    let models: Record<string, unknown>[];

    if (Array.isArray(raw)) {
        models = raw;
    } else if (raw && typeof raw === 'object') {
        // Try common wrapper keys
        const obj = raw as Record<string, unknown>;
        if (Array.isArray(obj.data)) {
            models = obj.data;
        } else if (Array.isArray(obj.models)) {
            models = obj.models;
        } else if (Array.isArray(obj.results)) {
            models = obj.results;
        } else {
            console.log('[ArtificialAnalysis] Response structure:', Object.keys(obj));
            console.log('[ArtificialAnalysis] First few keys sample:', JSON.stringify(obj).substring(0, 500));
            console.warn('[ArtificialAnalysis] Could not find models array in response');
            return [];
        }
    } else {
        console.warn('[ArtificialAnalysis] Unexpected response format:', typeof raw);
        return [];
    }

    console.log('[ArtificialAnalysis] Found', models.length, 'models in response');

    // Log first model's keys to discover field names
    if (models.length > 0) {
        console.log('[ArtificialAnalysis] First model fields:', Object.keys(models[0]));
        console.log('[ArtificialAnalysis] First model sample:', JSON.stringify(models[0]).substring(0, 400));
    }

    // Helper to get value from various possible field names
    const getValue = (item: Record<string, unknown>, ...keys: string[]): unknown => {
        for (const key of keys) {
            if (item[key] !== undefined) return item[key];
        }
        return undefined;
    };

    const getNumber = (item: Record<string, unknown>, ...keys: string[]): number | undefined => {
        const val = getValue(item, ...keys);
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            const num = parseFloat(val);
            return isNaN(num) ? undefined : num;
        }
        return undefined;
    };

    const getString = (item: Record<string, unknown>, ...keys: string[]): string => {
        const val = getValue(item, ...keys);
        return typeof val === 'string' ? val : '';
    };

    // Helper to get nested object value
    const getNestedString = (item: Record<string, unknown>, path: string): string => {
        const parts = path.split('.');
        let current: unknown = item;
        for (const part of parts) {
            if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
                current = (current as Record<string, unknown>)[part];
            } else {
                return '';
            }
        }
        return typeof current === 'string' ? current : '';
    };

    const getNestedNumber = (item: Record<string, unknown>, path: string): number | undefined => {
        const parts = path.split('.');
        let current: unknown = item;
        for (const part of parts) {
            if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
                current = (current as Record<string, unknown>)[part];
            } else {
                return undefined;
            }
        }
        if (typeof current === 'number') return current;
        if (typeof current === 'string') {
            const num = parseFloat(current);
            return isNaN(num) ? undefined : num;
        }
        return undefined;
    };

    const parsed = models
        .map(item => {
            // Try various field name conventions for model name
            const modelName = getString(item, 'model_name', 'name', 'model', 'modelName', 'display_name');
            if (!modelName) return null;

            // Extract creator from nested model_creator object or flat field
            const creator = getNestedString(item, 'model_creator.name') ||
                getString(item, 'creator', 'provider', 'organization');

            // Extract benchmark scores from nested evaluations object
            const intelligenceIndex = getNestedNumber(item, 'evaluations.artificial_analysis_intelligence_index') ??
                getNumber(item, 'intelligence_index', 'intelligenceIndex');
            const codingIndex = getNestedNumber(item, 'evaluations.artificial_analysis_coding_index') ??
                getNumber(item, 'coding_index', 'codingIndex');
            const mathIndex = getNestedNumber(item, 'evaluations.artificial_analysis_math_index') ??
                getNumber(item, 'math_index', 'mathIndex');

            // Extract speed metrics from top-level median_* fields
            const outputSpeed = getNumber(item, 'median_output_tokens_per_second', 'output_speed', 'outputSpeed');
            const latency = getNumber(item, 'median_time_to_first_token_seconds', 'latency', 'ttft');

            return {
                modelName,
                creator,
                intelligenceIndex,
                codingIndex,
                mathIndex,
                outputSpeed,
                latency,
                priceInput: getNumber(item, 'price_input', 'priceInput', 'input_price'),
                priceOutput: getNumber(item, 'price_output', 'priceOutput', 'output_price'),
            };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

    console.log('[ArtificialAnalysis] Parsed', parsed.length, 'valid benchmarks');
    if (parsed.length > 0) {
        console.log('[ArtificialAnalysis] Sample parsed benchmark:', JSON.stringify(parsed[0]));
    }
    return parsed;
}

/**
 * Fetch benchmarks from Artificial Analysis API
 * Uses IPC bridge in Electron, with localStorage caching
 */
export async function fetchBenchmarks(forceRefresh = false): Promise<ModelBenchmark[]> {
    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
        const cached = loadFromCache();
        if (cached) return cached;
    }

    // Fetch from API via IPC
    if (typeof window !== 'undefined' && window.electron?.artificialAnalysis) {
        try {
            const raw = await window.electron.artificialAnalysis.fetchBenchmarks();
            const benchmarks = parseBenchmarks(raw);
            saveToCache(benchmarks);
            return benchmarks;
        } catch (e) {
            console.error('[ArtificialAnalysis] API fetch failed:', e);
            // Return stale cache if available
            const staleCache = loadFromCache();
            if (staleCache) {
                console.log('[ArtificialAnalysis] Returning stale cache due to error');
                return staleCache;
            }
            throw e;
        }
    }

    throw new Error('Artificial Analysis not available in browser mode');
}

/**
 * Normalize a model name for fuzzy matching
 * Removes special characters, normalizes spacing, handles version numbers
 */
function normalizeForMatch(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')  // Replace special chars with space
        .replace(/\s+/g, ' ')           // Normalize multiple spaces
        .trim();
}

/**
 * Extract key identifiers from model name for matching
 * Returns array of tokens that identify the model
 */
function extractModelTokens(name: string): string[] {
    const normalized = normalizeForMatch(name);
    // Filter out common words and short tokens
    const stopWords = new Set(['ai', 'model', 'v1', 'free', 'pro', 'plus', 'chat', 'instruct', 'preview']);
    return normalized
        .split(' ')
        .filter(token => token.length > 1 && !stopWords.has(token));
}

/**
 * Calculate similarity score between two model names (0-1)
 */
function calculateSimilarity(name1: string, name2: string): number {
    const tokens1 = extractModelTokens(name1);
    const tokens2 = extractModelTokens(name2);

    if (tokens1.length === 0 || tokens2.length === 0) return 0;

    let matches = 0;
    for (const t1 of tokens1) {
        for (const t2 of tokens2) {
            // Check for exact match or substring match
            if (t1 === t2 || t1.includes(t2) || t2.includes(t1)) {
                matches++;
                break;
            }
        }
    }

    // Return ratio of matched tokens
    const maxTokens = Math.max(tokens1.length, tokens2.length);
    return matches / maxTokens;
}

/**
 * Match an OpenRouter model to its Artificial Analysis benchmark
 * Uses fuzzy matching on model name and provider/creator
 */
export function matchBenchmark(
    modelId: string,
    modelName: string,
    benchmarks: ModelBenchmark[]
): ModelBenchmark | undefined {
    if (!benchmarks.length) return undefined;

    // Extract provider from model ID (e.g., "anthropic/claude-3.5-sonnet" -> "anthropic")
    const provider = modelId.split('/')[0]?.toLowerCase() || '';

    let bestMatch: ModelBenchmark | undefined;
    let bestScore = 0;
    const MIN_MATCH_THRESHOLD = 0.5;

    for (const benchmark of benchmarks) {
        // Check if provider/creator matches
        const creatorMatch = benchmark.creator.toLowerCase().includes(provider) ||
            provider.includes(benchmark.creator.toLowerCase());

        // Calculate name similarity
        const nameSimilarity = calculateSimilarity(modelName, benchmark.modelName);

        // Boost score if creator matches
        const score = creatorMatch ? nameSimilarity * 1.2 : nameSimilarity;

        if (score > bestScore && score >= MIN_MATCH_THRESHOLD) {
            bestScore = score;
            bestMatch = benchmark;
        }
    }

    if (bestMatch) {
        console.log(`[ArtificialAnalysis] Matched "${modelName}" -> "${bestMatch.modelName}" (score: ${bestScore.toFixed(2)})`);
    }

    return bestMatch;
}

/**
 * Clear the benchmark cache
 */
export function clearBenchmarkCache(): void {
    try {
        localStorage.removeItem(CACHE_KEY);
        console.log('[ArtificialAnalysis] Cache cleared');
    } catch (e) {
        console.warn('[ArtificialAnalysis] Failed to clear cache:', e);
    }
}

/**
 * Get cache info for debugging
 */
export function getCacheInfo(): { exists: boolean; age?: number; count?: number } {
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (!stored) return { exists: false };

        const cache: CacheEntry = JSON.parse(stored);
        return {
            exists: true,
            age: Date.now() - cache.timestamp,
            count: cache.data.length
        };
    } catch {
        return { exists: false };
    }
}
