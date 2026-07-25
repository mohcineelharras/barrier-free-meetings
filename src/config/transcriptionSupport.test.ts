import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveRecordingMode, resolveTranscriptionSupport } from './transcriptionSupport';

test('native builds prefer remote whisper and disable device audio plus offline mode', () => {
  const support = resolveTranscriptionSupport({
    hasAudioContext: true,
    hasAudioWorkletNode: true,
    hasConfiguredApiBaseUrl: true,
    hasDisplayMedia: true,
    hasGetUserMedia: true,
    isHostedDemo: false,
    isLocalhost: false,
    hasSpeechRecognition: true,
    hasWebSocket: true,
    isNativeApp: true,
  });

  assert.equal(support.supportsOfflineMode, false);
  assert.equal(support.supportsSystemAudioCapture, false);
  assert.equal(support.supportsWebSpeechRecognition, false);
  assert.equal(support.supportsRemoteWhisper, true);
  assert.equal(
    resolveRecordingMode({
      audioSource: 'microphone',
      isOffline: false,
      support,
    }),
    'whisper',
  );
});

test('browser builds keep current feature set when browser APIs are available', () => {
  const support = resolveTranscriptionSupport({
    hasAudioContext: true,
    hasAudioWorkletNode: true,
    hasConfiguredApiBaseUrl: true,
    hasDisplayMedia: true,
    hasGetUserMedia: true,
    isHostedDemo: false,
    isLocalhost: true,
    hasSpeechRecognition: true,
    hasWebSocket: true,
    isNativeApp: false,
  });

  assert.equal(support.supportsOfflineMode, true);
  assert.equal(support.supportsSystemAudioCapture, true);
  assert.equal(support.supportsWebSpeechRecognition, true);
  assert.equal(support.supportsRemoteWhisper, true);
  assert.equal(
    resolveRecordingMode({
      audioSource: 'microphone',
      isOffline: false,
      support,
    }),
    'web-speech',
  );
});

test('browser system audio capture does not require microphone APIs', () => {
  const support = resolveTranscriptionSupport({
    hasAudioContext: true,
    hasAudioWorkletNode: true,
    hasConfiguredApiBaseUrl: true,
    hasDisplayMedia: true,
    hasGetUserMedia: false,
    isHostedDemo: false,
    isLocalhost: false,
    hasSpeechRecognition: false,
    hasWebSocket: true,
    isNativeApp: false,
  });

  assert.equal(support.supportsMicrophoneCapture, false);
  assert.equal(support.supportsRemoteWhisper, true);
  assert.equal(support.supportsSystemAudioCapture, true);
  assert.equal(support.canStartRecording, true);
  assert.equal(support.recordingDisabledReason, null);
});

test('transcription support reports when no reliable live path is available', () => {
  const support = resolveTranscriptionSupport({
    hasAudioContext: false,
    hasAudioWorkletNode: false,
    hasConfiguredApiBaseUrl: false,
    hasDisplayMedia: false,
    hasGetUserMedia: false,
    isHostedDemo: false,
    isLocalhost: false,
    hasSpeechRecognition: false,
    hasWebSocket: false,
    isNativeApp: true,
  });

  assert.equal(support.supportsRemoteWhisper, false);
  assert.equal(support.supportsMicrophoneCapture, false);
  assert.equal(support.canStartRecording, false);
  assert.match(support.recordingDisabledReason ?? '', /microphone/i);
});

test('hosted demos use browser speech only and never expose whisper STT', () => {
  const support = resolveTranscriptionSupport({
    hasAudioContext: true,
    hasAudioWorkletNode: true,
    hasConfiguredApiBaseUrl: true,
    hasDisplayMedia: true,
    hasGetUserMedia: true,
    isHostedDemo: true,
    isLocalhost: false,
    hasSpeechRecognition: true,
    hasWebSocket: true,
    isNativeApp: false,
  });

  assert.equal(support.supportsOfflineMode, false);
  assert.equal(support.supportsRemoteWhisper, false);
  assert.equal(support.supportsSystemAudioCapture, false);
  assert.equal(support.supportsWebSpeechRecognition, true);
  assert.equal(support.canStartRecording, true);
  assert.equal(
    resolveRecordingMode({
      audioSource: 'microphone',
      isOffline: false,
      preferredMicrophoneMode: 'whisper',
      support,
    }),
    'web-speech',
  );
  assert.equal(
    resolveRecordingMode({
      audioSource: 'system',
      isOffline: false,
      support,
    }),
    'web-speech',
  );
});

test('hosted demos without browser speech cannot fall back to whisper', () => {
  const support = resolveTranscriptionSupport({
    hasAudioContext: true,
    hasAudioWorkletNode: true,
    hasConfiguredApiBaseUrl: true,
    hasDisplayMedia: true,
    hasGetUserMedia: true,
    isHostedDemo: true,
    isLocalhost: false,
    hasSpeechRecognition: false,
    hasWebSocket: true,
    isNativeApp: false,
  });

  assert.equal(support.supportsRemoteWhisper, false);
  assert.equal(support.canStartRecording, false);
  assert.match(support.recordingDisabledReason ?? '', /browser speech/i);
});

test('localhost without display media cannot use browser audio capture', () => {
  const support = resolveTranscriptionSupport({
    hasAudioContext: true,
    hasAudioWorkletNode: true,
    hasConfiguredApiBaseUrl: true,
    hasDisplayMedia: false,
    hasGetUserMedia: true,
    isHostedDemo: false,
    isLocalhost: true,
    hasSpeechRecognition: true,
    hasWebSocket: true,
    isNativeApp: false,
  });

  assert.equal(support.supportsSystemAudioCapture, false);
});

test('non-hosted system audio records with whisper', () => {
  const support = resolveTranscriptionSupport({
    hasAudioContext: true,
    hasAudioWorkletNode: true,
    hasConfiguredApiBaseUrl: true,
    hasDisplayMedia: true,
    hasGetUserMedia: true,
    isHostedDemo: false,
    isLocalhost: false,
    hasSpeechRecognition: true,
    hasWebSocket: true,
    isNativeApp: false,
  });

  assert.equal(
    resolveRecordingMode({
      audioSource: 'system',
      isOffline: false,
      preferredMicrophoneMode: 'web-speech',
      support,
    }),
    'whisper',
  );
});
