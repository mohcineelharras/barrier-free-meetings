import {
  buildTranslationPrompt,
  fetchWithTimeout,
  stripReasoningBlocks,
  type TranslationLanguage,
  UpstreamApiError,
} from './translate.js';

const GOOGLE_AI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';
const GOOGLE_AI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
export const GOOGLE_AI_TRANSLATION_TIMEOUT_MS = 25_000;

function getApiKey(): string {
  const key = process.env.GOOGLE_AI_STUDIO_API_KEY;
  if (!key) throw new Error('GOOGLE_AI_STUDIO_API_KEY is missing');
  return key;
}

interface GoogleAIModel {
  name?: string;
  baseModelId?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

interface GoogleAIModelsResponse {
  models?: GoogleAIModel[];
}

/** Image / media model tokens that match gemini* but are useless for live translation. */
const NON_TRANSLATION_MODEL_TOKENS = new Set([
  'image',
  'imagen',
  'veo',
  'tts',
  'audio',
  'live',
  'banana',
  'embedding',
  'aqa',
  'robotics',
]);

function containsNonTranslationToken(value: string): boolean {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((token) => token.length > 0 && NON_TRANSLATION_MODEL_TOKENS.has(token));
}

/**
 * Keep only text chat models suitable for translation.
 * Excludes Nano Banana / Gemini Image, Veo, TTS, Live, embeddings, etc.
 */
export function isGoogleAITranslationModel(id: string, displayName = ''): boolean {
  if (!/^(gemma|gemini)/i.test(id)) {
    return false;
  }

  return !containsNonTranslationToken(id) && !containsNonTranslationToken(displayName);
}

export function normalizeGoogleAIModels(data: GoogleAIModelsResponse): { id: string; name: string }[] {
  if (!Array.isArray(data.models)) {
    throw new Error('Unexpected Google AI Studio models response.');
  }

  const modelsById = new Map<string, { id: string; name: string }>();

  for (const model of data.models) {
    const supportedGenerationMethods = model.supportedGenerationMethods ?? [];
    if (!supportedGenerationMethods.includes('generateContent')) continue;

    const id = model.baseModelId ?? model.name?.replace(/^models\//, '');
    if (!id) continue;

    const name = model.displayName?.trim() || id;
    if (!isGoogleAITranslationModel(id, name)) continue;

    if (!modelsById.has(id)) {
      modelsById.set(id, { id, name });
    }
  }

  return Array.from(modelsById.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchGoogleAIModels(): Promise<{ id: string; name: string }[]> {
  const key = getApiKey();

  let res: Response;
  try {
    res = await fetch(GOOGLE_AI_MODELS_URL, {
      headers: { 'x-goog-api-key': key },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new Error('Failed to load Google AI Studio models.');
  }

  if (!res.ok) {
    throw new Error(`Failed to load Google AI Studio models (${res.status}).`);
  }

  const data = (await res.json()) as GoogleAIModelsResponse;
  return normalizeGoogleAIModels(data);
}

export async function translateWithGoogleAI(
  text: string,
  model: string,
  sourceLang: TranslationLanguage,
  targetLang: TranslationLanguage,
): Promise<string> {
  const key = getApiKey();

  const res = await fetchWithTimeout(`${GOOGLE_AI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: buildTranslationPrompt(text, sourceLang, targetLang) }],
      temperature: 0.2,
    }),
  }, GOOGLE_AI_TRANSLATION_TIMEOUT_MS, 'Google AI Studio translation');

  if (!res.ok) {
    const body = await res.text();
    console.error(`[googleai] ${res.status}:`, body);
    throw new UpstreamApiError(res.status, body);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return stripReasoningBlocks(data.choices[0]?.message?.content ?? '');
}
