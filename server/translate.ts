export const TRANSLATION_MAX_CHARS = 2_000;
export const DEFAULT_MODEL = 'liquid/lfm-2.5-1.2b-instruct:free';
export const OPENROUTER_TRANSLATION_TIMEOUT_MS = 25_000;
export const OPENROUTER_MIN_THROUGHPUT_TOKENS_PER_SECOND = 30;
export const OPENROUTER_MAX_MODELS_PER_REQUEST = 3;

export const OPENROUTER_FAST_FREE_TRANSLATION_MODELS = [
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
  'z-ai/glm-4.5-air:free',
  'poolside/laguna-m.1:free',
  'deepseek/deepseek-v4-flash:free',
] as const;

export const OPENROUTER_PAID_FALLBACK_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Master switch for the paid DeepSeek V4 Flash fallback (translation + report).
 * Disabled for now to avoid paid spend — flip to `true` to re-enable. When off,
 * exhausting the free providers surfaces a rate-limit error instead of paying.
 */
export const PAID_OPENROUTER_FALLBACK_ENABLED = false;

export type TranslationTier = 'free' | 'paid';

/**
 * Resolves the translation tier from an env value (e.g. process.env.TRANSLATION_TIER).
 * Defaults to 'free' (free models first, paid only as 429 fallback).
 * Set to 'paid' to use paid DeepSeek V4 Flash as the primary model.
 */
export function resolveTranslationTier(envValue: string | undefined): TranslationTier {
  return envValue?.trim().toLowerCase() === 'paid' ? 'paid' : 'free';
}

const DEFAULT_SOURCE_LANGUAGE = 'Chinese';
const DEFAULT_TARGET_LANGUAGE = 'French';
const REASONING_BLOCK_PATTERN = /<(?:think|thought)\b[^>]*>[\s\S]*?<\/(?:think|thought)>\s*/gi;

const TRANSLATION_LANGUAGE_ALIASES = new Map<string, TranslationLanguage>([
  ['ar-sa', 'Arabic'],
  ['arabic', 'Arabic'],
  ['zh-cn', 'Chinese'],
  ['chinese', 'Chinese'],
  ['chinese (mandarin)', 'Chinese'],
  ['chinese / mandarin', 'Chinese'],
  ['zh-tw', 'Chinese / Taiwan'],
  ['chinese / taiwan', 'Chinese / Taiwan'],
  ['traditional chinese', 'Chinese / Taiwan'],
  ['yue-hk', 'Cantonese / Hong Kong'],
  ['cantonese', 'Cantonese / Hong Kong'],
  ['cantonese / hong kong', 'Cantonese / Hong Kong'],
  ['en-us', 'English'],
  ['english', 'English'],
  ['fr-fr', 'French'],
  ['french', 'French'],
  ['de-de', 'German'],
  ['german', 'German'],
  ['hi-in', 'Hindi'],
  ['hindi', 'Hindi'],
  ['it-it', 'Italian'],
  ['italian', 'Italian'],
  ['ja-jp', 'Japanese'],
  ['japanese', 'Japanese'],
  ['ko-kr', 'Korean'],
  ['korean', 'Korean'],
  ['pt-br', 'Portuguese'],
  ['portuguese', 'Portuguese'],
  ['ru-ru', 'Russian'],
  ['russian', 'Russian'],
  ['es-es', 'Spanish'],
  ['spanish', 'Spanish'],
  ['tr-tr', 'Turkish'],
  ['turkish', 'Turkish'],
]);

const ALLOWED_LANGUAGE_NAMES = [
  'Arabic',
  'Chinese',
  'Chinese / Taiwan',
  'Cantonese / Hong Kong',
  'English',
  'French',
  'German',
  'Hindi',
  'Italian',
  'Japanese',
  'Korean',
  'Portuguese',
  'Russian',
  'Spanish',
  'Turkish',
] as const;

export type TranslationLanguage = typeof ALLOWED_LANGUAGE_NAMES[number];

export class TranslateRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'TranslateRequestError';
  }
}

export class UpstreamApiError extends Error {
  constructor(
    public readonly upstreamStatus: number,
    public readonly upstreamBody: string,
  ) {
    super(`Upstream API error ${upstreamStatus}`);
    this.name = 'UpstreamApiError';
  }
}

