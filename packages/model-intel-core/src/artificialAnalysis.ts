export interface ModelBenchmark {
    modelName: string;
    creator: string;
    intelligenceIndex?: number;
    codingIndex?: number;
    mathIndex?: number;
    outputSpeed?: number;
    latency?: number;
    priceInput?: number;
    priceOutput?: number;
}

function getValue(item: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
        if (item[key] !== undefined) return item[key];
    }
    return undefined;
}

function getNumber(item: Record<string, unknown>, ...keys: string[]): number | undefined {
    const val = getValue(item, ...keys);
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const num = parseFloat(val);
        return Number.isNaN(num) ? undefined : num;
    }
    return undefined;
}

function getString(item: Record<string, unknown>, ...keys: string[]): string {
    const val = getValue(item, ...keys);
    return typeof val === 'string' ? val : '';
}

function getNestedString(item: Record<string, unknown>, path: string): string {
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
}

function getNestedNumber(item: Record<string, unknown>, path: string): number | undefined {
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
        return Number.isNaN(num) ? undefined : num;
    }
    return undefined;
}

function extractModelsArray(raw: unknown): Record<string, unknown>[] {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        if (Array.isArray(obj.data)) return obj.data as Record<string, unknown>[];
        if (Array.isArray(obj.models)) return obj.models as Record<string, unknown>[];
        if (Array.isArray(obj.results)) return obj.results as Record<string, unknown>[];
    }
    return [];
}

export function parseBenchmarks(raw: unknown): ModelBenchmark[] {
    const models = extractModelsArray(raw);
    if (!models.length) return [];

    return models
        .map((item) => {
            const modelName = getString(item, 'model_name', 'name', 'model', 'modelName', 'display_name');
            if (!modelName) return null;

            const creator = getNestedString(item, 'model_creator.name') ||
                getString(item, 'creator', 'provider', 'organization');
            if (!creator) return null;

            const intelligenceIndex = getNestedNumber(item, 'evaluations.artificial_analysis_intelligence_index') ??
                getNumber(item, 'intelligence_index', 'intelligenceIndex');
            const codingIndex = getNestedNumber(item, 'evaluations.artificial_analysis_coding_index') ??
                getNumber(item, 'coding_index', 'codingIndex');
            const mathIndex = getNestedNumber(item, 'evaluations.artificial_analysis_math_index') ??
                getNumber(item, 'math_index', 'mathIndex');
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
}

function normalizeForMatch(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeProviderForMatch(str: string): string {
    return normalizeForMatch(str)
        .replace(/\b(ai|labs|lab|research|inc|llc|corp|corporation)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractModelTokens(name: string): string[] {
    const normalized = normalizeForMatch(name);
    const stopWords = new Set(['ai', 'model', 'v1', 'v2', 'v3', 'free', 'pro', 'plus', 'chat', 'instruct', 'preview', 'latest']);
    return normalized
        .split(' ')
        .filter((token) => token.length > 1 && !stopWords.has(token));
}

function providerAliases(provider: string): string[] {
    const p = normalizeProviderForMatch(provider);
    if (!p) return [];
    const aliases = new Set<string>([p]);

    const map: Record<string, string[]> = {
        'x ai': ['xai'],
        xai: ['x ai'],
        'z ai': ['zai'],
        zai: ['z ai'],
        'stability ai': ['stability'],
        stability: ['stability ai'],
        'black forest': ['black forest labs', 'bfl'],
        'black forest labs': ['black forest', 'bfl'],
        google: ['google deepmind', 'gemini'],
        openai: ['open ai'],
        'open ai': ['openai'],
    };

    for (const [key, values] of Object.entries(map)) {
        if (p === key) {
            values.forEach((v) => aliases.add(v));
        }
    }

    return Array.from(aliases);
}

function calculateSimilarity(name1: string, name2: string): number {
    const tokens1 = extractModelTokens(name1);
    const tokens2 = extractModelTokens(name2);
    if (tokens1.length === 0 || tokens2.length === 0) return 0;

    let matches = 0;
    for (const t1 of tokens1) {
        for (const t2 of tokens2) {
            if (t1 === t2 || t1.includes(t2) || t2.includes(t1)) {
                matches++;
                break;
            }
        }
    }

    const maxTokens = Math.max(tokens1.length, tokens2.length);
    return matches / maxTokens;
}

export function matchBenchmark(
    modelId: string,
    modelName: string,
    benchmarks: ModelBenchmark[],
    minMatchThreshold = 0.5
): ModelBenchmark | undefined {
    if (!benchmarks.length) return undefined;

    const provider = modelId.split('/')[0]?.toLowerCase() || '';
    const normalizedProvider = normalizeProviderForMatch(provider);
    const providerCandidates = providerAliases(normalizedProvider);
    let bestMatch: ModelBenchmark | undefined;
    let bestScore = 0;

    for (const benchmark of benchmarks) {
        const creatorNorm = normalizeProviderForMatch(benchmark.creator);
        const creatorMatch = providerCandidates.length > 0 && providerCandidates.some((candidate) => (
            candidate && (
                (candidate.length >= 3 && creatorNorm.includes(candidate)) ||
                (creatorNorm.length >= 3 && candidate.includes(creatorNorm))
            )
        ));
        const nameSimilarity = calculateSimilarity(modelName, benchmark.modelName);
        const idSimilarity = calculateSimilarity(modelId.split('/')[1] || modelName, benchmark.modelName);
        const baseSimilarity = Math.max(nameSimilarity, idSimilarity);
        const score = creatorMatch ? baseSimilarity * 1.25 : baseSimilarity;

        if (score > bestScore && score >= minMatchThreshold) {
            bestScore = score;
            bestMatch = benchmark;
        }
    }

    return bestMatch;
}
