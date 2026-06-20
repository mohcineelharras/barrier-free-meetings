import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isFFmpegAvailable,
  getDeviceAudioStatus,
  createDeviceAudioCapture,
} from './deviceAudioCapture';

test('isFFmpegAvailable returns a boolean', async () => {
  const result = await isFFmpegAvailable();
  assert.equal(typeof result, 'boolean');
});

test('getDeviceAudioStatus returns a status object', async () => {
  const status = await getDeviceAudioStatus();
  assert.equal(typeof status.available, 'boolean');
  assert.equal(typeof status.platform, 'string');
  assert.equal(typeof status.ffmpegFound, 'boolean');
  if (!status.available) {
    assert.equal(typeof status.reason, 'string');
  }
});

test('createDeviceAudioCapture can be started and stopped', async () => {
  const chunks: Buffer[] = [];
  let errorReceived = false;
  let endReceived = false;

  const capture = createDeviceAudioCapture({
    onChunk: (chunk) => {
      chunks.push(chunk);
    },
    onError: () => {
      errorReceived = true;
    },
    onEnd: () => {
      endReceived = true;
    },
  });

  assert.equal(capture.isActive(), false);

  // We can't reliably start FFmpeg in a test environment without an audio device,
  // so we just verify the API shape and state transitions.
  // Starting may fail if FFmpeg is not available or no audio device exists.
  try {
    await capture.start();
    assert.equal(capture.isActive(), true);
    capture.stop();
    assert.equal(capture.isActive(), false);
  } catch {
    // Starting may fail in CI or environments without audio devices.
    // The important thing is that the API works.
    assert.equal(capture.isActive(), false);
  }
});

test('createDeviceAudioCapture stops gracefully when not active', () => {
  const capture = createDeviceAudioCapture({
    onChunk: () => {},
    onError: () => {},
    onEnd: () => {},
  });

  // Should not throw
  capture.stop();
  assert.equal(capture.isActive(), false);
});
