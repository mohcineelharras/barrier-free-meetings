import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSecurityHeaders } from './securityHeaders';

test('security headers keep API keys out of referrers and block framing outside the hosted demo', () => {
  const headers = buildSecurityHeaders({ isProduction: false, isHostedDemo: false });

  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
  assert.equal(headers['X-Frame-Options'], 'SAMEORIGIN');
  assert.match(headers['Permissions-Policy'], /microphone=\(self\)/);
  assert.equal(headers['Content-Security-Policy'], undefined);
});

test('production CSP stays same-origin and the hosted demo can be embedded by Hugging Face', () => {
  const production = buildSecurityHeaders({ isProduction: true, isHostedDemo: false });
  const hosted = buildSecurityHeaders({ isProduction: true, isHostedDemo: true });

  assert.match(production['Content-Security-Policy'], /default-src 'self'/);
  assert.match(production['Content-Security-Policy'], /frame-ancestors 'self'/);
  assert.equal(hosted['X-Frame-Options'], undefined);
  assert.match(hosted['Content-Security-Policy'], /https:\/\/huggingface\.co/);
});
