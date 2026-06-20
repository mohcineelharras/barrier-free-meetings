import assert from 'node:assert/strict';
import test from 'node:test';

import { generateReport } from './report';

const runtimeConfig = {
  apiBaseUrl: 'https://api.example.test',
  isHostedDemo: false,
  isLocalhost: false,
  isNativeApp: false,
  wsBaseUrl: 'wss://api.example.test',
};

test('generateReport sends report requests with a timeout signal', async () => {
  const originalFetch = globalThis.fetch;
  let requestSignal: AbortSignal | undefined;

  globalThis.fetch = (async (_url, init) => {
    requestSignal = init?.signal instanceof AbortSignal ? init.signal : undefined;
    return new Response(JSON.stringify({ report: '## Summary\n- Done' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await generateReport(
      {
        segments: [{ original: 'Hello', translated: 'Bonjour' }],
        sourceLang: 'English',
        targetLang: 'French',
        reportLang: 'French',
        provider: 'openrouter',
        model: 'model',
      },
      runtimeConfig,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(requestSignal);
});

