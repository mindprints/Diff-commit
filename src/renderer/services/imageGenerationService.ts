/**
 * Image Generation Service
 * Handles AI-powered image generation via OpenRouter API
 */

import { Model } from '../constants/models';
import { requestOpenRouterChatCompletions, ChatPayload } from './openRouterBridge';
import { supportsImageGeneration } from './openRouterService';

/**
 * Known image-capable model IDs from OpenRouter
 * These models support `modalities: ['image', 'text']`
 */
export const KNOWN_IMAGE_MODELS = [
    // Black Forest Labs / FLUX
    'black-forest-labs/flux-1.1-pro',
    'black-forest-labs/flux-1.1-pro-ultra',
    'black-forest-labs/flux-pro',
    'black-forest-labs/flux-schnell',
    'black-forest-labs/flux-dev',
    // OpenAI
    'openai/dall-e-3',
    'openai/dall-e-2',
    // Stability AI
    'stability-ai/stable-diffusion-xl',
    'stability-ai/sdxl',
    // Google Gemini (image generation variants)
    'google/gemini-2.0-flash-exp:free',
    'google/gemini-2.5-flash-preview',
] as const;

/**
 * Check if a model ID is known to support image generation
 * Checks both hardcoded list and heuristics (model ID containing 'image')
 */
export function isImageCapableModel(modelId: string): boolean {
    const lowerId = modelId.toLowerCase();

    // Check if model ID contains 'image' - common naming for image generation models
    if (lowerId.includes('image')) {
        return true;
    }

    // Check against known image models list
    return KNOWN_IMAGE_MODELS.some(id => lowerId === id.toLowerCase() || lowerId.includes(id.toLowerCase()));
}

/**
 * Check if a prompt indicates the user wants to generate an image
 */
export function isImageGenerationRequest(prompt: string): boolean {
    const lowerPrompt = prompt.toLowerCase().trim();
    return (
        lowerPrompt.includes('generate image') ||
        lowerPrompt.includes('create image') ||
        lowerPrompt.includes('generate an image') ||
        lowerPrompt.includes('create an image') ||
        lowerPrompt.startsWith('image:') ||
        lowerPrompt.startsWith('[image]')
    );
}

/**
 * Extract the image prompt from a user instruction
 * Removes the trigger keywords to get the actual image description
 */
export function extractImagePrompt(instruction: string): string {
    const patterns = [
        /^(?:generate|create)\s+(?:an?\s+)?image\s+(?:of\s+)?/i,
        /^image:\s*/i,
        /^\[image\]\s*/i,
    ];

    let prompt = instruction;
    for (const pattern of patterns) {
        prompt = prompt.replace(pattern, '');
    }

    return prompt.trim();
}

export interface ImageGenerationResponse {
    /** Base64-encoded image data (data URL format) */
    imageData: string | null;
    /** Token usage for cost tracking */
    usage?: {
        inputTokens: number;
        outputTokens: number;
    };
    /** Whether the operation failed */
    isError?: boolean;
    /** Whether the operation was cancelled */
    isCancelled?: boolean;
    /** Error message if failed */
    errorMessage?: string;
}

type ImageCapabilityCandidate = Pick<Model, 'id'> & {
    name?: string;
    modality?: string;
    capabilities?: string[];
    supportedGenerationMethods?: string[];
};

export function isImageCapable(candidate: ImageCapabilityCandidate | null | undefined): boolean {
    if (!candidate) return false;
    return supportsImageGeneration(
        candidate.modality,
        candidate.id,
        candidate.name,
        candidate.capabilities,
        candidate.supportedGenerationMethods
    ) || isImageCapableModel(candidate.id);
}

interface ImageMessagePart {
    type?: string;
    text?: string;
    image?: string;
    image_url?: { url?: string };
    inline_data?: { mime_type?: string; data?: string };
    inlineData?: { mimeType?: string; data?: string };
    b64_json?: string;
    url?: string;
}

interface OpenRouterImageResponse {
    choices?: Array<{
        message?: {
            content?: string | ImageMessagePart[];
            images?: Array<{ image_url?: { url?: string } }>;
        };
    }>;
    data?: Array<{ url?: string; b64_json?: string }>;
    images?: Array<string | { b64_json?: string; url?: string }>;
    candidates?: Array<{ content?: { parts?: ImageMessagePart[] } }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
    };
}

