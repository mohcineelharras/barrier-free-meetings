import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRecognitionResult } from './transformersWhisperResult';

test('buildRecognitionResult keeps timestamped Whisper chunks when available', () => {
  assert.deepEqual(
    buildRecognitionResult({
      audioDurationMs: 2_000,
      result: {
        chunks: [
          { text: 'hello', timestamp: [0, 0.8] },
          { text: 'world', timestamp: [0.8, 1.5] },
        ],
        text: 'hello world',
      },
    }),
    {
      chunks: [
        { text: 'hello', startMs: 0, endMs: 800 },
        { text: 'world', startMs: 800, endMs: 1_500 },
      ],
      text: 'hello world',
    },
  );
});

test('buildRecognitionResult falls back to a single chunk when timestamps are unavailable', () => {
  assert.deepEqual(
    buildRecognitionResult({
      audioDurationMs: 2_000,
      result: {
        chunks: [],
        text: 'hello world',
      },
    }),
    {
      chunks: [
        { text: 'hello world', startMs: 0, endMs: 2_000 },
      ],
      text: 'hello world',
    },
  );
});

test('buildRecognitionResult filters heavy repetition hallucinations', () => {
  assert.deepEqual(
    buildRecognitionResult({
      audioDurationMs: 5_000,
      result: {
        chunks: [],
        text: 'المجرد من المجرد من المجرد من المجرد من المجرد من المجرد من',
      },
    }),
    { chunks: [], text: '' },
  );
});

test('buildRecognitionResult filters single-word repetition hallucinations', () => {
  assert.deepEqual(
    buildRecognitionResult({
      audioDurationMs: 3_000,
      result: {
        chunks: [],
        text: 'تخريبك تخريبك تخريبك تخريبك',
      },
    }),
    { chunks: [], text: '' },
  );
});

test('buildRecognitionResult keeps normal text with occasional repetition', () => {
  assert.deepEqual(
    buildRecognitionResult({
      audioDurationMs: 3_000,
      result: {
        chunks: [],
        text: 'yes yes I understand',
      },
    }),
    {
      chunks: [
        { text: 'yes yes I understand', startMs: 0, endMs: 3_000 },
      ],
      text: 'yes yes I understand',
    },
  );
});

test('buildRecognitionResult filters repetition hallucination chunks individually', () => {
  assert.deepEqual(
    buildRecognitionResult({
      audioDurationMs: 5_000,
      result: {
        chunks: [
          { text: 'hello', timestamp: [0, 0.8] },
          { text: 'world world world world', timestamp: [0.8, 1.5] },
        ],
        text: 'hello world world world world',
      },
    }),
    {
      chunks: [
        { text: 'hello', startMs: 0, endMs: 800 },
      ],
      text: 'hello',
    },
  );
});
