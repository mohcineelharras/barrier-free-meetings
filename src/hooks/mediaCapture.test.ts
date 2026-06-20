import assert from 'node:assert/strict';
import test from 'node:test';

import { getCaptureStream } from './mediaCapture';

function createStream(
  audioTracks: Array<Record<string, unknown>> = [{}],
  videoTracks: Array<Record<string, unknown>> = [{}],
) {
  return {
    getAudioTracks: () => audioTracks,
    getTracks: () => [...audioTracks, ...videoTracks].map((track) => ({
      stop() {},
      ...track,
    })),
    getVideoTracks: () => videoTracks,
  } as unknown as MediaStream;
}

test('getCaptureStream requests microphone input for mic mode', async () => {
  const calls: Array<{ kind: string; constraints: unknown }> = [];

  const stream = await getCaptureStream({
    audioSource: 'microphone',
    mediaDevices: {
      getDisplayMedia: async () => createStream(),
      getUserMedia: async (constraints) => {
        calls.push({ kind: 'user', constraints });
        return createStream();
      },
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { kind: 'user', constraints: { audio: true } });
  assert.equal(stream.getAudioTracks().length, 1);
});

test('getCaptureStream requests display capture without video for browser audio mode', async () => {
  const calls: Array<{ kind: string; constraints: unknown }> = [];

  const stream = await getCaptureStream({
    audioSource: 'system',
    mediaDevices: {
      getDisplayMedia: async (constraints) => {
        calls.push({ kind: 'display', constraints });
        return createStream([{}], []);
      },
      getUserMedia: async () => createStream(),
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    kind: 'display',
    constraints: { audio: true, video: false },
  });
  assert.equal(stream.getAudioTracks().length, 1);
});

test('getCaptureStream rejects browser audio mode when the shared display has no audio track', async () => {
  await assert.rejects(
    getCaptureStream({
      audioSource: 'system',
      mediaDevices: {
        getDisplayMedia: async () => createStream([], []),
        getUserMedia: async () => createStream(),
      },
    }),
    /No audio track found/i,
  );
});
