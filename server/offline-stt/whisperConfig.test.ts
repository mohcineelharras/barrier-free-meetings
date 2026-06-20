import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWhisperTranscriptionOptions,
  normalizeWhisperLanguage,
} from './whisperConfig';

test('normalizeWhisperLanguage strips region tag and lowercases', () => {
  assert.equal(normalizeWhisperLanguage('zh-CN'), 'zh');
  assert.equal(normalizeWhisperLanguage('EN-us'), 'en');
  assert.equal(normalizeWhisperLanguage('ar-SA'), 'ar');
  assert.equal(normalizeWhisperLanguage('fr-FR'), 'fr');
  assert.equal(normalizeWhisperLanguage('auto'), undefined);
  assert.equal(normalizeWhisperLanguage(undefined), undefined);
});

test('buildWhisperTranscriptionOptions forces transcription with word timestamps', () => {
  assert.deepEqual(buildWhisperTranscriptionOptions('fr-FR'), {
    chunk_length_s: 29,
    force_full_sequences: false,
    language: 'fr',
    return_timestamps: 'word',
    stride_length_s: 5,
    task: 'transcribe',
  });
});
