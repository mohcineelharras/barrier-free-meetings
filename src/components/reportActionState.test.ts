import assert from 'node:assert/strict';
import test from 'node:test';

import { getReportActionState } from './reportActionState';

test('getReportActionState hides the action without a backend-ready report flow', () => {
  const state = getReportActionState({
    translationAvailable: false,
    hasSegments: true,
    isRecording: false,
    hasReport: false,
    autoReportStatus: 'idle',
  });

  assert.equal(state.visible, false);
});

test('getReportActionState shows a passive generating state after recording stops', () => {
  const state = getReportActionState({
    translationAvailable: true,
    hasSegments: true,
    isRecording: false,
    hasReport: false,
    autoReportStatus: 'pending',
  });

  assert.equal(state.visible, true);
  assert.equal(state.label, 'Generating report…');
  assert.equal(state.disabled, true);
});

test('getReportActionState lets a saved report win over stale pending state', () => {
  const state = getReportActionState({
    translationAvailable: true,
    hasSegments: true,
    isRecording: false,
    hasReport: true,
    autoReportStatus: 'pending',
  });

  assert.equal(state.visible, true);
  assert.equal(state.label, 'View report');
  assert.equal(state.disabled, false);
});

test('getReportActionState turns into view report once a saved report exists', () => {
  const state = getReportActionState({
    translationAvailable: true,
    hasSegments: true,
    isRecording: false,
    hasReport: true,
    autoReportStatus: 'ready',
  });

  assert.equal(state.visible, true);
  assert.equal(state.label, 'View report');
  assert.equal(state.disabled, false);
});

test('getReportActionState keeps manual generation available as a fallback', () => {
  const state = getReportActionState({
    translationAvailable: true,
    hasSegments: true,
    isRecording: false,
    hasReport: false,
    autoReportStatus: 'idle',
  });

  assert.equal(state.visible, true);
  assert.equal(state.label, 'Generate report');
  assert.equal(state.disabled, false);
});

test('getReportActionState exposes retry after automatic generation fails', () => {
  const state = getReportActionState({
    translationAvailable: true,
    hasSegments: true,
    isRecording: false,
    hasReport: false,
    autoReportStatus: 'error',
  });

  assert.equal(state.visible, true);
  assert.equal(state.label, 'Retry report');
  assert.equal(state.disabled, false);
});

test('getReportActionState prioritizes active recording state over pending autoReportStatus', () => {
  const state = getReportActionState({
    translationAvailable: true,
    hasSegments: true,
    isRecording: true,
    hasReport: false,
    autoReportStatus: 'pending',
  });

  assert.equal(state.visible, true);
  assert.equal(state.label, 'Report after recording');
  assert.equal(state.disabled, true);
});

