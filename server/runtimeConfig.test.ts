import assert from 'node:assert/strict';
import test from 'node:test';

import { getServerRuntimeConfig, isOriginAllowed } from './runtimeConfig';

test('server runtime config includes mobile-friendly default CORS origins', () => {
  const config = getServerRuntimeConfig({});

  assert.deepEqual(config.corsAllowedOrigins, [
    'capacitor://localhost',
    'http://localhost',
    'https://localhost',
    'http://127.0.0.1',
    'https://127.0.0.1',
  ]);
});

test('server runtime config appends configured CORS origins', () => {
  const config = getServerRuntimeConfig({
    CORS_ALLOWED_ORIGINS: 'https://app.example.com, https://staging.example.com ',
  });

  assert.deepEqual(config.corsAllowedOrigins, [
    'capacitor://localhost',
    'http://localhost',
    'https://localhost',
    'http://127.0.0.1',
    'https://127.0.0.1',
    'https://app.example.com',
    'https://staging.example.com',
  ]);
});

test('isOriginAllowed supports the default mobile origins and explicit allow lists', () => {
  const origins = [
    'capacitor://localhost',
    'http://localhost',
    'https://app.example.com',
  ];

  assert.equal(isOriginAllowed('capacitor://localhost', origins), true);
  assert.equal(isOriginAllowed('https://app.example.com', origins), true);
  assert.equal(isOriginAllowed('https://evil.example.com', origins), false);
});

test('hosted Spaces runtime defaults to three active transcription sessions', () => {
  const config = getServerRuntimeConfig({
    HF_SPACES: 'true',
    NODE_ENV: 'production',
    PORT: '7860',
  });

  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 7860);
  assert.equal(config.transcription.maxActiveTranscriptions, 3);
  assert.equal(config.transcription.maxQueueSize, 3);
  assert.equal(config.transcription.maxWsConnections, 6);
});

test('hosted Spaces runtime still honors an explicit active transcription override', () => {
  const config = getServerRuntimeConfig({
    HF_SPACES: 'true',
    NODE_ENV: 'production',
    PORT: '7860',
    MAX_ACTIVE_TRANSCRIPTIONS: '4',
  });

  assert.equal(config.transcription.maxActiveTranscriptions, 4);
});
