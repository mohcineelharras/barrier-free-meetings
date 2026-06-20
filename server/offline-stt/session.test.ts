import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOfflineTranscriptionSession,
  type RecognitionRequest,
  type TimestampedChunk,
  type TranscriptionRecognizer,
} from './session';
import { buildWhisperTranscriptionOptions } from './whisperConfig';

function pcm(values: number[]): Float32Array {
  return new Float32Array(values);
}

function chunk(text: string, startMs: number, endMs: number): TimestampedChunk {
  return { text, startMs, endMs };
}

test('offline session emits a partial before the finalized transcript', async () => {
  let now = 0;
  const events: Array<{ type: 'partial' | 'final' | 'error'; text?: string; message?: string }> = [];
  let callCount = 0;

  const recognizer: TranscriptionRecognizer = {
    async start() {},
    async stop() {},
    async transcribe(_request: RecognitionRequest) {
      callCount += 1;
      if (callCount === 1) {
        return { chunks: [chunk('draft', 0, 900)] };
      }

      return {
        chunks: [
          chunk('draft', 0, 900),
          chunk('phrase', 900, 1_500),
        ],
      };
    },
  };

  const session = createOfflineTranscriptionSession({
    analysisThrottleMs: 0,
    createRecognizer: async () => recognizer,
    minimumAnalysisMs: 500,
    now: () => now,
    onError: (message) => events.push({ type: 'error', message }),
    onFinal: (text) => events.push({ type: 'final', text }),
    onPartial: (text) => events.push({ type: 'partial', text }),
    sampleRate: 4,
    silenceDurationMs: 400,
    silenceThresholdRms: 0.1,
    startupTimeoutMs: 1_000,
    unstableTailMs: 300,
  });

  await session.start();

  now = 1_000;
  await session.pushAudio(pcm([0.8, 0.8, 0.8, 0.8]));

  now = 2_000;
  await session.pushAudio(pcm([0, 0, 0, 0]));
  now = 2_500;
  await session.pushAudio(pcm([0, 0, 0, 0]));

  assert.deepEqual(events, [
    { type: 'partial', text: 'draft' },
    { type: 'final', text: 'draft phrase' },
  ]);
});

test('offline session suppresses duplicate partials and flushes the last draft on stop', async () => {
  let now = 0;
  const events: Array<{ type: 'partial' | 'final' | 'error'; text?: string; message?: string }> = [];

  const recognizer: TranscriptionRecognizer = {
    async start() {},
    async stop() {},
    async transcribe() {
      return { chunks: [chunk('same draft', 0, 880)] };
    },
  };

  const session = createOfflineTranscriptionSession({
    analysisThrottleMs: 0,
    createRecognizer: async () => recognizer,
    minimumAnalysisMs: 500,
    now: () => now,
    onError: (message) => events.push({ type: 'error', message }),
    onFinal: (text) => events.push({ type: 'final', text }),
    onPartial: (text) => events.push({ type: 'partial', text }),
    sampleRate: 4,
    silenceDurationMs: 5_000,
    silenceThresholdRms: 0.1,
    startupTimeoutMs: 1_000,
    unstableTailMs: 300,
  });

  await session.start();

  now = 1_000;
  await session.pushAudio(pcm([0.8, 0.8, 0.8, 0.8]));

  now = 2_000;
  await session.pushAudio(pcm([0.8, 0.8, 0.8, 0.8]));

  await session.stop();

  assert.deepEqual(events, [
    { type: 'partial', text: 'same draft' },
    { type: 'final', text: 'same draft' },
  ]);
});

test('offline session surfaces recognizer startup timeout as an actionable error', async () => {
  let now = 0;
  const events: Array<{ type: 'partial' | 'final' | 'error'; text?: string; message?: string }> = [];

  const session = createOfflineTranscriptionSession({
    analysisThrottleMs: 0,
    createRecognizer: async () => ({
      start: () => new Promise<void>(() => {}),
      stop: async () => {},
      transcribe: async () => ({ chunks: [] }),
    }),
    minimumAnalysisMs: 500,
    now: () => now,
    onError: (message) => events.push({ type: 'error', message }),
    onFinal: (text) => events.push({ type: 'final', text }),
    onPartial: (text) => events.push({ type: 'partial', text }),
    sampleRate: 16_000,
    silenceDurationMs: 800,
    silenceThresholdRms: 0.005,
    startupTimeoutMs: 100,
    unstableTailMs: 400,
  });

  const startPromise = session.start();
  now = 200;

  await assert.rejects(startPromise, /timed out/i);
  assert.deepEqual(events, [
    {
      type: 'error',
      message: 'Offline transcription engine timed out while starting. Try the tiny model first, then retry.',
    },
  ]);
});

