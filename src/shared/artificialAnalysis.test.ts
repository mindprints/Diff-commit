import { describe, expect, it } from 'vitest';
import { matchBenchmark, parseBenchmarks } from './artificialAnalysis';

describe('artificialAnalysis', () => {
    it('parses wrapped benchmark payload from data[]', () => {
        const parsed = parseBenchmarks({
            data: [
                {
                    model_name: 'Claude Haiku 4.5',
                    model_creator: { name: 'Anthropic' },
                    evaluations: {
                        artificial_analysis_intelligence_index: 52.1,
                        artificial_analysis_coding_index: 48.9,
                    },
                    median_output_tokens_per_second: 83.2,
                    median_time_to_first_token_seconds: 0.5,
                },
            ],
        });

        expect(parsed).toHaveLength(1);
        expect(parsed[0]).toMatchObject({
            modelName: 'Claude Haiku 4.5',
            creator: 'Anthropic',
            intelligenceIndex: 52.1,
            codingIndex: 48.9,
            outputSpeed: 83.2,
            latency: 0.5,
        });
    });

    it('supports alternate wrapper keys', () => {
        const modelsParsed = parseBenchmarks({
            models: [{ model_name: 'A', creator: 'X' }],
        });
        const resultsParsed = parseBenchmarks({
            results: [{ model_name: 'B', creator: 'Y' }],
        });

        expect(modelsParsed).toHaveLength(1);
        expect(resultsParsed).toHaveLength(1);
    });

    it('matches benchmark by provider + fuzzy model name', () => {
        const benchmarks = [
            { modelName: 'Claude Haiku 4.5', creator: 'Anthropic', intelligenceIndex: 50 },
            { modelName: 'GPT-4.1', creator: 'OpenAI', intelligenceIndex: 60 },
        ];

        const match = matchBenchmark(
            'anthropic/claude-haiku-4.5',
            'Claude Haiku 4.5',
            benchmarks
        );

        expect(match?.modelName).toBe('Claude Haiku 4.5');
    });

    it('returns undefined when below threshold', () => {
        const match = matchBenchmark(
            'openai/gpt-4.1',
            'Unrelated Model Name',
            [{ modelName: 'Claude Opus', creator: 'Anthropic' }]
        );
        expect(match).toBeUndefined();
    });
});
