import {
  buildTranslationPrompt,
  fetchWithTimeout,
  type TranslationLanguage,
  UpstreamApiError,
} from './translate.js';
import { getOllamaBaseUrl } from './ollamaUrl.js';

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
  const response = await fetchWithTimeout(`${getOllamaBaseUrl()}/api/chat`, {
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
    const res = await fetch(`${getOllamaBaseUrl()}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
