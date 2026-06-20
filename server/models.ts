import { OPENROUTER_FAST_FREE_TRANSLATION_MODELS, OPENROUTER_PAID_FALLBACK_MODEL } from './translate.js';
export { fetchMinimaxModels } from './minimax.js';

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string };
}

interface OllamaTagsResponse {
  models: Array<{ name: string }>;
}

export interface FreeModel {
  id: string;
  name: string;
}

export async function fetchFreeModels(): Promise<FreeModel[]> {
  const response = await fetch('https://openrouter.ai/api/v1/models');

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }

  const data = (await response.json()) as { data: OpenRouterModel[] };

  const available = new Map(
    data.data
      .filter((m) => m.pricing.prompt === '0' && m.pricing.completion === '0')
      .map((m) => [m.id, { id: m.id, name: m.name }]),
  );

  const freeModels = OPENROUTER_FAST_FREE_TRANSLATION_MODELS
    .map((id) => available.get(id))
    .filter((model): model is FreeModel => Boolean(model));

  // Always offer the paid model as an explicit, opt-in choice in the dropdown.
  // Selecting it routes translation to the paid single-model path server-side.
  return [
    ...freeModels,
    { id: OPENROUTER_PAID_FALLBACK_MODEL, name: 'DeepSeek V4 Flash (paid)' },
  ];
}

const SUPPORTED_OLLAMA_MODELS = ['qwen3.5:0.8b', 'qwen3.5:2b'];

function normalizeOllamaModelName(name: string): string {
  return name.replace(/:latest$/, '');
}

export async function fetchOllamaModels(): Promise<FreeModel[]> {
  try {
    const response = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as OllamaTagsResponse;
    const available = new Set(data.models.map((model) => normalizeOllamaModelName(model.name)));

    return SUPPORTED_OLLAMA_MODELS.filter((model) => available.has(model)).map((model) => ({
      id: model,
      name: model,
    }));
  } catch {
    return [];
  }
}