export class UpstreamTimeoutError extends Error {
  constructor(
    public readonly provider: string,
    public readonly timeoutMs: number,
  ) {
    super(`${provider} request timed out after ${Math.ceil(timeoutMs / 1000)}s.`);
    this.name = 'UpstreamTimeoutError';
  }
}

export function parseTranslateRequest(body: unknown): string {
  const text =
    typeof body === 'object' &&
    body !== null &&
    'text' in body
      ? (body as { text?: unknown }).text
      : undefined;

  if (typeof text !== 'string') {
    throw new TranslateRequestError(400, 'Text is required.');
  }

  const trimmedText = text.trim();

  if (!trimmedText) {
    throw new TranslateRequestError(400, 'Text is required.');
  }

  if (trimmedText.length > TRANSLATION_MAX_CHARS) {
    throw new TranslateRequestError(413, 'Text is too long.');
  }

  return trimmedText;
}

function normalizeLanguageInput(value: string): string {
  return value.trim().toLowerCase();
}

export function parseTranslationLanguage(
  value: unknown,
  fieldName: 'sourceLang' | 'targetLang',
  fallback: TranslationLanguage,
): TranslationLanguage {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'string') {
    throw new TranslateRequestError(400, `${fieldName} must be a string.`);
  }

  const canonicalLanguage = TRANSLATION_LANGUAGE_ALIASES.get(normalizeLanguageInput(value));
  if (!canonicalLanguage) {
    throw new TranslateRequestError(
      400,
      `${fieldName} must be one of: ${ALLOWED_LANGUAGE_NAMES.join(', ')}.`,
    );
  }

  return canonicalLanguage;
}

export function parseTranslationLanguages(
  sourceLang: unknown,
  targetLang: unknown,
): { sourceLang: TranslationLanguage; targetLang: TranslationLanguage } {
  return {
    sourceLang: parseTranslationLanguage(sourceLang, 'sourceLang', DEFAULT_SOURCE_LANGUAGE),
    targetLang: parseTranslationLanguage(targetLang, 'targetLang', DEFAULT_TARGET_LANGUAGE),
  };
}

export function buildTranslationPrompt(
  text: string,
  sourceLang: TranslationLanguage = DEFAULT_SOURCE_LANGUAGE,
  targetLang: TranslationLanguage = DEFAULT_TARGET_LANGUAGE,
): string {
  return `Translate the following ${sourceLang} text to ${targetLang}. Only provide the translation, no extra commentary, no markdown, no analysis, and no <think> or <thought> tags.\n\nText: ${text}`;
}

export function stripReasoningBlocks(text: string): string {
  return text.replace(REASONING_BLOCK_PATTERN, '').trim();
}

export function buildOpenRouterTranslationRequestBody(
  text: string,
  _model = DEFAULT_MODEL,
  sourceLang: TranslationLanguage = DEFAULT_SOURCE_LANGUAGE,
  targetLang: TranslationLanguage = DEFAULT_TARGET_LANGUAGE,
  models: readonly string[] = OPENROUTER_FAST_FREE_TRANSLATION_MODELS.slice(0, OPENROUTER_MAX_MODELS_PER_REQUEST),
) {
  return {
    models: [...models],
    messages: [{ role: 'user', content: buildTranslationPrompt(text, sourceLang, targetLang) }],
    temperature: 0.2,
    reasoning: {
      effort: 'none',
      exclude: true,
    },
    provider: {
      sort: {
        by: 'throughput',
        partition: 'none',
      },
      preferred_min_throughput: {
        p50: OPENROUTER_MIN_THROUGHPUT_TOKENS_PER_SECOND,
      },
      max_price: {
        prompt: 0,
        completion: 0,
      },
    },
  };
}

