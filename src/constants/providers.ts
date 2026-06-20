export interface Provider {
  id: string;
  name: string;
}

export type ProviderId = 'openrouter' | 'google-ai-studio' | 'minimax' | 'ollama';

export const PROVIDERS: Provider[] = [
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'google-ai-studio', name: 'Google AI Studio' },
  { id: 'minimax', name: 'MiniMax' },
  { id: 'ollama', name: 'Ollama (local)' },
];

const ENV_DEFAULT_PROVIDER = (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
  .env?.VITE_DEFAULT_PROVIDER as ProviderId | undefined;
const VALID_PROVIDER_IDS = new Set<string>(['openrouter', 'google-ai-studio', 'minimax', 'ollama']);

export const DEFAULT_PROVIDER: ProviderId =
  ENV_DEFAULT_PROVIDER && VALID_PROVIDER_IDS.has(ENV_DEFAULT_PROVIDER)
    ? ENV_DEFAULT_PROVIDER
    : 'openrouter';

export const OPENROUTER_DEFAULT_MODEL = 'liquid/lfm-2.5-1.2b-instruct:free';
export const GOOGLE_AI_STUDIO_DEFAULT_MODEL = 'gemma-4-26b-a4b-it';
export const MINIMAX_DEFAULT_MODEL = 'MiniMax-M2.7';
export const OLLAMA_DEFAULT_MODEL = 'qwen3.5:0.8b';

export function getPreferredModelForProvider(provider: ProviderId): string {
  if (provider === 'google-ai-studio') {
    return GOOGLE_AI_STUDIO_DEFAULT_MODEL;
  }

  if (provider === 'minimax') {
    return MINIMAX_DEFAULT_MODEL;
  }

  if (provider === 'ollama') {
    return OLLAMA_DEFAULT_MODEL;
  }

  if (provider === 'openrouter') {
    return OPENROUTER_DEFAULT_MODEL;
  }

  return '';
}

export const DEFAULT_MODEL = getPreferredModelForProvider(DEFAULT_PROVIDER);
