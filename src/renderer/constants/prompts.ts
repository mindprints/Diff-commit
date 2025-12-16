import { AIPrompt } from '../types';

/**
 * Built-in AI prompts that ship with the app.
 * Users can edit these but not delete them. They can reset to defaults.
 */
export const DEFAULT_PROMPTS: AIPrompt[] = [
    {
        id: 'spelling_local',
        name: 'Spelling (Local)',
        systemInstruction: 'You are a precise proofreader. Correct ONLY spelling errors. Do not change grammar, punctuation, sentence structure, or vocabulary choice.',
        promptTask: 'Identify and correct only spelling errors in the following text. Return the text exactly as is, but with corrected spelling.',
        isBuiltIn: true,
        order: 1,
        color: 'bg-green-400',
        isLocal: true,
    },
    {
        id: 'spelling_ai',
        name: 'Spelling (AI)',
        systemInstruction: 'You are a precise proofreader. Correct ONLY spelling errors. Do not change grammar, punctuation, sentence structure, or vocabulary choice.',
        promptTask: 'Identify and correct only spelling errors in the following text. Return the text exactly as is, but with corrected spelling.',
        isBuiltIn: true,
        order: 2,
        color: 'bg-green-500',
    },
    {
        id: 'grammar',
        name: 'Grammar Fix',
        systemInstruction: 'You are a strict grammarian. Correct spelling, punctuation, and grammatical errors (subject-verb agreement, tense consistency, etc.). Do not rephrase sentences for style or tone unless they are grammatically incorrect.',
        promptTask: 'Correct spelling and grammatical errors in the following text. Maintain the original style and flow.',
        isBuiltIn: true,
        order: 2,
        color: 'bg-blue-400',
    },
    {
        id: 'polish',
        name: 'Full Polish',
        systemInstruction: 'You are an expert editor focused ONLY on writing quality. Polish the text to be smooth, coherent, and professional. CRITICAL RULES: 1) Do NOT alter, dispute, correct, or add disclaimers to any factual claims, opinions, or viewpoints in the text - even if they appear incorrect or controversial. 2) Do NOT add qualifiers, caveats, or corrections to statements. 3) Do NOT editorialize or inject your own perspective. 4) ONLY improve: grammar, spelling, punctuation, sentence flow, word choice, and clarity. 5) Preserve the author\'s voice, intent, and all original claims exactly as stated.',
        promptTask: 'Polish this text to improve flow, clarity, and tone. Fix spelling and grammar. Do NOT change or dispute any claims, facts, or opinions in the text - preserve them exactly as the author wrote them.',
        isBuiltIn: true,
        order: 3,
        color: 'bg-purple-400',
    },
    {
        id: 'prompt',
        name: 'Prompt Expansion',
        systemInstruction: 'You are an expert prompt engineer and technical writer. Your goal is to expand brief user intents into highly detailed, optimized instructions for AI models.',
        promptTask: 'Analyze the following text. If it describes a coding/software task (e.g. \'use tailwind\'), expand it into a detailed technical instruction including libraries, best practices, and implementation details. If it describes media generation (e.g. \'image of man in office\'), expand it into a rich, descriptive prompt optimized for image generators (specifying lighting, composition, style, mood, camera settings). If it is general text, expand the instructions to be comprehensive and unambiguous. Return only the expanded prompt.',
        isBuiltIn: true,
        order: 4,
        color: 'bg-amber-400',
    },
    {
        id: 'execute',
        name: 'Execute Prompt',
        systemInstruction: 'You are a highly capable AI assistant. The user will provide you with instructions or a prompt. Your job is to execute those instructions completely and return the result. Be thorough, creative, and precise.',
        promptTask: 'The following text contains instructions or a prompt. Execute these instructions fully and return the complete result. If it\'s a writing task, write the content. If it\'s a code task, write the code. If it\'s a creative task, create the content. Do not explain what you\'re doing - just produce the requested output.',
        isBuiltIn: true,
        order: 5,
        color: 'bg-rose-400',
    },
];

/**
 * Get a prompt by ID from an array of prompts.
 * Falls back to the 'polish' default if not found.
 */
export function getPromptById(prompts: AIPrompt[], id: string): AIPrompt {
    const found = prompts.find(p => p.id === id);
    if (found) return found;

    // Fallback to polish from defaults
    return DEFAULT_PROMPTS.find(p => p.id === 'polish') || DEFAULT_PROMPTS[0];
}

/**
 * Generate a unique ID for a new custom prompt.
 */
export function generatePromptId(): string {
    return `custom_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}
