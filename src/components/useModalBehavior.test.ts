import assert from 'node:assert/strict';
import test from 'node:test';

import { nextFocusIndex } from './useModalBehavior';

test('modal tab wrap moves from the last control to the first and back', () => {
  assert.equal(nextFocusIndex(2, 3, false), 0);
  assert.equal(nextFocusIndex(0, 3, true), 2);
  assert.equal(nextFocusIndex(-1, 3, false), 0);
  assert.equal(nextFocusIndex(1, 3, false), 2);
});
