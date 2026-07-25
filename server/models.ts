import { OPENROUTER_FAST_FREE_TRANSLATION_MODELS, OPENROUTER_PAID_FALLBACK_MODEL } from './translate.js';
export { fetchMinimaxModels } from './minimax.js';

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string };
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
}

interface OllamaTagsResponse {
  models: Array<{ name: string }>;
}

export interface FreeModel {
  id: string;
  name: string;
}

function isFreeTextChatModel(model: OpenRouterModel): boolean {
  if (model.pricing.prompt !== '0' || model.pricing.completion !== '0') {
    return false;
  }

  // Guardrail / music generators are free but not useful for translation.
  if (model.id.includes('content-safety') || model.id.includes('lyria')) {
    return false;
  }

  const outputs = model.architecture?.output_modalities;
  if (Array.isArray(outputs) && outputs.length > 0 && !outputs.includes('text')) {
    return false;
  }
  if (Array.isArray(outputs) && outputs.includes('audio')) {
    return false;
  }

  return true;
}

export async function fetchFreeModels(): Promise<FreeModel[]> {
  const response = await fetch('https://openrouter.ai/api/v1/models');

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }

  const data = (await response.json()) as { data: OpenRouterModel[] };

  const available = data.data
    .filter(isFreeTextChatModel)
    .map((m) => ({ id: m.id, name: m.name }));

  const byId = new Map(available.map((model) => [model.id, model]));

  // Surface preferred fast/light models first so the default sits at the top.
  const preferred = OPENROUTER_FAST_FREE_TRANSLATION_MODELS
    .map((id) => byId.get(id))
    .filter((model): model is FreeModel => Boolean(model));

  const preferredIds = new Set(preferred.map((model) => model.id));
  const rest = available
    .filter((model) => !preferredIds.has(model.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Always offer the paid model as an explicit, opt-in choice in the dropdown.
  // Selecting it routes translation to the paid single-model path server-side.
  return [
    ...preferred,
    ...rest,
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