export function buildOpenRouterTranslationRequestBodies(
  text: string,
  model = DEFAULT_MODEL,
  sourceLang: TranslationLanguage = DEFAULT_SOURCE_LANGUAGE,
  targetLang: TranslationLanguage = DEFAULT_TARGET_LANGUAGE,
) {
  const bodies = [];

  for (let start = 0; start < OPENROUTER_FAST_FREE_TRANSLATION_MODELS.length; start += OPENROUTER_MAX_MODELS_PER_REQUEST) {
    bodies.push(
      buildOpenRouterTranslationRequestBody(
        text,
        model,
        sourceLang,
        targetLang,
        OPENROUTER_FAST_FREE_TRANSLATION_MODELS.slice(start, start + OPENROUTER_MAX_MODELS_PER_REQUEST),
      ),
    );
  }

  return bodies;
}

function isRetryableOpenRouterStatus(status: number): boolean {
  return status === 429 || status === 503;
}

export async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  provider: string,
): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new UpstreamTimeoutError(provider, timeoutMs);
    }
    throw error;
  }
}

export function getOpenRouterApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is missing');
  }
  return apiKey;
}

/**
 * Key for paid OpenRouter calls. Uses the dedicated OPENROUTER_PAID_API_KEY
 * when set (so paid usage is tracked/capped separately), otherwise falls back
 * to the main OPENROUTER_API_KEY.
 */
export function getOpenRouterPaidApiKey(): string {
  return process.env.OPENROUTER_PAID_API_KEY ?? getOpenRouterApiKey();
}

export async function translateChineseToFrench(
  text: string,
  model = DEFAULT_MODEL,
  sourceLang: TranslationLanguage = DEFAULT_SOURCE_LANGUAGE,
  targetLang: TranslationLanguage = DEFAULT_TARGET_LANGUAGE,
): Promise<string> {
  const apiKey = getOpenRouterApiKey();
  const requestBodies = buildOpenRouterTranslationRequestBodies(text, model, sourceLang, targetLang);
  let lastRetryableError: UpstreamApiError | null = null;

  for (const requestBody of requestBodies) {
    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }, OPENROUTER_TRANSLATION_TIMEOUT_MS, 'OpenRouter translation');

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[openrouter] ${response.status}:`, errorText);
      const upstreamError = new UpstreamApiError(response.status, errorText);
      if (isRetryableOpenRouterStatus(response.status)) {
        lastRetryableError = upstreamError;
        continue;
      }
      throw upstreamError;
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    return stripReasoningBlocks(data.choices[0]?.message?.content ?? '');
  }

  if (lastRetryableError) {
    throw lastRetryableError;
  }

  throw new UpstreamApiError(503, 'No OpenRouter translation models were available.');
}

/**
 * Translate via a single OpenRouter free model (no multi-model pool, no paid routing).
 * Used as the first link of the explicit free-only fallback chain.
 */
export async function translateWithOpenRouterModel(
  text: string,
  model: string = DEFAULT_MODEL,
  sourceLang: TranslationLanguage = DEFAULT_SOURCE_LANGUAGE,
  targetLang: TranslationLanguage = DEFAULT_TARGET_LANGUAGE,
): Promise<string> {
  const apiKey = getOpenRouterApiKey();
  const requestBody = buildOpenRouterTranslationRequestBody(text, model, sourceLang, targetLang, [model]);

  const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  }, OPENROUTER_TRANSLATION_TIMEOUT_MS, 'OpenRouter translation');

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[openrouter] ${response.status}:`, errorText);
    throw new UpstreamApiError(response.status, errorText);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  return stripReasoningBlocks(data.choices[0]?.message?.content ?? '');
}

export async function translateWithOpenRouterPaid(
  text: string,
  sourceLang: TranslationLanguage = DEFAULT_SOURCE_LANGUAGE,
  targetLang: TranslationLanguage = DEFAULT_TARGET_LANGUAGE,
): Promise<string> {
  const apiKey = getOpenRouterPaidApiKey();

  const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_PAID_FALLBACK_MODEL,
      messages: [{ role: 'user', content: buildTranslationPrompt(text, sourceLang, targetLang) }],
      temperature: 0.2,
      reasoning: { effort: 'none', exclude: true },
    }),
  }, OPENROUTER_TRANSLATION_TIMEOUT_MS, 'OpenRouter paid fallback');

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[openrouter] paid fallback ${response.status}:`, errorText);
    throw new UpstreamApiError(response.status, errorText);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  return stripReasoningBlocks(data.choices[0]?.message?.content ?? '');
}
