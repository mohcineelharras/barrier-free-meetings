import {
  buildTranslationPrompt,
  fetchWithTimeout,
  type TranslationLanguage,
  UpstreamApiError,
} from './translate.js';

function getOllamaBaseUrl(): string {
  const host = process.env.OLLAMA_HOST;
  if (host) {
    return host.startsWith('http') ? host : `http://${host}`;
  }
  return 'http://127.0.0.1:11434';
}

const OLLAMA_BASE_URL = getOllamaBaseUrl();
const OLLAMA_TRANSLATION_TIMEOUT_MS = 30_000;
const THINK_BLOCK_PATTERN = /<think\b[^>]*>[\s\S]*?<\/think>\s*/gi;

function stripThinkBlocks(text: string): string {
  return text.replace(THINK_BLOCK_PATTERN, '').trim();
}

export async function translateWithOllama(
  text: string,
  model: string,
  sourceLang: TranslationLanguage,
  targetLang: TranslationLanguage,
): Promise<string> {
  const response = await fetchWithTimeout(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: buildTranslationPrompt(text, sourceLang, targetLang) }],
      stream: false,
      think: false,
      options: { temperature: 0.2, num_predict: 512 },
    }),
  }, OLLAMA_TRANSLATION_TIMEOUT_MS, 'Ollama translation');

  if (!response.ok) {
    const errorText = await response.text();
    throw new UpstreamApiError(response.status, errorText);
  }

  const data = (await response.json()) as {
    message?: { content?: string };
  };

  return stripThinkBlocks(data.message?.content?.trim() ?? '');
}

export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
