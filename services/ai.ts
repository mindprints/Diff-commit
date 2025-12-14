
import { AIPrompt, PolishMode } from "../types";
import { Model } from "../constants/models";
import { DEFAULT_PROMPTS, getPromptById } from "../constants/prompts";

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '';
const SITE_URL = 'http://localhost:5173';
const SITE_NAME = 'Diff & Commit AI';

interface AIResponse {
    text: string;
    usage?: {
        inputTokens: number;
        outputTokens: number;
    };
    isError?: boolean;
    isCancelled?: boolean;
}

async function callOpenRouter(
    model: Model,
    messages: { role: string, content: string }[],
    temperature: number = 0.3,
    responseFormat?: any,
    signal?: AbortSignal
): Promise<AIResponse> {
    if (!OPENROUTER_API_KEY) {
        console.warn("OpenRouter API Key is missing.");
        // Fallback or error handling
        return { text: "API Key missing. Check .env configuration.", isError: true };
    }

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "HTTP-Referer": SITE_URL,
                "X-Title": SITE_NAME,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: model.id,
                messages: messages,
                temperature: temperature,
                response_format: responseFormat
            }),
            signal // Pass abort signal to fetch
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("OpenRouter API Error:", response.status, errorText);

            if (response.status === 400 || response.status === 404) {
                return { text: "Your selected model is not currently available.", isError: true };
            }

            return { text: `Error: ${response.status} - ${response.statusText}`, isError: true };
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || "";
        const usage = data.usage ? {
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens
        } : undefined;

        // Check if there is an error field in the response body that OpenRouter might send even with 200 OK (rare but possible with some proxies)
        if (data.error) {
            return { text: `Error: ${data.error.message || "Unknown error"}`, isError: true };
        }

        return { text, usage };

    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.log("AI request was cancelled.");
            return { text: "Request cancelled.", isError: true, isCancelled: true };
        }
        console.error("Network Error:", error);
        return { text: "Network error occurred. Please check your connection.", isError: true };
    }
}

/**
 * Polish text using a specific AIPrompt object.
 * This is the new preferred method for AI editing.
 */
export const polishWithPrompt = async (
    text: string,
    prompt: AIPrompt,
    model: Model,
    signal?: AbortSignal
): Promise<AIResponse> => {
    const userContent = `
            ${prompt.promptTask}
            
            Text:
            "${text.substring(0, 5000)}"

            Return your response in valid JSON format with a single key 'polishedText'.
    `;

    const response = await callOpenRouter(model, [
        { role: "system", content: prompt.systemInstruction },
        { role: "user", content: userContent }
    ], 0.3, { type: "json_object" }, signal);

    if (response.isError) {
        return response;
    }

    try {
        // Cleaning potential markdown code blocks if the model wraps JSON
        let cleanText = response.text.trim();
        if (cleanText.startsWith('```json')) {
            cleanText = cleanText.substring(7);
        }
        if (cleanText.startsWith('```')) {
            cleanText = cleanText.substring(3);
        }
        if (cleanText.endsWith('```')) {
            cleanText = cleanText.substring(0, cleanText.length - 3);
        }

        const json = JSON.parse(cleanText);
        return {
            text: json.polishedText || response.text,
            usage: response.usage
        };
    } catch (e) {
        console.warn("Failed to parse JSON response:", response.text);
        // Fallback: assume the model just returned the text if parsing failed
        return { text: response.text, usage: response.usage };
    }
}

/**
 * Polish text using a PolishMode string (backwards compatibility).
 * Looks up the prompt by ID and delegates to polishWithPrompt.
 */
export const polishMergedText = async (
    text: string,
    mode: PolishMode,
    model: Model,
    signal?: AbortSignal
): Promise<AIResponse> => {
    // Look up the prompt from defaults (for backwards compatibility)
    const prompt = getPromptById(DEFAULT_PROMPTS, mode);
    return polishWithPrompt(text, prompt, model, signal);
}

