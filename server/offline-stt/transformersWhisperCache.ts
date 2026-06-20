import fs from 'node:fs';
import path from 'node:path';

import type { WhisperModelName } from './transformersWhisperEngine';

const MODEL_CACHE_DIR_NAMES: Record<WhisperModelName, string> = {
  tiny: 'whisper-tiny_timestamped',
  base: 'whisper-base_timestamped',
  small: 'whisper-small_timestamped',
  medium: 'whisper-medium_timestamped',
  turbo: 'lite-whisper-large-v3-turbo-ONNX',
  'turbo-v3': 'whisper-large-v3-turbo_timestamped',
};

function getModelCacheDir(cacheDir: string, model: WhisperModelName): string {
  return path.join(cacheDir, 'onnx-community', MODEL_CACHE_DIR_NAMES[model], 'onnx');
}

export function hasCompleteWhisperCache(cacheDir: string, model: WhisperModelName): boolean {
  const modelDir = getModelCacheDir(cacheDir, model);
  return (
    fs.existsSync(path.join(modelDir, 'encoder_model.onnx')) &&
    fs.existsSync(path.join(modelDir, 'decoder_model_merged.onnx'))
  );
}

export function hasPartialWhisperCache(cacheDir: string, model: WhisperModelName): boolean {
  const modelDir = getModelCacheDir(cacheDir, model);
  if (!fs.existsSync(modelDir)) return false;

  const entries = fs.readdirSync(modelDir);
  const hasTempDecoder = entries.some((entry) => entry.startsWith('decoder_model_merged.onnx.tmp.'));
  const hasTempEncoder = entries.some((entry) => entry.startsWith('encoder_model.onnx.tmp.'));

  return (hasTempDecoder || hasTempEncoder) && !hasCompleteWhisperCache(cacheDir, model);
}

export function resetWhisperCache(cacheDir: string, model: WhisperModelName): void {
  const modelDir = path.join(cacheDir, 'onnx-community', MODEL_CACHE_DIR_NAMES[model]);
  fs.rmSync(modelDir, { force: true, recursive: true });
}
