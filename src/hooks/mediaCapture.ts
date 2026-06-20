interface MediaDevicesLike {
  getDisplayMedia?: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
  getUserMedia?: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
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

    const stream = await mediaDevices.getDisplayMedia({
      audio: true,
      video: false,
    });

    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(
        'No audio track found. Select a source and enable "Share audio" in the browser prompt.',
      );
    }

    stream.getVideoTracks().forEach((track) => track.stop());

    return stream;
  }

  if (!mediaDevices.getUserMedia) {
    throw new Error('Your browser does not support microphone access on this page.');
  }

  return mediaDevices.getUserMedia({ audio: true });
}
