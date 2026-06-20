import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyWhisperSocketMessage,
  type WhisperSocketClientState,
} from './whisperSocketProtocol';

test('whisper socket protocol keeps partial text in place until a final commit arrives', () => {
  const initial: WhisperSocketClientState = {
    error: null,
    interimTranscript: '',
  };

  const partial = applyWhisperSocketMessage(initial, { text: 'draft sentence', type: 'partial' }, () => 'seg-1');
  assert.deepEqual(partial, {
    commit: null,
    nextState: {
      error: null,
      interimTranscript: 'draft sentence',
    },
    stopped: false,
  });

  const final = applyWhisperSocketMessage(
    partial.nextState,
    { text: 'final sentence', type: 'final' },
    () => 'seg-2',
  );
  assert.deepEqual(final, {
    commit: {
      id: 'seg-2',
      text: 'final sentence',
    },
    nextState: {
      error: null,
      interimTranscript: '',
    },
    stopped: false,
  });
});

test('whisper socket protocol clears interim text on stop and exposes actionable errors', () => {
  const withDraft: WhisperSocketClientState = {
    error: null,
    interimTranscript: 'still speaking',
  };

  const errored = applyWhisperSocketMessage(
    withDraft,
    { message: 'Offline transcription failed: worker crashed', type: 'error' },
    () => 'seg-1',
  );

  assert.deepEqual(errored, {
    commit: null,
    nextState: {
      error: 'Offline transcription failed: worker crashed',
      interimTranscript: 'still speaking',
    },
    stopped: false,
  });

  const stopped = applyWhisperSocketMessage(
    errored.nextState,
    { type: 'stopped' },
    () => 'seg-2',
  );

  assert.deepEqual(stopped, {
    commit: null,
    nextState: {
      error: 'Offline transcription failed: worker crashed',
      interimTranscript: '',
    },
    stopped: true,
  });
});

test('whisper socket protocol surfaces queue and overload control messages without committing text', () => {
  const initial: WhisperSocketClientState = {
    error: null,
    interimTranscript: '',
  };

  const queued = applyWhisperSocketMessage(
    initial,
    {
      message: 'Transcription capacity is full. You are queued and recording will start automatically.',
      type: 'queued',
    },
    () => 'seg-1',
  );

  assert.deepEqual(queued, {
    commit: null,
    nextState: {
      error: null,
      interimTranscript: 'Transcription capacity is full. You are queued and recording will start automatically.',
    },
    stopped: false,
  });

  const started = applyWhisperSocketMessage(
    queued.nextState,
    { type: 'started' },
    () => 'seg-2',
  );

  assert.deepEqual(started, {
    commit: null,
    nextState: {
      error: null,
      interimTranscript: '',
    },
    stopped: false,
  });

  const busy = applyWhisperSocketMessage(
    started.nextState,
    {
      message: 'Transcription capacity is full. Please retry in a moment.',
      type: 'busy',
    },
    () => 'seg-3',
  );

  assert.deepEqual(busy, {
    commit: null,
    nextState: {
      error: 'Transcription capacity is full. Please retry in a moment.',
      interimTranscript: '',
    },
    stopped: false,
  });
});
