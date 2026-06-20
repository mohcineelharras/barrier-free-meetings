import assert from 'node:assert/strict';
import test from 'node:test';

import { getWhisperModelName, setWhisperModel } from './whisper';

test('setWhisperModel is awaitable so setup state cannot outrun model switching', async () => {
  const previousModel = getWhisperModelName();

  try {
    const switchPromise = setWhisperModel(previousModel === 'tiny' ? 'medium' : 'tiny');

    assert.equal(typeof switchPromise?.then, 'function');
    await switchPromise;
    assert.equal(getWhisperModelName(), previousModel === 'tiny' ? 'medium' : 'tiny');
  } finally {
    await setWhisperModel(previousModel);
  }
});
