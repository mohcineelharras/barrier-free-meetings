import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

let aiClient: GoogleGenAI | null = null;

export function getGeminiClient() {
  if (!aiClient) {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export async function translateChineseToFrench(text: string) {
  const ai = getGeminiClient();
  
  try {
    const response = await ai.models.generateContent({
      model: "gemma-3-12b-it",
      contents: [
        {
          role: "user",
          parts: [{ text: `Translate the following Chinese text to French. Only provide the translation, no extra commentary.\n\nText: ${text}` }]
        }
      ],
      config: {
        temperature: 0.2,
      }
    });

    return response.text?.trim() || "";
  } catch (error) {
    console.error("Translation error:", error);
    return "[Translation Error]";
  }
}