// Types for multi-range polish
export interface RangeInput {
    id: string;
    text: string;
}

export interface RangeOutput {
    id: string;
    result: string;
}

interface MultiRangeResponse {
    results: RangeOutput[];
    usage?: {
        inputTokens: number;
        outputTokens: number;
    };
    isError?: boolean;
    isCancelled?: boolean;
    errorMessage?: string;
}

/**
 * Polish multiple text ranges in a single API call.
 * Each range has an ID that is returned with its result for proper mapping.
 */
export const polishMultipleRanges = async (
    ranges: RangeInput[],
    mode: PolishMode,
    model: Model,
    signal?: AbortSignal
): Promise<MultiRangeResponse> => {
    if (ranges.length === 0) {
        return { results: [], isError: true, errorMessage: 'No ranges provided' };
    }

    // For single range, delegate to existing function for efficiency
    if (ranges.length === 1) {
        const singleResult = await polishMergedText(ranges[0].text, mode, model, signal);
        if (singleResult.isError || singleResult.isCancelled) {
            return {
                results: [],
                isError: singleResult.isError,
                isCancelled: singleResult.isCancelled,
                errorMessage: singleResult.text,
            };
        }
        return {
            results: [{ id: ranges[0].id, result: singleResult.text }],
            usage: singleResult.usage,
        };
    }

    // Build task description based on mode
    let taskDescription = '';
    switch (mode) {
        case 'spelling':
            taskDescription = 'Correct ONLY spelling errors in each segment. Do not change grammar or sentence structure.';
            break;
        case 'grammar':
            taskDescription = 'Correct spelling, punctuation, and grammatical errors in each segment. Maintain original style.';
            break;
        case 'prompt':
            taskDescription = 'Expand each segment into detailed, optimized instructions. For code tasks, include technical details. For creative tasks, add rich descriptions.';
            break;
        case 'execute':
            taskDescription = 'Execute the instructions in each segment fully. Produce the requested output directly.';
            break;
        case 'polish':
        default:
            taskDescription = 'Polish each segment for flow, clarity, and professionalism. Fix spelling and grammar. Preserve all claims and opinions exactly as written.';
            break;
    }

    const systemInstruction = `You are an expert editor processing multiple text segments. 
Each segment has a unique ID. You must return results for ALL segments in the exact JSON format specified.
Do not skip any segments. Do not merge segments. Process each independently.`;

    // Format ranges as JSON for the prompt
    const rangesJson = JSON.stringify(ranges.map(r => ({ id: r.id, text: r.text.substring(0, 2000) })), null, 2);

    const userContent = `Process the following text segments according to this task:
${taskDescription}

Input segments (JSON):
${rangesJson}

Return your response as a valid JSON object with this exact structure:
{
  "results": [
    {"id": "sel_0", "result": "processed text for first segment"},
    {"id": "sel_1", "result": "processed text for second segment"}
  ]
}

Important: 
- Return results for ALL input segments
- Use the exact same IDs from the input
- Each result should be the fully processed text for that segment`;

    const response = await callOpenRouter(model, [
        { role: "system", content: systemInstruction },
        { role: "user", content: userContent }
    ], 0.3, { type: "json_object" }, signal);

    if (response.isError) {
        return {
            results: [],
            isError: true,
            isCancelled: response.isCancelled,
            errorMessage: response.text,
        };
    }

    try {
        // Clean potential markdown code blocks
        let cleanText = response.text.trim();
        if (cleanText.startsWith('```json')) {
            cleanText = cleanText.substring(7);
        }
        if (cleanText.startsWith('```')) {
            cleanText = cleanText.substring(3);
        }
        if (cleanText.endsWith('```')) {
            cleanText = cleanText.substring(0, cleanText.length - 3);
        }

        const json = JSON.parse(cleanText);

        // Validate response structure
        if (!json.results || !Array.isArray(json.results)) {
            console.warn('Invalid multi-range response structure:', json);
            return {
                results: [],
                isError: true,
                errorMessage: 'Invalid response format from AI',
            };
        }

        // Ensure all results have required fields
        const validResults: RangeOutput[] = json.results
            .filter((r: any) => r && typeof r.id === 'string' && typeof r.result === 'string')
            .map((r: any) => ({ id: r.id, result: r.result }));

        return {
            results: validResults,
            usage: response.usage,
        };
    } catch (e) {
        console.warn('Failed to parse multi-range JSON response:', response.text);
        return {
            results: [],
            isError: true,
            errorMessage: 'Failed to parse AI response',
        };
    }
}

