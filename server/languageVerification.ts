import {
  fetchWithTimeout,
  type TranslationLanguage,
  UpstreamApiError,
  OPENROUTER_TRANSLATION_TIMEOUT_MS,
  getOpenRouterApiKey,
  DEFAULT_MODEL,
} from './translate.js';
import { verifyLanguageWithMinimax } from './minimax.js';

export function buildLanguageVerificationPrompt(
  text: string,
  expectedLang: TranslationLanguage,
): string {
  return `Analyze the following transcribed text:\n"${text}"\n\nIs this text a valid, natural, and meaningful expression in the language "${expectedLang}"?\nIf the user is actually speaking a completely different language, or if it is phonetically transcribed gibberish or nonsense that does not form valid ${expectedLang}, respond with "no".\nOtherwise, if the text is indeed written in ${expectedLang}, respond with "yes".\n\nAnswer with exactly "yes" or "no". Do not include any other words, explanation, punctuation, or formatting in your response.`;
}

export async function verifyLanguageWithOpenRouter(
  text: string,
  expectedLang: TranslationLanguage,
  model = DEFAULT_MODEL,
): Promise<boolean> {
  const apiKey = getOpenRouterApiKey();
  const prompt = buildLanguageVerificationPrompt(text, expectedLang);
  const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 10,
    }),
  }, OPENROUTER_TRANSLATION_TIMEOUT_MS, 'OpenRouter language verification');

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[openrouter] verify ${response.status}:`, errorText);
    throw new UpstreamApiError(response.status, errorText);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  const content = data.choices[0]?.message?.content?.trim().toLowerCase() ?? '';
  return content.includes('yes');
}

export async function verifyLanguageWithGoogleAI(
  text: string,
  model: string,
  expectedLang: TranslationLanguage,
): Promise<boolean> {
  const GOOGLE_AI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';
  const GOOGLE_AI_TRANSLATION_TIMEOUT_MS = 20_000;
  const key = process.env.GOOGLE_AI_STUDIO_API_KEY;
  if (!key) throw new Error('GOOGLE_AI_STUDIO_API_KEY is missing');

  const prompt = buildLanguageVerificationPrompt(text, expectedLang);
  const res = await fetchWithTimeout(`${GOOGLE_AI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 10,
    }),
  }, GOOGLE_AI_TRANSLATION_TIMEOUT_MS, 'Google AI Studio language verification');

  if (!res.ok) {
    const body = await res.text();
    console.error(`[googleai] verify ${res.status}:`, body);
    throw new UpstreamApiError(res.status, body);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices[0]?.message?.content?.trim().toLowerCase() ?? '';
  return content.includes('yes');
}

export async function verifyLanguageWithOllama(
  text: string,
  model: string,
  expectedLang: TranslationLanguage,
): Promise<boolean> {
  const host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  const OLLAMA_BASE_URL = host.startsWith('http') ? host : `http://${host}`;
  const OLLAMA_TRANSLATION_TIMEOUT_MS = 30_000;

  const prompt = buildLanguageVerificationPrompt(text, expectedLang);
  const response = await fetchWithTimeout(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: { temperature: 0.1, num_predict: 10 },
    }),
  }, OLLAMA_TRANSLATION_TIMEOUT_MS, 'Ollama language verification');

  if (!response.ok) {
    const errorText = await response.text();
    throw new UpstreamApiError(response.status, errorText);
  }

  const data = (await response.json()) as {
    message?: { content?: string };
  };

  const content = data.message?.content?.trim().toLowerCase() ?? '';
  return content.includes('yes');
}

export async function verifyLanguage(
  text: string,
  expectedLang: TranslationLanguage,
  provider = 'openrouter',
  model = DEFAULT_MODEL,
): Promise<boolean> {
  if (!text.trim()) return false;

  if (provider === 'ollama') {
    return await verifyLanguageWithOllama(text, model, expectedLang);
  } else if (provider === 'google-ai-studio') {
    return await verifyLanguageWithGoogleAI(text, model, expectedLang);
  } else if (provider === 'minimax') {
    return await verifyLanguageWithMinimax(text, model, expectedLang, buildLanguageVerificationPrompt);
  } else {
    return await verifyLanguageWithOpenRouter(text, expectedLang, model);
  }
}
