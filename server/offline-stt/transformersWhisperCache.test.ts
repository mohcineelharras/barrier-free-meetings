import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  hasCompleteWhisperCache,
  hasPartialWhisperCache,
  resetWhisperCache,
} from './transformersWhisperCache';

function makeCacheRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-cache-test-'));
}

function ensureModelDir(cacheDir: string, model: 'tiny' | 'small'): string {
  const modelDirName =
    model === 'tiny' ? 'whisper-tiny_timestamped' : 'whisper-small_timestamped';
  const dir = path.join(cacheDir, 'onnx-community', modelDirName, 'onnx');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test('hasCompleteWhisperCache requires both final ONNX artifacts', () => {
  const cacheDir = makeCacheRoot();
  const modelDir = ensureModelDir(cacheDir, 'tiny');

  fs.writeFileSync(path.join(modelDir, 'encoder_model.onnx'), '');
  assert.equal(hasCompleteWhisperCache(cacheDir, 'tiny'), false);

  fs.writeFileSync(path.join(modelDir, 'decoder_model_merged.onnx'), '');
  assert.equal(hasCompleteWhisperCache(cacheDir, 'tiny'), true);
});

test('hasPartialWhisperCache detects temp-only downloads', () => {
  const cacheDir = makeCacheRoot();
  const modelDir = ensureModelDir(cacheDir, 'tiny');

  fs.writeFileSync(path.join(modelDir, 'encoder_model.onnx'), '');
  fs.writeFileSync(path.join(modelDir, 'decoder_model_merged.onnx.tmp.123'), '');

  assert.equal(hasPartialWhisperCache(cacheDir, 'tiny'), true);
});

test('resetWhisperCache removes the model cache directory', () => {
  const cacheDir = makeCacheRoot();
  const modelDir = ensureModelDir(cacheDir, 'tiny');
  fs.writeFileSync(path.join(modelDir, 'encoder_model.onnx'), '');

  resetWhisperCache(cacheDir, 'tiny');

  assert.equal(fs.existsSync(path.join(cacheDir, 'onnx-community', 'whisper-tiny_timestamped')), false);
});
