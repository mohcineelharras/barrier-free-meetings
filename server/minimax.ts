import {
  buildTranslationPrompt,
  fetchWithTimeout,
  stripReasoningBlocks,
  type TranslationLanguage,
  UpstreamApiError,
} from './translate.js';

const MINIMAX_CHAT_URL = 'https://api.minimax.io/v1/chat/completions';
export const MINIMAX_TIMEOUT_MS = 25_000;

const MINIMAX_MODELS = [
  { id: 'MiniMax-M3', name: 'MiniMax M3' },
  { id: 'MiniMax-M2.7', name: 'MiniMax M2.7' },
] as const;

export function getMinimaxApiKey(): string {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) throw new Error('MINIMAX_API_KEY is missing');
  return key;
}

export function fetchMinimaxModels(): { id: string; name: string }[] {
  getMinimaxApiKey();
  return [...MINIMAX_MODELS];
}

export async function translateWithMinimax(
  text: string,
  model: string,
  sourceLang: TranslationLanguage,
  targetLang: TranslationLanguage,
): Promise<string> {
  const apiKey = getMinimaxApiKey();

  const res = await fetchWithTimeout(MINIMAX_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: buildTranslationPrompt(text, sourceLang, targetLang) }],
      temperature: 0.2,
    }),
  }, MINIMAX_TIMEOUT_MS, 'MiniMax translation');

  if (!res.ok) {
    const body = await res.text();
    console.error(`[minimax] ${res.status}:`, body);
    throw new UpstreamApiError(res.status, body);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return stripReasoningBlocks(data.choices[0]?.message?.content ?? '');
}

export async function callMinimaxReport(prompt: string, model: string, maxTokens: number): Promise<string> {
  const apiKey = getMinimaxApiKey();

  const res = await fetchWithTimeout(MINIMAX_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_completion_tokens: maxTokens,
    }),
  }, MINIMAX_TIMEOUT_MS, 'MiniMax report');

  if (!res.ok) {
    const body = await res.text();
    throw new UpstreamApiError(res.status, body);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return stripReasoningBlocks(data.choices[0]?.message?.content ?? '');
}

export async function verifyLanguageWithMinimax(
  text: string,
  model: string,
  expectedLang: string,
  buildPrompt: (text: string, lang: string) => string,
): Promise<boolean> {
  const apiKey = getMinimaxApiKey();

  const res = await fetchWithTimeout(MINIMAX_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: buildPrompt(text, expectedLang) }],
      temperature: 0.1,
      max_completion_tokens: 10,
    }),
  }, MINIMAX_TIMEOUT_MS, 'MiniMax language verification');

  if (!res.ok) {
    const body = await res.text();
    console.error(`[minimax] verify ${res.status}:`, body);
    throw new UpstreamApiError(res.status, body);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices[0]?.message?.content?.trim().toLowerCase() ?? '';
  return content.includes('yes');
}
