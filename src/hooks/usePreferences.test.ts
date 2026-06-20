import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type AppPreferences,
  clearPreferences,
  loadPreferences,
  sanitizePreferences,
  savePreferences,
} from './usePreferences';

function createFakeStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    snapshot: () => Object.fromEntries(store),
  };
}

const VALID_PREFS: AppPreferences = {
  sourceLanguage: 'zh-CN',
  targetLanguage: 'fr-FR',
  selectedProvider: 'openrouter',
  selectedModel: 'liquid/lfm-2.5-1.2b-instruct:free',
  whisperTier: 'medium',
  ollamaTier: 'medium',
  audioSource: 'microphone',
  transcriptionBackendPreference: 'web-speech',
};

test('savePreferences then loadPreferences round-trips all fields', () => {
  const storage = createFakeStorage();

  savePreferences(VALID_PREFS, storage);

  assert.deepEqual(loadPreferences(storage), VALID_PREFS);
});

test('loadPreferences returns empty object when nothing is stored', () => {
  assert.deepEqual(loadPreferences(createFakeStorage()), {});
});

test('loadPreferences ignores corrupt JSON instead of throwing', () => {
  const storage = createFakeStorage({ 'transcribe-easy:preferences': '{not json' });

  assert.deepEqual(loadPreferences(storage), {});
});

test('sanitizePreferences drops an unknown provider so it is not restored', () => {
  const result = sanitizePreferences({
    selectedProvider: 'ollama',
    selectedModel: 'qwen3.5:0.8b',
  });

  assert.equal(result.selectedProvider, undefined);
  assert.equal(result.selectedModel, 'qwen3.5:0.8b');
});

test('sanitizePreferences drops a stale quality tier value', () => {
  const result = sanitizePreferences({ whisperTier: 'ultra', ollamaTier: 'high' });

  assert.equal(result.whisperTier, undefined);
  assert.equal(result.ollamaTier, 'high');
});

test('sanitizePreferences keeps a possibly-stale model id for later live validation', () => {
  const result = sanitizePreferences({
    selectedProvider: 'google-ai-studio',
    selectedModel: 'gemma-4-12b-it',
  });

  assert.equal(result.selectedProvider, 'google-ai-studio');
  assert.equal(result.selectedModel, 'gemma-4-12b-it');
});

test('clearPreferences removes the stored entry', () => {
  const storage = createFakeStorage();
  savePreferences(VALID_PREFS, storage);

  clearPreferences(storage);

  assert.deepEqual(loadPreferences(storage), {});
});
