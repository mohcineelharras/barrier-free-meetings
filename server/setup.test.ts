import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInitialSetupStatus,
  getOllamaBaseUrl,
  getOllamaDownloadUrl,
  getSetupMode,
  updateRequirement,
} from './setup';

test('getSetupMode honors explicit docker and disabled modes', () => {
  assert.equal(getSetupMode({ TRANSCRIBE_EASY_SETUP_MODE: 'docker' }), 'docker');
  assert.equal(getSetupMode({ TRANSCRIBE_EASY_SETUP_MODE: 'disabled' }), 'disabled');
});

test('getSetupMode treats Hugging Face Spaces as disabled', () => {
  assert.equal(getSetupMode({ HF_SPACES: 'true' }), 'disabled');
});

test('getOllamaBaseUrl respects OLLAMA_HOST with and without protocol', () => {
  assert.equal(getOllamaBaseUrl({ OLLAMA_HOST: 'ollama:11434' }), 'http://ollama:11434');
  assert.equal(getOllamaBaseUrl({ OLLAMA_HOST: 'http://127.0.0.1:11434' }), 'http://127.0.0.1:11434');
  assert.equal(getOllamaBaseUrl({}), 'http://127.0.0.1:11434');
});

test('getOllamaDownloadUrl uses current Ollama release asset names', () => {
  assert.match(getOllamaDownloadUrl('darwin', 'arm64'), /ollama-darwin\.tgz$/);
  assert.match(getOllamaDownloadUrl('linux', 'x64'), /ollama-linux-amd64\.tar\.zst$/);
  assert.match(getOllamaDownloadUrl('linux', 'arm64'), /ollama-linux-arm64\.tar\.zst$/);
  assert.match(getOllamaDownloadUrl('win32', 'x64'), /ollama-windows-amd64\.zip$/);
  assert.match(getOllamaDownloadUrl('win32', 'arm64'), /ollama-windows-arm64\.zip$/);
});

test('createInitialSetupStatus preserves legacy fields and exposes requirement details', () => {
  const status = createInitialSetupStatus(
    {
      requiredOllamaModels: ['qwen3.5:0.8b'],
      optionalOllamaModels: ['qwen3.5:2b'],
      requiredWhisperModels: ['tiny', 'base'],
    },
    'docker',
  );

  assert.equal(status.step, 'detecting');
  assert.equal(status.progress, 0);
  assert.equal(status.error, null);
  assert.equal(status.mode, 'docker');
  assert.deepEqual(
    status.requirements.map((requirement) => ({
      id: requirement.id,
      kind: requirement.kind,
      required: requirement.required,
      state: requirement.state,
    })),
    [
      { id: 'ollama-binary', kind: 'ollama-binary', required: true, state: 'missing' },
      { id: 'ollama-server', kind: 'ollama-server', required: true, state: 'missing' },
      { id: 'ollama-model:qwen3.5:0.8b', kind: 'ollama-model', required: true, state: 'missing' },
      { id: 'whisper-model:tiny', kind: 'whisper-model', required: true, state: 'missing' },
      { id: 'whisper-model:base', kind: 'whisper-model', required: true, state: 'missing' },
      { id: 'ollama-model:qwen3.5:2b', kind: 'ollama-model', required: false, state: 'missing' },
    ],
  );
});

test('updateRequirement updates one requirement immutably', () => {
  const status = createInitialSetupStatus(
    {
      requiredOllamaModels: ['qwen3.5:0.8b'],
      optionalOllamaModels: [],
      requiredWhisperModels: ['tiny'],
    },
    'desktop',
  );

  const next = updateRequirement(status, 'ollama-model:qwen3.5:0.8b', {
    progress: 100,
    state: 'ready',
  });

  assert.equal(status.requirements.find((item) => item.id === 'ollama-model:qwen3.5:0.8b')?.state, 'missing');
  assert.equal(next.requirements.find((item) => item.id === 'ollama-model:qwen3.5:0.8b')?.state, 'ready');
});
