import {
  MOBILE_BACKEND_CONFIG_MESSAGE,
  getClientRuntimeConfig,
  type ClientRuntimeConfig,
  type RuntimeWindowLike,
} from './runtime';

export interface TranscriptionSupport {
  canStartRecording: boolean;
  preferredLiveTranscriptionMode: 'web-speech' | 'whisper';
  recordingDisabledReason: string | null;
  supportsMicrophoneCapture: boolean;
  supportsOfflineMode: boolean;
  supportsRemoteWhisper: boolean;
  supportsSystemAudioCapture: boolean;
  supportsWebSpeechRecognition: boolean;
}

export type PreferredMicrophoneMode = 'web-speech' | 'whisper';

interface ResolveTranscriptionSupportOptions {
  hasAudioContext: boolean;
  hasAudioWorkletNode: boolean;
  hasConfiguredApiBaseUrl: boolean;
  hasDisplayMedia: boolean;
  hasGetUserMedia: boolean;
  isHostedDemo: boolean;
  hasSpeechRecognition: boolean;
  hasWebSocket: boolean;
  isNativeApp: boolean;
}

function getGlobalWindowLike(): RuntimeWindowLike | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window as unknown as RuntimeWindowLike;
}

export function resolveTranscriptionSupport({
  hasAudioContext,
  hasAudioWorkletNode,
  hasConfiguredApiBaseUrl,
  hasDisplayMedia,
  hasGetUserMedia,
  isHostedDemo,
  hasSpeechRecognition,
  hasWebSocket,
  isNativeApp,
}: ResolveTranscriptionSupportOptions): TranscriptionSupport {
  const supportsRemoteWhisper =
    hasConfiguredApiBaseUrl &&
    hasWebSocket &&
    hasAudioContext &&
    hasAudioWorkletNode;
  const supportsMicrophoneCapture = hasGetUserMedia;
  const supportsOfflineMode = !isNativeApp && !isHostedDemo && supportsRemoteWhisper;
  const supportsSystemAudioCapture = !isNativeApp && supportsRemoteWhisper;
  const supportsWebSpeechRecognition = !isNativeApp && hasSpeechRecognition && supportsMicrophoneCapture;
  const canStartRecording =
    (supportsMicrophoneCapture && (supportsRemoteWhisper || supportsWebSpeechRecognition)) ||
    supportsSystemAudioCapture;

  let recordingDisabledReason: string | null = null;
  if (!canStartRecording && !supportsMicrophoneCapture) {
    recordingDisabledReason = 'Microphone capture is not available in this browser or webview.';
  } else if (!canStartRecording && !supportsRemoteWhisper && !supportsWebSpeechRecognition) {
    recordingDisabledReason =
      isNativeApp && !hasConfiguredApiBaseUrl
        ? MOBILE_BACKEND_CONFIG_MESSAGE
        : 'No reliable live transcription path is available on this device.';
  }

  return {
    canStartRecording,
    preferredLiveTranscriptionMode: supportsWebSpeechRecognition ? 'web-speech' : 'whisper',
    recordingDisabledReason,
    supportsMicrophoneCapture,
    supportsOfflineMode,
    supportsRemoteWhisper,
    supportsSystemAudioCapture,
    supportsWebSpeechRecognition,
  };
}

export function resolveRecordingMode({
  audioSource,
  isOffline,
  preferredMicrophoneMode,
  support,
}: {
  audioSource: 'microphone' | 'system';
  isOffline: boolean;
  preferredMicrophoneMode?: PreferredMicrophoneMode;
  support: TranscriptionSupport;
}): 'web-speech' | 'whisper' {
  if (audioSource === 'system' || isOffline) {
    return 'whisper';
  }

  if (preferredMicrophoneMode === 'whisper' && support.supportsRemoteWhisper) {
    return 'whisper';
  }

  if (preferredMicrophoneMode === 'web-speech' && support.supportsWebSpeechRecognition) {
    return 'web-speech';
  }

  return support.preferredLiveTranscriptionMode;
}

export function detectTranscriptionSupport(
  runtime: ClientRuntimeConfig = getClientRuntimeConfig(),
  windowLike: RuntimeWindowLike = getGlobalWindowLike() ?? {},
): TranscriptionSupport {
  const mediaDevices = windowLike.navigator?.mediaDevices;

  return resolveTranscriptionSupport({
    hasAudioContext:
      typeof windowLike.AudioContext === 'function' ||
      typeof windowLike.webkitAudioContext === 'function',
    hasAudioWorkletNode: typeof windowLike.AudioWorkletNode === 'function',
    hasConfiguredApiBaseUrl: runtime.hasReachableBackend,
    hasDisplayMedia: typeof mediaDevices?.getDisplayMedia === 'function',
    hasGetUserMedia: typeof mediaDevices?.getUserMedia === 'function',
    isHostedDemo: runtime.isHostedDemo,
    hasSpeechRecognition:
      typeof windowLike.SpeechRecognition === 'function' ||
      typeof windowLike.webkitSpeechRecognition === 'function',
    hasWebSocket:
      typeof windowLike.WebSocket === 'function' || typeof WebSocket === 'function',
    isNativeApp: runtime.isNativeApp,
  });
}

export function resolveRuntimeTranscriptionSupport(
  runtime: ClientRuntimeConfig = getClientRuntimeConfig(),
  windowLike: RuntimeWindowLike = getGlobalWindowLike() ?? {},
): TranscriptionSupport {
  return detectTranscriptionSupport(runtime, windowLike);
}
