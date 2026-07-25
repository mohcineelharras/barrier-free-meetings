import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_OPTIONAL_OLLAMA_MODELS,
  DEFAULT_REQUIRED_OLLAMA_MODELS,
  DEFAULT_REQUIRED_WHISPER_MODELS,
  getModelManifest,
  parseModelList,
} from './modelManifest';

test('model manifest exposes conservative open-source defaults', () => {
  assert.deepEqual(DEFAULT_REQUIRED_OLLAMA_MODELS, ['qwen3.5:0.8b']);
  assert.deepEqual(DEFAULT_OPTIONAL_OLLAMA_MODELS, ['qwen3.5:2b']);
  assert.deepEqual(DEFAULT_REQUIRED_WHISPER_MODELS, ['tiny', 'base']);
});

test('parseModelList trims, dedupes, and ignores blank entries', () => {
  assert.deepEqual(parseModelList(' tiny, base, tiny, ,small ', ['base']), [
    'tiny',
    'base',
    'small',
  ]);
});

test('getModelManifest reads environment overrides without mutating defaults', () => {
  const manifest = getModelManifest({
    REQUIRED_OLLAMA_MODELS: 'qwen3.5:0.8b,llama3.2:1b',
    OPTIONAL_OLLAMA_MODELS: '',
    REQUIRED_WHISPER_MODELS: 'tiny',
  });

  assert.deepEqual(manifest.requiredOllamaModels, ['qwen3.5:0.8b', 'llama3.2:1b']);
  assert.deepEqual(manifest.optionalOllamaModels, DEFAULT_OPTIONAL_OLLAMA_MODELS);
  assert.deepEqual(manifest.requiredWhisperModels, ['tiny']);
});
