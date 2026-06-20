import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildApiUrl,
  buildWebSocketUrl,
  normalizeBackendUrl,
  resolveMobileCapabilities,
} from './runtime';

test('normalizeBackendUrl trims trailing api path and slash noise', () => {
  assert.equal(normalizeBackendUrl(' https://api.example.com/api/ '), 'https://api.example.com');
  assert.equal(normalizeBackendUrl(''), '');
});

test('buildApiUrl preserves same-origin defaults and supports remote backends', () => {
  assert.equal(
    buildApiUrl('/api/translate', {
      apiBaseUrl: '',
      isNativeApp: false,
      wsBaseUrl: '',
    }),
    '/api/translate',
  );
  assert.equal(
    buildApiUrl('/api/translate', {
      apiBaseUrl: 'https://api.example.com',
      isNativeApp: true,
      wsBaseUrl: '',
    }),
    'https://api.example.com/api/translate',
  );
});

test('buildWebSocketUrl derives a websocket origin from the configured backend', () => {
  assert.equal(
    buildWebSocketUrl('/ws/transcribe', {
      apiBaseUrl: 'https://api.example.com',
      isNativeApp: true,
      wsBaseUrl: '',
    }),
    'wss://api.example.com/ws/transcribe',
  );

  assert.equal(
    buildWebSocketUrl('/ws/transcribe', {
      apiBaseUrl: '',
      isNativeApp: true,
      wsBaseUrl: 'ws://stream.example.test',
    }),
    'ws://stream.example.test/ws/transcribe',
  );
});

test('resolveMobileCapabilities keeps only mobile-safe features on native shells', () => {
  assert.deepEqual(
    resolveMobileCapabilities({ isHostedDemo: false, isNativeApp: true }),
    {
      defaultAudioSource: 'microphone',
      defaultTranscriptionMode: 'web-speech',
      supportsBackendOverride: true,
      supportsOfflineMode: false,
      supportsSystemAudio: false,
    },
  );

  assert.deepEqual(
    resolveMobileCapabilities({ isHostedDemo: false, isNativeApp: false }),
    {
      defaultAudioSource: 'microphone',
      defaultTranscriptionMode: 'web-speech',
      supportsBackendOverride: true,
      supportsOfflineMode: true,
      supportsSystemAudio: true,
    },
  );

  assert.deepEqual(
    resolveMobileCapabilities({ isHostedDemo: true, isNativeApp: false }),
    {
      defaultAudioSource: 'microphone',
      defaultTranscriptionMode: 'web-speech',
      supportsBackendOverride: true,
      supportsOfflineMode: false,
      supportsSystemAudio: true,
    },
  );
});
