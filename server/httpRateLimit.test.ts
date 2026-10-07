import assert from 'node:assert/strict';
import test from 'node:test';

import { createRateLimiter } from './httpRateLimit';

test('rate limiter blocks the request that exceeds the window and reports retry time', () => {
  const take = createRateLimiter({ windowMs: 10_000, max: 2 });

  assert.equal(take('127.0.0.1', 1_000).allowed, true);
  assert.equal(take('127.0.0.1', 1_500).allowed, true);
  const blocked = take('127.0.0.1', 2_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 9);
  assert.equal(take('10.0.0.8', 2_000).allowed, true);
});

test('rate limiter allows a key again after the window expires', () => {
  const take = createRateLimiter({ windowMs: 1_000, max: 1 });

  assert.equal(take('127.0.0.1', 0).allowed, true);
  assert.equal(take('127.0.0.1', 500).allowed, false);
  assert.equal(take('127.0.0.1', 1_000).allowed, true);
});
