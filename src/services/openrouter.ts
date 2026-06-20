import { requireApiUrl, type RuntimeConfig } from '../config/runtime';

const CLIENT_TRANSLATION_TIMEOUT_MS = 35_000;

export class TranslationRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'TranslationRequestError';
  }
}

export function isTranslationRateLimitError(error: unknown): boolean {
  return error instanceof TranslationRequestError && error.statusCode === 429;
}

export interface TranslationResult {
  translation: string;
  fallback?: string;
}

export async function translateText(
  text: string,
  model: string,
  sourceLang: string,
  targetLang: string,
  provider = 'openrouter',
  runtimeConfig?: RuntimeConfig,
): Promise<TranslationResult> {
  let response: Response;

  try {
    response = await fetch(requireApiUrl('/api/translate', runtimeConfig), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model, sourceLang, targetLang, provider }),
      signal: AbortSignal.timeout(CLIENT_TRANSLATION_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('Translation request timed out. Please try again.');
    }
    throw error;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new TranslationRequestError(
      body.error ?? `Translation failed (${response.status})`,
      response.status,
    );
  }

  const data = (await response.json()) as { translation?: string; fallback?: string };
  return {
    translation: data.translation?.trim() ?? '',
    fallback: data.fallback,
  };
}

// Backwards-compatible alias
export const translateChineseToFrench = translateText;