/**
 * Polish multiple text ranges using a specific AIPrompt object.
 * This is the preferred method for custom prompts.
 */
export const polishMultipleRangesWithPrompt = async (
    ranges: RangeInput[],
    prompt: AIPrompt,
    model: Model,
    signal?: AbortSignal
): Promise<MultiRangeResponse> => {
    if (ranges.length === 0) {
        return { results: [], isError: true, errorMessage: 'No ranges provided' };
    }

    // For single range, delegate to polishWithPrompt for efficiency
    if (ranges.length === 1) {
        const singleResult = await polishWithPrompt(ranges[0].text, prompt, model, signal);
        if (singleResult.isError || singleResult.isCancelled) {
            return {
                results: [],
                isError: singleResult.isError,
                isCancelled: singleResult.isCancelled,
                errorMessage: singleResult.text,
            };
        }
        return {
            results: [{ id: ranges[0].id, result: singleResult.text }],
            usage: singleResult.usage,
        };
    }

    // Build system instruction that combines the prompt's instruction with multi-segment handling
    const systemInstruction = `${prompt.systemInstruction}

You are processing multiple text segments. Each segment has a unique ID. 
You must return results for ALL segments in the exact JSON format specified.
Do not skip any segments. Do not merge segments. Process each independently.`;

    // Format ranges as JSON for the prompt
    const rangesJson = JSON.stringify(ranges.map(r => ({ id: r.id, text: r.text.substring(0, 2000) })), null, 2);

    const userContent = `${prompt.promptTask}

Process the following text segments according to the above instructions:

Input segments (JSON):
${rangesJson}

Return your response as a valid JSON object with this exact structure:
{
  "results": [
    {"id": "sel_0", "result": "processed text for first segment"},
    {"id": "sel_1", "result": "processed text for second segment"}
  ]
}

Important: 
- Return results for ALL input segments
- Use the exact same IDs from the input
- Each result should be the fully processed text for that segment`;

    const response = await callOpenRouter(model, [
        { role: "system", content: systemInstruction },
        { role: "user", content: userContent }
    ], 0.3, { type: "json_object" }, signal);

    if (response.isError) {
        return {
            results: [],
            isError: true,
            isCancelled: response.isCancelled,
            errorMessage: response.text,
        };
    }

    try {
        // Clean potential markdown code blocks
        let cleanText = response.text.trim();
        if (cleanText.startsWith('```json')) {
            cleanText = cleanText.substring(7);
        }
        if (cleanText.startsWith('```')) {
            cleanText = cleanText.substring(3);
        }
        if (cleanText.endsWith('```')) {
            cleanText = cleanText.substring(0, cleanText.length - 3);
        }

        const json = JSON.parse(cleanText);

        // Validate response structure
        if (!json.results || !Array.isArray(json.results)) {
            console.warn('Invalid multi-range response structure:', json);
            return {
                results: [],
                isError: true,
                errorMessage: 'Invalid response format from AI',
            };
        }

        // Ensure all results have required fields
        const validResults: RangeOutput[] = json.results
            .filter((r: any) => r && typeof r.id === 'string' && typeof r.result === 'string')
            .map((r: any) => ({ id: r.id, result: r.result }));

        return {
            results: validResults,
            usage: response.usage,
        };
    } catch (e) {
        console.warn('Failed to parse multi-range JSON response:', response.text);
        return {
            results: [],
            isError: true,
            errorMessage: 'Failed to parse AI response',
        };
    }
}

