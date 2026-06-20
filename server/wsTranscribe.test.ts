import assert from 'node:assert/strict';
import test from 'node:test';

import { createTranscribeSession } from './wsTranscribe';

test('transcribe session emits partial updates before finalized transcript events', async () => {
  let now = 0;
  let transcribeCalls = 0;
  const messages: Array<{ type: string; text?: string; message?: string }> = [];

  const ws = {
    OPEN: 1,
    readyState: 1,
    close() {},
    send(data: string) {
      messages.push(JSON.parse(data) as { type: string; text?: string; message?: string });
    },
  };

  const session = createTranscribeSession(ws, {
    analysisThrottleMs: 0,
    createRecognizer: async () => ({
      async start() {},
      async stop() {},
      async transcribe() {
        transcribeCalls += 1;
        if (transcribeCalls === 1) {
          return {
            chunks: [{ endMs: 900, startMs: 0, text: 'draft' }],
          };
        }

        return {
          chunks: [
            { endMs: 900, startMs: 0, text: 'draft' },
            { endMs: 1_500, startMs: 900, text: 'phrase' },
          ],
        };
      },
    }),
    minimumAnalysisMs: 500,
    now: () => now,
    sampleRate: 4,
    silenceDurationMs: 400,
    silenceThresholdRms: 0.1,
    startupTimeoutMs: 1_000,
    unstableTailMs: 300,
  });

  await session.start();
  await session.handleTextMessage(JSON.stringify({ type: 'config', language: 'en-US' }));

  now = 1_000;
  await session.handleAudioChunk(Buffer.from(new Float32Array([0.8, 0.8, 0.8, 0.8]).buffer));

  now = 2_000;
  await session.handleAudioChunk(Buffer.from(new Float32Array([0, 0, 0, 0]).buffer));

  assert.deepEqual(messages, [
    { type: 'partial', text: 'draft' },
    { type: 'final', text: 'draft phrase' },
  ]);
});

test('transcribe session sends actionable errors when the recognizer cannot start', async () => {
  const messages: Array<{ type: string; text?: string; message?: string }> = [];

  const ws = {
    OPEN: 1,
    readyState: 1,
    close() {},
    send(data: string) {
      messages.push(JSON.parse(data) as { type: string; text?: string; message?: string });
    },
  };

  const session = createTranscribeSession(ws, {
    createRecognizer: async () => ({
      start: () => Promise.reject(new Error('download unavailable')),
      stop: async () => {},
      transcribe: async () => ({ chunks: [] }),
    }),
    now: () => Date.now(),
    startupTimeoutMs: 1_000,
  });

  await assert.rejects(session.start(), /download unavailable/);
  assert.deepEqual(messages, [
    { type: 'error', message: 'download unavailable' },
  ]);
});

test('transcribe session forwards configured language into recognizer requests', async () => {
  let seenLanguage: string | null = null;

  const ws = {
    OPEN: 1,
    readyState: 1,
    close() {},
    send() {},
  };

  const session = createTranscribeSession(ws, {
    createRecognizer: async () => ({
      async start() {},
      async stop() {},
      async transcribe(request) {
        seenLanguage = request.language;
        return {
          chunks: [{ endMs: 1_000, startMs: 0, text: 'bonjour' }],
        };
      },
    }),
    minimumAnalysisMs: 500,
    now: () => 1_000,
    sampleRate: 4,
    silenceDurationMs: 400,
    silenceThresholdRms: 0.1,
    startupTimeoutMs: 1_000,
    unstableTailMs: 300,
  });

  await session.start();
  await session.handleTextMessage(JSON.stringify({ type: 'config', language: 'fr-FR' }));
  await session.handleAudioChunk(Buffer.from(new Float32Array([0.8, 0.8, 0.8, 0.8]).buffer));

  assert.equal(seenLanguage, 'fr-FR');
});
