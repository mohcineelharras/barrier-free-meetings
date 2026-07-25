import type { RuntimeConfig } from '../config/runtime';

interface MediaDevicesLike {
  getDisplayMedia?: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
  getUserMedia?: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
}

export type SystemAudioCapturePath = 'server-device' | 'browser-display';

export function resolveSystemAudioCapturePath(
  runtime: Pick<RuntimeConfig, 'isLocalhost'>,
): SystemAudioCapturePath {
  return runtime.isLocalhost ? 'server-device' : 'browser-display';
}

export async function getCaptureStream({
  audioSource,
  mediaDevices,
}: {
  audioSource: 'microphone' | 'system';
  mediaDevices: MediaDevicesLike;
}): Promise<MediaStream> {
  if (audioSource === 'system') {
    if (!mediaDevices.getDisplayMedia) {
      throw new Error('System audio capture is not supported in this browser or webview.');
    }

    // Chromium often rejects audio-only getDisplayMedia; request video then discard it.
    const stream = await mediaDevices.getDisplayMedia({
      audio: true,
      video: true,
    });

    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(
        'No audio track found. Select a source and enable "Share audio" in the browser prompt.',
      );
    }

    stream.getVideoTracks().forEach((track) => {
      track.stop();
      stream.removeTrack(track);
    });

    return stream;
  }

  if (!mediaDevices.getUserMedia) {
    throw new Error('Your browser does not support microphone access on this page.');
  }

  return mediaDevices.getUserMedia({ audio: true });
}
