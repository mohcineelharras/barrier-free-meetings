import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchFreeModels, fetchOllamaModels } from './models';

test('fetchFreeModels returns only curated live-safe OpenRouter models in configured order', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        data: [
          { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', pricing: { prompt: '0', completion: '0' } },
          { id: 'liquid/lfm-2.5-1.2b-instruct:free', name: 'LFM 1.2B Instruct', pricing: { prompt: '0', completion: '0' } },
          { id: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nemotron Nano 30B', pricing: { prompt: '0', completion: '0' } },
          { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air', pricing: { prompt: '0', completion: '0' } },
          { id: 'poolside/laguna-m.1:free', name: 'Laguna M.1', pricing: { prompt: '0', completion: '0' } },
          { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B', pricing: { prompt: '0', completion: '0' } },
        ],
      }),
    }) as Response) as typeof fetch;

  try {
    const models = await fetchFreeModels();

    assert.deepEqual(models, [
      { id: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nemotron Nano 30B' },
      { id: 'liquid/lfm-2.5-1.2b-instruct:free', name: 'LFM 1.2B Instruct' },
      { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air' },
      { id: 'poolside/laguna-m.1:free', name: 'Laguna M.1' },
      { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash (paid)' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchOllamaModels only returns supported offline models in preferred order', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        models: [
          { name: 'qwen3:0.5b' },
          { name: 'qwen3.5:2b' },
          { name: 'llama3.2:1b' },
          { name: 'qwen3.5:0.8b' },
        ],
      }),
    }) as Response) as typeof fetch;

  try {
    const models = await fetchOllamaModels();

    assert.deepEqual(models, [
      { id: 'qwen3.5:0.8b', name: 'qwen3.5:0.8b' },
      { id: 'qwen3.5:2b', name: 'qwen3.5:2b' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
