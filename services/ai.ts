
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
}

async function callOpenRouter(
    model: Model,
    messages: { role: string, content: string }[],
    temperature: number = 0.3,
    responseFormat?: any
): Promise<AIResponse> {
    if (!OPENROUTER_API_KEY) {
        console.warn("OpenRouter API Key is missing.");
        // Fallback or error handling
        return { text: "API Key missing. Check .env configuration." };
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
            })
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

    } catch (error) {
        console.error("Network Error:", error);
        return { text: "Network error occurred. Please check your connection.", isError: true };
    }
}

export const generateDiffSummary = async (original: string, modified: string, model: Model): Promise<AIResponse> => {
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
    ]);
};

export const polishMergedText = async (text: string, mode: PolishMode, model: Model): Promise<AIResponse> => {
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
        case 'polish':
        default:
            systemInstruction = "You are an expert editor. Polish the text to be smooth, coherent, and professional while preserving the intended meaning.";
            promptTask = "The following text was created by merging two versions and may have inconsistencies. Polish it to improve flow, clarity, and tone, while also fixing spelling and grammar.";
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
    ], 0.3, { type: "json_object" });

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
