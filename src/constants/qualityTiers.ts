export type QualityTier = 'low' | 'medium' | 'high' | 'high-star';

export const QUALITY_TIER_LABELS: Record<QualityTier, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  'high-star': 'High*',
};

export const WHISPER_TIER_MODEL: Record<QualityTier, 'tiny' | 'base' | 'small' | 'turbo' | 'turbo-v3'> = {
  low: 'tiny',
  medium: 'base',
  high: 'turbo-v3',
  'high-star': 'turbo',
};

export const WHISPER_TIER_RAM: Record<QualityTier, string> = {
  low: '~150 MB RAM',
  medium: '~290 MB RAM',
  high: '~3.3 GB RAM',
  'high-star': '~1 GB RAM',
};

export const OLLAMA_TIER_RAM: Record<QualityTier, string> = {
  low: '~600 MB RAM',
  medium: '~1.5 GB RAM',
  high: '~3 GB RAM',
  'high-star': '~3 GB RAM',
};

export const OLLAMA_TIER_MODEL: Record<QualityTier, string> = {
  low: 'qwen3.5:0.8b',
  medium: 'qwen3.5:2b',
  high: 'qwen3.5:4b',
  'high-star': 'qwen3.5:4b',
};
