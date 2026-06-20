import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getWhisperErrorDismissMs,
  INTERRUPTED_RECORDING_MESSAGE,
  isPersistentWhisperRecordingError,
  resolveWhisperRecordingError,
} from './whisperInterruption';

test('resolveWhisperRecordingError returns the interruption message for unexpected live-session disconnects', () => {
  const message = resolveWhisperRecordingError({
    fallbackMessage: 'WebSocket disconnected — recording stopped',
    isManualStop: false,
    serverMessage: null,
    serverStarted: true,
  });

  assert.equal(message, INTERRUPTED_RECORDING_MESSAGE);
});

test('resolveWhisperRecordingError preserves explicit server capacity messages', () => {
  const message = resolveWhisperRecordingError({
    fallbackMessage: 'WebSocket disconnected — recording stopped',
    isManualStop: false,
    serverMessage: 'Transcription capacity is full. Please retry in a moment.',
    serverStarted: true,
  });

  assert.equal(message, 'Transcription capacity is full. Please retry in a moment.');
});

test('resolveWhisperRecordingError returns the startup fallback before recording fully starts', () => {
  const message = resolveWhisperRecordingError({
    fallbackMessage: 'WebSocket connection failed',
    isManualStop: false,
    serverMessage: null,
    serverStarted: false,
  });

  assert.equal(message, 'WebSocket connection failed');
});

test('resolveWhisperRecordingError suppresses user-initiated stops', () => {
  const message = resolveWhisperRecordingError({
    fallbackMessage: 'WebSocket disconnected — recording stopped',
    isManualStop: true,
    serverMessage: null,
    serverStarted: true,
  });

  assert.equal(message, null);
});

test('isPersistentWhisperRecordingError only treats the interruption message as persistent', () => {
  assert.equal(isPersistentWhisperRecordingError(INTERRUPTED_RECORDING_MESSAGE), true);
  assert.equal(isPersistentWhisperRecordingError('Transcription capacity is full. Please retry in a moment.'), false);
  assert.equal(isPersistentWhisperRecordingError(null), false);
});

test('getWhisperErrorDismissMs keeps interruption messages visible until the user acts', () => {
  assert.equal(getWhisperErrorDismissMs(INTERRUPTED_RECORDING_MESSAGE), null);
  assert.equal(getWhisperErrorDismissMs('Transcription capacity is full. Please retry in a moment.'), 5000);
  assert.equal(getWhisperErrorDismissMs(null), 5000);
});
