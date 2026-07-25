export type WhisperModelName = 'tiny' | 'base' | 'small' | 'medium' | 'turbo' | 'turbo-v3';

export interface ModelManifest {
  requiredOllamaModels: string[];
  optionalOllamaModels: string[];
  requiredWhisperModels: WhisperModelName[];
}

export const DEFAULT_REQUIRED_OLLAMA_MODELS = ['qwen3.5:0.8b'] as const;
export const DEFAULT_OPTIONAL_OLLAMA_MODELS = ['qwen3.5:2b'] as const;
export const DEFAULT_REQUIRED_WHISPER_MODELS = ['tiny', 'base'] as const;

export const WHISPER_MODEL_IDS: Record<WhisperModelName, string> = {
  tiny: 'onnx-community/whisper-tiny_timestamped',
  base: 'onnx-community/whisper-base_timestamped',
  small: 'onnx-community/whisper-small_timestamped',
  medium: 'onnx-community/whisper-medium_timestamped',
  turbo: 'onnx-community/lite-whisper-large-v3-turbo-ONNX',
  'turbo-v3': 'onnx-community/whisper-large-v3-turbo_timestamped',
};

const VALID_WHISPER_MODELS = new Set(Object.keys(WHISPER_MODEL_IDS));

export function parseModelList<T extends string>(value: string | undefined, fallback: readonly T[]): T[] {
  if (!value?.trim()) {
    return [...fallback];
  }

  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ) as T[];
}

function parseWhisperModelList(value: string | undefined): WhisperModelName[] {
  const candidates = parseModelList<string>(value, DEFAULT_REQUIRED_WHISPER_MODELS);
  return candidates.filter((model): model is WhisperModelName => VALID_WHISPER_MODELS.has(model));
}

export function getModelManifest(env: NodeJS.ProcessEnv = process.env): ModelManifest {
  return {
    requiredOllamaModels: parseModelList(env.REQUIRED_OLLAMA_MODELS, DEFAULT_REQUIRED_OLLAMA_MODELS),
    optionalOllamaModels: parseModelList(env.OPTIONAL_OLLAMA_MODELS, DEFAULT_OPTIONAL_OLLAMA_MODELS),
    requiredWhisperModels: parseWhisperModelList(env.REQUIRED_WHISPER_MODELS),
  };
}
