import assert from 'node:assert/strict';
import test from 'node:test';

import { hasAutoReportReadySegments, shouldQueueAutoReport } from './autoReportState';

test('shouldQueueAutoReport queues after recording stops even before segments arrive', () => {
  assert.equal(
    shouldQueueAutoReport({
      autoSaveEnabled: true,
      stoppedRecording: true,
      translationAvailable: true,
    }),
    true,
  );
});

test('shouldQueueAutoReport does not queue while autosave is disabled', () => {
  assert.equal(
    shouldQueueAutoReport({
      autoSaveEnabled: false,
      stoppedRecording: true,
      translationAvailable: true,
    }),
    false,
  );
});

test('hasAutoReportReadySegments waits for pending translations to settle', () => {
  assert.equal(
    hasAutoReportReadySegments([
      {
        id: 'segment-1',
        original: 'السلام عليكم',
        translated: '',
        timestamp: 1,
        isFinal: true,
      },
    ]),
    false,
  );
});

test('hasAutoReportReadySegments accepts translated segments once they are settled', () => {
  assert.equal(
    hasAutoReportReadySegments([
      {
        id: 'segment-1',
        original: 'السلام عليكم',
        translated: 'Bonjour',
        timestamp: 1,
        isFinal: true,
      },
    ]),
    true,
  );
});

test('hasAutoReportReadySegments accepts failed translations once they are marked', () => {
  assert.equal(
    hasAutoReportReadySegments([
      {
        id: 'segment-1',
        original: 'السلام عليكم',
        translated: '[Translation failed]',
        timestamp: 1,
        isFinal: true,
      },
    ]),
    true,
  );
});