test('offline session propagates recognizer runtime errors once and keeps cleanup safe', async () => {
  let now = 0;
  const events: Array<{ type: 'partial' | 'final' | 'error'; text?: string; message?: string }> = [];
  let stopCalls = 0;

  const recognizer: TranscriptionRecognizer = {
    async start() {},
    async stop() {
      stopCalls += 1;
    },
    async transcribe() {
      throw new Error('worker crashed');
    },
  };

  const session = createOfflineTranscriptionSession({
    analysisThrottleMs: 0,
    createRecognizer: async () => recognizer,
    minimumAnalysisMs: 500,
    now: () => now,
    onError: (message) => events.push({ type: 'error', message }),
    onFinal: (text) => events.push({ type: 'final', text }),
    onPartial: (text) => events.push({ type: 'partial', text }),
    sampleRate: 4,
    silenceDurationMs: 800,
    silenceThresholdRms: 0.1,
    startupTimeoutMs: 1_000,
    unstableTailMs: 300,
  });

  await session.start();

  now = 1_000;
  await session.pushAudio(pcm([0.8, 0.8, 0.8, 0.8]));
  await session.stop();

  assert.equal(stopCalls, 1);
  assert.deepEqual(events, [
    {
      type: 'error',
      message: 'Offline transcription failed: worker crashed',
    },
  ]);
});

test('whisper transcription options force multilingual transcription instead of English translation', () => {
  assert.deepEqual(buildWhisperTranscriptionOptions('fr-FR'), {
    chunk_length_s: 29,
    force_full_sequences: false,
    language: 'fr',
    return_timestamps: 'word',
    stride_length_s: 5,
    task: 'transcribe',
  });
});

test('offline session filters single-word fragment hallucinations during silence', async () => {
  let now = 0;
  const events: Array<{ type: 'partial' | 'final' | 'error'; text?: string; message?: string }> = [];
  let callCount = 0;

  const recognizer: TranscriptionRecognizer = {
    async start() {},
    async stop() {},
    async transcribe(_request: RecognitionRequest) {
      callCount += 1;
      if (callCount === 1) {
        return {
          chunks: [
            chunk('Wow', 0, 300),
            chunk("that's", 300, 600),
            chunk('amazing.', 600, 900),
          ],
        };
      }
      if (callCount === 3) {
        return { chunks: [chunk('amazing.', 2000, 2500)] };
      }
      return { chunks: [] };
    },
  };

  const session = createOfflineTranscriptionSession({
    analysisThrottleMs: 0,
    createRecognizer: async () => recognizer,
    minimumAnalysisMs: 500,
    now: () => now,
    onError: (message) => events.push({ type: 'error', message }),
    onFinal: (text) => events.push({ type: 'final', text }),
    onPartial: (text) => events.push({ type: 'partial', text }),
    sampleRate: 4,
    silenceDurationMs: 400,
    silenceThresholdRms: 0.1,
    startupTimeoutMs: 1_000,
    unstableTailMs: 300,
  });

  await session.start();

  now = 1_000;
  await session.pushAudio(pcm([0.8, 0.8, 0.8, 0.8]));

  now = 2_000;
  await session.pushAudio(pcm([0, 0, 0, 0]));
  now = 2_500;
  await session.pushAudio(pcm([0, 0, 0, 0]));

  assert.deepEqual(events, [
    { type: 'partial', text: 'Wow that\'s amazing.' },
  ]);
});

test('offline session keeps normal multi-word finals during silence', async () => {
  let now = 0;
  const events: Array<{ type: 'partial' | 'final' | 'error'; text?: string; message?: string }> = [];
  let callCount = 0;

  const recognizer: TranscriptionRecognizer = {
    async start() {},
    async stop() {},
    async transcribe(_request: RecognitionRequest) {
      callCount += 1;
      if (callCount === 1) {
        return {
          chunks: [
            chunk('Hello', 0, 300),
            chunk('world', 300, 600),
          ],
        };
      }
      if (callCount === 2) {
        return { chunks: [chunk('Hello world', 2000, 2500)] };
      }
      return { chunks: [] };
    },
  };

  const session = createOfflineTranscriptionSession({
    analysisThrottleMs: 0,
    createRecognizer: async () => recognizer,
    minimumAnalysisMs: 500,
    now: () => now,
    onError: (message) => events.push({ type: 'error', message }),
    onFinal: (text) => events.push({ type: 'final', text }),
    onPartial: (text) => events.push({ type: 'partial', text }),
    sampleRate: 4,
    silenceDurationMs: 400,
    silenceThresholdRms: 0.1,
    startupTimeoutMs: 1_000,
    unstableTailMs: 300,
  });

  await session.start();

  now = 1_000;
  await session.pushAudio(pcm([0.8, 0.8, 0.8, 0.8]));

  now = 2_000;
  await session.pushAudio(pcm([0, 0, 0, 0]));
  now = 2_500;
  await session.pushAudio(pcm([0, 0, 0, 0]));

  assert.deepEqual(events, [
    { type: 'final', text: 'Hello world' },
    { type: 'partial', text: 'Hello world' },
  ]);
});

test('whisper transcription options keep auto detection while still forcing transcription mode', () => {
  assert.deepEqual(buildWhisperTranscriptionOptions('auto'), {
    chunk_length_s: 29,
    force_full_sequences: false,
    language: undefined,
    return_timestamps: 'word',
    stride_length_s: 5,
    task: 'transcribe',
  });
});
