import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attachReportToSession,
  createSavedSession,
  sessionHasCurrentReport,
  upsertSavedSession,
  type SavedSession,
} from './useHistory';
import { type TranscriptSegment } from './useSpeechToText';

const segment: TranscriptSegment = {
  id: 'segment-1',
  original: '你好',
  translated: 'Bonjour',
  timestamp: 1,
  isFinal: true,
};

test('createSavedSession captures auto-save metadata', () => {
  const session = createSavedSession({
    id: 'session-1',
    now: 10,
    segments: [segment],
    sourceLang: 'Chinese / Mandarin',
    targetLang: 'French',
    saveMode: 'auto',
  });

  assert.equal(session.id, 'session-1');
  assert.equal(session.saveMode, 'auto');
  assert.equal(session.report, undefined);
  assert.deepEqual(session.segments, [segment]);
});

test('upsertSavedSession updates the current conversation instead of duplicating it', () => {
  const previous: SavedSession = createSavedSession({
    id: 'session-1',
    now: 10,
    segments: [segment],
    sourceLang: 'Chinese / Mandarin',
    targetLang: 'French',
    saveMode: 'auto',
  });
  const nextSegment = { ...segment, id: 'segment-2', original: '谢谢' };
  const updated = upsertSavedSession([previous], {
    id: 'session-1',
    now: 20,
    segments: [segment, nextSegment],
    sourceLang: 'Chinese / Mandarin',
    targetLang: 'French',
    saveMode: 'auto',
  });

  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, 'session-1');
  assert.equal(updated[0].savedAt, 10);
  assert.equal(updated[0].updatedAt, 20);
  assert.deepEqual(updated[0].segments, [segment, nextSegment]);
});

test('attachReportToSession stores the generated report with the saved conversation', () => {
  const session = createSavedSession({
    id: 'session-1',
    now: 10,
    segments: [segment],
    sourceLang: 'Chinese / Mandarin',
    targetLang: 'French',
    saveMode: 'auto',
  });

  const updated = attachReportToSession([session], 'session-1', '## Summary\n- Bonjour', 30);

  assert.equal(updated[0].report, '## Summary\n- Bonjour');
  assert.equal(updated[0].reportGeneratedAt, 30);
  assert.equal(updated[0].updatedAt, 30);
});

test('sessionHasCurrentReport accepts preserved reports after autosave timestamp updates', () => {
  const session = createSavedSession({
    id: 'session-1',
    now: 10,
    segments: [segment],
    sourceLang: 'Chinese / Mandarin',
    targetLang: 'French',
    saveMode: 'auto',
    report: '## Summary\n- Bonjour',
    reportGeneratedAt: 20,
  });

  const autosaved = upsertSavedSession([session], {
    id: 'session-1',
    now: 30,
    segments: [segment],
    sourceLang: 'Chinese / Mandarin',
    targetLang: 'French',
    saveMode: 'auto',
  })[0];

  assert.equal(autosaved.updatedAt, 30);
  assert.equal(autosaved.reportGeneratedAt, 20);
  assert.equal(sessionHasCurrentReport(autosaved, [segment]), true);
});

test('sessionHasCurrentReport accepts reports when only translations changed later', () => {
  const session = createSavedSession({
    id: 'session-1',
    now: 10,
    segments: [segment],
    sourceLang: 'Chinese / Mandarin',
    targetLang: 'French',
    saveMode: 'auto',
    report: '## Summary\n- Bonjour',
    reportGeneratedAt: 20,
  });

  const changedSegment = { ...segment, translated: 'Salut' };

  assert.equal(sessionHasCurrentReport(session, [changedSegment]), true);
});

test('sessionHasCurrentReport rejects reports for different source transcript content', () => {
  const session = createSavedSession({
    id: 'session-1',
    now: 10,
    segments: [segment],
    sourceLang: 'Chinese / Mandarin',
    targetLang: 'French',
    saveMode: 'auto',
    report: '## Summary\n- Bonjour',
    reportGeneratedAt: 20,
  });

  const changedSegment = { ...segment, original: '谢谢' };

  assert.equal(sessionHasCurrentReport(session, [changedSegment]), false);
});
