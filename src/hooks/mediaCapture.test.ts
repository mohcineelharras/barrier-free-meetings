import assert from 'node:assert/strict';
import test from 'node:test';

import { getCaptureStream, resolveSystemAudioCapturePath } from './mediaCapture';

function createStream(
  audioTracks: Array<Record<string, unknown>> = [{}],
  videoTracks: Array<Record<string, unknown>> = [{}],
) {
  const stream = {
    getAudioTracks: () => audioTracks as unknown as MediaStreamTrack[],
    getTracks: () => [...audioTracks, ...videoTracks].map((track) => ({
      stop() {},
      ...track,
    })) as unknown as MediaStreamTrack[],
    getVideoTracks: () => videoTracks as unknown as MediaStreamTrack[],
    removeTrack(track: MediaStreamTrack) {
      const index = videoTracks.indexOf(track as unknown as Record<string, unknown>);
      if (index >= 0) {
        videoTracks.splice(index, 1);
      }
    },
  };
  return stream as unknown as MediaStream;
}

test('resolveSystemAudioCapturePath always uses browser display capture', () => {
  assert.equal(resolveSystemAudioCapturePath({ isLocalhost: true }), 'browser-display');
  assert.equal(resolveSystemAudioCapturePath({ isLocalhost: false }), 'browser-display');
});

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

test('getCaptureStream requests display capture with video for browser audio mode', async () => {
  const calls: Array<{ kind: string; constraints: unknown }> = [];
  const stopped: string[] = [];

  const stream = await getCaptureStream({
    audioSource: 'system',
    mediaDevices: {
      getDisplayMedia: async (constraints) => {
        calls.push({ kind: 'display', constraints });
        return createStream(
          [{}],
          [{
            stop() {
              stopped.push('video');
            },
          }],
        );
      },
      getUserMedia: async () => createStream(),
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    kind: 'display',
    constraints: { audio: true, video: true },
  });
  assert.equal(stream.getAudioTracks().length, 1);
  assert.deepEqual(stopped, ['video']);
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