/**
 * Generate an image using OpenRouter's image generation API
 * 
 * @param prompt - The image generation prompt
 * @param model - The model to use (must be image-capable)
 * @param editorContent - Optional content from the editor to include in context
 * @param base64Image - Optional original image data for modification (base64 data URL)
 * @param signal - Optional AbortSignal for cancellation
 */
export async function generateImage(
    prompt: string,
    model: Model,
    editorContent?: string,
    base64Image?: string,
    signal?: AbortSignal
): Promise<ImageGenerationResponse> {
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || '';
    const hasElectronProxy = Boolean(window.electron?.openRouter?.chatCompletions);
    if (!hasElectronProxy && !apiKey) {
        return {
            imageData: null,
            isError: true,
            errorMessage: 'OpenRouter API key not configured. Set VITE_OPENROUTER_API_KEY in your .env file.',
        };
    }

    // Build the full prompt with optional editor content
    // For image generation, be explicit about wanting an image
    let fullPrompt = base64Image ? `Modify this image based on the following instructions: ${prompt}` : `Generate an image: ${prompt}`;
    if (editorContent && editorContent.trim()) {
        fullPrompt = `${base64Image ? 'Modify this image' : 'Generate an image'} based on the following context: ${prompt}\n\nContext:\n${editorContent}`;
    }

    console.log('[ImageGen] Making request to model:', model.id);

    try {
        // Construct the message content. If we have a base image, use multi-modal format.
        const messageContent: ImageMessagePart[] = [
            {
                type: 'text',
                text: fullPrompt,
            }
        ];

        if (base64Image) {
            messageContent.push({
                type: 'image_url',
                image_url: {
                    url: base64Image,
                },
            });
        }

        // OpenRouter uses chat/completions for all models including image generation
        const requestBody: Record<string, unknown> = {
            model: model.id,
            messages: [
                {
                    role: 'user',
                    content: messageContent,
                },
            ],
        };

        const lowerId = model.id.toLowerCase();

        // For Gemini image models, we need to set response modalities in generation_config
        // OpenRouter passes these through to Google's specialized API format
        if (lowerId.includes('gemini') && isImageCapable(model)) {
            requestBody['generation_config'] = {
                response_modalities: ['image', 'text'],
            };
        }
        // For pure image models (FLUX, DALL-E, etc.), we omit the top-level modalities
        // and allow OpenRouter's model-specific routing to handle it correctly.

        let data: OpenRouterImageResponse;
        if (hasElectronProxy && window.electron?.openRouter?.chatCompletions) {
            data = await requestOpenRouterChatCompletions(requestBody as ChatPayload, signal);
        } else {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': import.meta.env.VITE_APP_URL || window.location.origin,
                    'X-Title': 'Diff & Commit AI',
                },
                body: JSON.stringify(requestBody),
                signal,
            });

            if (!response.ok) {
                const contentType = response.headers.get('content-type') || '';
                const errorBody = contentType.includes('application/json')
                    ? JSON.stringify(await response.json())
                    : await response.text();
                console.error('[ImageGen] API error:', response.status, errorBody);
                return {
                    imageData: null,
                    isError: true,
                    errorMessage: `Image generation failed: ${response.status} - ${errorBody}`,
                };
            }
            data = await response.json();
        }

        // Extract image from response - providers return images in various formats
        const message = data.choices?.[0]?.message;
        let imageData: string | null = null;

        // Check for images array in message (OpenRouter/Gemini format)
        // Format: message.images[0].image_url.url contains the data URL
        if (message?.images && Array.isArray(message.images) && message.images.length > 0) {
            const firstImage = message.images[0];
            if (firstImage?.image_url?.url) {
                imageData = firstImage.image_url.url;
            }
        }

        if (!imageData && message?.content) {
            // Content might be a string with a data URL or an array of content parts
            if (typeof message.content === 'string') {
                // Check if it's a data URL
                if (message.content.startsWith('data:image')) {
                    imageData = message.content;
                }
                // Check if it's a raw base64 string (no data: prefix)
                // Strict check: must be long enough (>512 chars) and match base64 format exactly (no whitespace)
                else if (message.content.length > 512 && /^[A-Za-z0-9+/]+={0,2}$/.test(message.content)) {
                    imageData = `data:image/png;base64,${message.content}`;
                }
            } else if (Array.isArray(message.content)) {
                // Look for image in various formats within the content array
                for (const part of message.content) {
                    // OpenAI/OpenRouter format: image_url type
                    if (part.type === 'image_url' && part.image_url?.url) {
                        imageData = part.image_url.url;
                        break;
                    }
                    // Alternative: image type with direct data
                    if (part.type === 'image' && part.image) {
                        imageData = part.image;
                        break;
                    }
                    // Gemini format: inline_data with mime_type and data
                    if (part.inline_data?.data) {
                        const mimeType = part.inline_data.mime_type || 'image/png';
                        imageData = `data:${mimeType};base64,${part.inline_data.data}`;
                        break;
                    }
                    // Alternative Gemini format: inlineData (camelCase)
                    if (part.inlineData?.data) {
                        const mimeType = part.inlineData.mimeType || 'image/png';
                        imageData = `data:${mimeType};base64,${part.inlineData.data}`;
                        break;
                    }
                    // Check for nested b64_json
                    if (part.b64_json) {
                        imageData = `data:image/png;base64,${part.b64_json}`;
                        break;
                    }
                    // Check for direct URL in part
                    if (part.url && part.url.startsWith('http')) {
                        imageData = part.url;
                        break;
                    }
                }
            }
        }

        // Check for image in alternative response locations
        // DALL-E style response: data array with url or b64_json
        if (!imageData && data.data?.[0]?.url) {
            imageData = data.data[0].url;
        }
        if (!imageData && data.data?.[0]?.b64_json) {
            imageData = `data:image/png;base64,${data.data[0].b64_json}`;
        }

        // Check for images array (some providers use this)
        if (!imageData && data.images?.[0]) {
            const img = data.images[0];
            if (typeof img === 'string') {
                imageData = img.startsWith('data:') ? img : `data:image/png;base64,${img}`;
            } else if (img.b64_json) {
                imageData = `data:image/png;base64,${img.b64_json}`;
            } else if (img.url) {
                imageData = img.url;
            }
        }

        // Check for raw Gemini candidates format (in case OpenRouter passes through)
        if (!imageData && data.candidates?.[0]?.content?.parts) {
            for (const part of data.candidates[0].content.parts) {
                if (part.inlineData?.data) {
                    const mimeType = part.inlineData.mimeType || 'image/png';
                    imageData = `data:${mimeType};base64,${part.inlineData.data}`;
                    break;
                }
                if (part.inline_data?.data) {
                    const mimeType = part.inline_data.mime_type || 'image/png';
                    imageData = `data:${mimeType};base64,${part.inline_data.data}`;
                    break;
                }
            }
        }

        if (!imageData) {
            console.error('[ImageGen] No image found in response. Full response:', data);
            return {
                imageData: null,
                isError: true,
                errorMessage: 'No image was generated. The raw API response has been logged to the console for debugging.',
            };
        }

        console.log('[ImageGen] Successfully extracted image, length:', imageData.length);

        return {
            imageData,
            usage: data.usage ? {
                inputTokens: data.usage.prompt_tokens || 0,
                outputTokens: data.usage.completion_tokens || 0,
            } : undefined,
        };
    } catch (error) {
        if (signal?.aborted) {
            return { imageData: null, isCancelled: true };
        }

        console.error('[ImageGen] Error:', error);
        return {
            imageData: null,
            isError: true,
            errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
}

/**
 * Generate a safe filename from a prompt
 * @param prompt - The image generation prompt
 * @param maxLength - Maximum length of the filename (default: 30)
 */
export function generateFilename(prompt: string, maxLength = 30): string {
    // Remove special characters and limit length
    const sanitized = prompt
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, maxLength);

    // Add timestamp for uniqueness
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    return `${sanitized || 'image'}_${timestamp}.png`;
}
