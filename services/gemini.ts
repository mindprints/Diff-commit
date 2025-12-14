import { GoogleGenAI, Type } from "@google/genai";
import { PolishMode } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const polishMergedText = async (text: string, mode: PolishMode = 'polish'): Promise<string> => {
  if (!apiKey) return text;

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

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `
            ${promptTask}
            
            Text:
            "${text.substring(0, 5000)}"
            `,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            polishedText: { type: Type.STRING }
          }
        }
      }
    });

    const json = JSON.parse(response.text || '{}');
    return json.polishedText || text;

  } catch (error) {
    console.error("Gemini Polish Error", error);
    return text;
  }
}
