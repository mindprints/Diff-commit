import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const generateDiffSummary = async (original: string, modified: string): Promise<string> => {
  if (!apiKey) {
    return "API Key not found. Please configure the environment.";
  }

  try {
    const prompt = `
      Compare the following two texts and provide a concise summary of the key changes.
      Focus on meaning, tone, and significant structural edits.
      
      Original Text:
      "${original.substring(0, 5000)}"

      Modified Text:
      "${modified.substring(0, 5000)}"
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You are an expert editor. Provide a bulleted list of changes.",
        temperature: 0.3,
      }
    });

    return response.text || "No summary generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Failed to generate summary. Please try again.";
  }
};

export const polishMergedText = async (text: string): Promise<string> => {
    if (!apiKey) return text;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `The following text was created by merging two versions and may have grammatical inconsistencies. 
            Polish it to be smooth and coherent while preserving the intended meaning of the accepted changes.
            
            Text:
            "${text.substring(0, 5000)}"
            `,
            config: {
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
