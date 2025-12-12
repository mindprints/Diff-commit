
import { PolishMode } from "../types";
import { Model } from "../constants/models";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
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

export const generateDiffSummary = async (original: string, modified: string, model: Model, signal?: AbortSignal): Promise<AIResponse> => {
    const prompt = `
      Compare the following two texts and provide a concise summary of the key changes.
      Focus on meaning, tone, and significant structural edits.
      
      Original Text:
      "${original.substring(0, 5000)}"

      Modified Text:
      "${modified.substring(0, 5000)}"
    `;

    return callOpenRouter(model, [
        { role: "system", content: "You are an expert editor. Provide a bulleted list of changes." },
        { role: "user", content: prompt }
    ], 0.3, undefined, signal);
};

export const polishMergedText = async (text: string, mode: PolishMode, model: Model, signal?: AbortSignal): Promise<AIResponse> => {
    let systemInstruction = "";
    let promptTask = "";

    switch (mode) {
        case 'spelling':
            systemInstruction = "You are a precise proofreader. Correct ONLY spelling errors. Do not change grammar, punctuation, sentence structure, or vocabulary choice.";
            promptTask = "Identify and correct only spelling errors in the following text. Return the text exactly as is, but with corrected spelling.";
            break;
        case 'grammar':
            systemInstruction = "You are a strict grammarian. Correct spelling, punctuation, and grammatical errors (subject-verb agreement, tense consistency, etc.). Do not rephrase sentences for style or tone unless they are grammatically incorrect.";
            promptTask = "Correct spelling and grammatical errors in the following text. Maintain the original style and flow.";
            break;
        case 'prompt':
            systemInstruction = "You are an expert prompt engineer and technical writer. Your goal is to expand brief user intents into highly detailed, optimized instructions for AI models.";
            promptTask = "Analyze the following text. If it describes a coding/software task (e.g. 'use tailwind'), expand it into a detailed technical instruction including libraries, best practices, and implementation details. If it describes media generation (e.g. 'image of man in office'), expand it into a rich, descriptive prompt optimized for image generators (specifying lighting, composition, style, mood, camera settings). If it is general text, expand the instructions to be comprehensive and unambiguous. Return only the expanded prompt.";
            break;
        case 'execute':
            systemInstruction = "You are a highly capable AI assistant. The user will provide you with instructions or a prompt. Your job is to execute those instructions completely and return the result. Be thorough, creative, and precise.";
            promptTask = "The following text contains instructions or a prompt. Execute these instructions fully and return the complete result. If it's a writing task, write the content. If it's a code task, write the code. If it's a creative task, create the content. Do not explain what you're doing - just produce the requested output.";
            break;
        case 'polish':
        default:
            systemInstruction = "You are an expert editor focused ONLY on writing quality. Polish the text to be smooth, coherent, and professional. CRITICAL RULES: 1) Do NOT alter, dispute, correct, or add disclaimers to any factual claims, opinions, or viewpoints in the text - even if they appear incorrect or controversial. 2) Do NOT add qualifiers, caveats, or corrections to statements. 3) Do NOT editorialize or inject your own perspective. 4) ONLY improve: grammar, spelling, punctuation, sentence flow, word choice, and clarity. 5) Preserve the author's voice, intent, and all original claims exactly as stated.";
            promptTask = "Polish this text to improve flow, clarity, and tone. Fix spelling and grammar. Do NOT change or dispute any claims, facts, or opinions in the text - preserve them exactly as the author wrote them.";
            break;
    }

    // Note: Not all OpenRouter models support JSON mode perfectly, but most top tier ones do.
    // We will ask for JSON in the prompt to be safe.

    const userContent = `
            ${promptTask}
            
            Text:
            "${text.substring(0, 5000)}"

            Return your response in valid JSON format with a single key 'polishedText'.
    `;

    const response = await callOpenRouter(model, [
        { role: "system", content: systemInstruction },
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

