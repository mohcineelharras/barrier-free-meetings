import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCorsHeaders, getAllowedCorsOrigins } from './cors';

test('getAllowedCorsOrigins includes Capacitor and localhost defaults', () => {
  const origins = getAllowedCorsOrigins({});

  assert.deepEqual(origins.slice(0, 5), [
    'capacitor://localhost',
    'http://localhost',
    'https://localhost',
    'http://127.0.0.1',
    'https://127.0.0.1',
  ]);
});

test('getAllowedCorsOrigins merges configured origins without duplicates', () => {
  const origins = getAllowedCorsOrigins({
    CORS_ALLOWED_ORIGINS:
      'https://mobile.example.com, https://mobile.example.com , http://10.0.2.2:3000',
  });

  assert.ok(origins.includes('https://mobile.example.com'));
  assert.ok(origins.includes('http://10.0.2.2:3000'));
  assert.equal(
    origins.filter((origin) => origin === 'https://mobile.example.com').length,
    1,
  );
});

test('buildCorsHeaders only returns headers for allowed origins', () => {
  assert.equal(
    buildCorsHeaders('https://not-allowed.example.com', {
      CORS_ALLOWED_ORIGINS: 'https://mobile.example.com',
    }),
    null,
  );

  assert.deepEqual(
    buildCorsHeaders('https://mobile.example.com', {
      CORS_ALLOWED_ORIGINS: 'https://mobile.example.com',
    }),
    {
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Origin': 'https://mobile.example.com',
      Vary: 'Origin',
    },
  );
});

test('buildCorsHeaders allows the current Hugging Face Space origin in hosted mode', () => {
  assert.deepEqual(
    buildCorsHeaders('https://demo-user-barrier-free-meetings.hf.space', {
      HF_SPACES: 'true',
      SPACE_HOST: 'demo-user-barrier-free-meetings.hf.space',
    }),
    {
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Origin': 'https://demo-user-barrier-free-meetings.hf.space',
      Vary: 'Origin',
    },
  );
});
