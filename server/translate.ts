import { GoogleGenAI } from "@google/genai";

export const TRANSLATION_MAX_CHARS = 2_000;
const TRANSLATION_MODEL = "gemma-3-12b-it";

export class TranslateRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "TranslateRequestError";
  }
}

export function parseTranslateRequest(body: unknown): string {
  const text =
    typeof body === "object" &&
    body !== null &&
    "text" in body
      ? (body as { text?: unknown }).text
      : undefined;

  if (typeof text !== "string") {
    throw new TranslateRequestError(400, "Text is required.");
  }

  const trimmedText = text.trim();

  if (!trimmedText) {
    throw new TranslateRequestError(400, "Text is required.");
  }

  if (trimmedText.length > TRANSLATION_MAX_CHARS) {
    throw new TranslateRequestError(413, "Text is too long.");
  }

  return trimmedText;
}

export function buildTranslationPrompt(text: string): string {
  return `Translate the following Chinese text to French. Only provide the translation, no extra commentary.\n\nText: ${text}`;
}

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing");
    }

    aiClient = new GoogleGenAI({ apiKey });
  }

  return aiClient;
}

export async function translateChineseToFrench(text: string): Promise<string> {
  const response = await getGeminiClient().models.generateContent({
    model: TRANSLATION_MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: buildTranslationPrompt(text) }],
      },
    ],
    config: {
      temperature: 0.2,
    },
  });

  return response.text?.trim() ?? "";
}
