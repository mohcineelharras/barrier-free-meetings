import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchFreeModels, fetchOllamaModels } from './models';

test('fetchFreeModels returns all free text chat models with preferred order first', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'meta-llama/llama-3.3-70b-instruct:free',
            name: 'Llama 3.3 70B',
            pricing: { prompt: '0', completion: '0' },
            architecture: { output_modalities: ['text'] },
          },
          {
            id: 'inclusionai/ling-3.0-flash:free',
            name: 'Ling-3.0-flash (free)',
            pricing: { prompt: '0', completion: '0' },
            architecture: { output_modalities: ['text'] },
          },
          {
            id: 'google/gemma-4-26b-a4b-it:free',
            name: 'Gemma 4 26B A4B',
            pricing: { prompt: '0', completion: '0' },
            architecture: { output_modalities: ['text'] },
          },
          {
            id: 'nvidia/nemotron-3.5-content-safety:free',
            name: 'Content Safety',
            pricing: { prompt: '0', completion: '0' },
            architecture: { output_modalities: ['text'] },
          },
          {
            id: 'google/lyria-3-pro-preview',
            name: 'Lyria 3 Pro',
            pricing: { prompt: '0', completion: '0' },
            architecture: { output_modalities: ['text', 'audio'] },
          },
          {
            id: 'paid/model',
            name: 'Paid Model',
            pricing: { prompt: '0.001', completion: '0.002' },
            architecture: { output_modalities: ['text'] },
          },
        ],
      }),
    }) as Response) as typeof fetch;

  try {
    const models = await fetchFreeModels();

    assert.deepEqual(models, [
      { id: 'inclusionai/ling-3.0-flash:free', name: 'Ling-3.0-flash (free)' },
      { id: 'google/gemma-4-26b-a4b-it:free', name: 'Gemma 4 26B A4B' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B' },
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
