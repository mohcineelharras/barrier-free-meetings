import assert from 'node:assert/strict';
import test from 'node:test';

import { createTranscriptAssembler, type TimestampedChunk } from './transcriptAssembler';

function chunk(text: string, startMs: number, endMs: number): TimestampedChunk {
  return { text, startMs, endMs };
}

test('transcript assembler keeps a continuous sentence in the partial buffer until a boundary is detected', () => {
  const assembler = createTranscriptAssembler({ unstableTailMs: 300 });

  const first = assembler.applyWindow({
    audioDurationMs: 1_000,
    chunks: [
      chunk('hello', 0, 250),
      chunk('world', 250, 680),
      chunk('again', 680, 920),
    ],
  });

  assert.deepEqual(first, {
    finals: [],
    partial: 'hello world again',
  });

  const second = assembler.applyWindow({
    audioDurationMs: 1_500,
    chunks: [
      chunk('hello', 0, 250),
      chunk('world', 250, 680),
      chunk('again', 680, 920),
      chunk('friend', 920, 1_180),
      chunk('today', 1_180, 1_380),
    ],
  });

  assert.deepEqual(second, {
    finals: [],
    partial: 'hello world again friend today',
  });
});

test('transcript assembler finalizes a whole sentence once a pause makes the sentence stable', () => {
  const assembler = createTranscriptAssembler({ unstableTailMs: 300 });

  const drafting = assembler.applyWindow({
    audioDurationMs: 1_100,
    chunks: [
      chunk('hello', 0, 250),
      chunk('world', 250, 680),
      chunk('again', 680, 920),
    ],
  });

  assert.deepEqual(drafting, {
    finals: [],
    partial: 'hello world again',
  });

  const settled = assembler.applyWindow({
    audioDurationMs: 1_900,
    chunks: [
      chunk('hello', 0, 250),
      chunk('world', 250, 680),
      chunk('again', 680, 920),
    ],
  });

  assert.deepEqual(settled, {
    finals: ['hello world again'],
    partial: '',
  });
});

test('transcript assembler finalizes at punctuation and keeps the next sentence as the partial', () => {
  const assembler = createTranscriptAssembler({ unstableTailMs: 300 });

  const window = assembler.applyWindow({
    audioDurationMs: 1_600,
    chunks: [
      chunk('Hello', 0, 180),
      chunk('world.', 180, 520),
      chunk('How', 520, 760),
      chunk('are', 760, 940),
      chunk('you', 940, 1_220),
      chunk('today', 1_220, 1_460),
    ],
  });

  assert.deepEqual(window, {
    finals: ['Hello world.'],
    partial: 'How are you today',
  });
});

test('transcript assembler finalizes long stable speech even without punctuation or silence', () => {
  const assembler = createTranscriptAssembler({
    maxSegmentDurationMs: 1_000,
    unstableTailMs: 300,
  });

  const window = assembler.applyWindow({
    audioDurationMs: 1_800,
    chunks: [
      chunk('one', 0, 240),
      chunk('two', 240, 480),
      chunk('three', 480, 760),
      chunk('four', 760, 1_040),
      chunk('five', 1_040, 1_340),
      chunk('six', 1_340, 1_640),
    ],
  });

  assert.deepEqual(window, {
    finals: ['one two three four five'],
    partial: 'six',
  });
});

test('transcript assembler finalizes long stable text before it can exceed translation limits', () => {
  const assembler = createTranscriptAssembler({
    maxSegmentChars: 24,
    unstableTailMs: 300,
  });

  const window = assembler.applyWindow({
    audioDurationMs: 1_600,
    chunks: [
      chunk('alpha', 0, 220),
      chunk('bravo', 220, 440),
      chunk('charlie', 440, 700),
      chunk('delta', 700, 980),
      chunk('echo', 980, 1_260),
      chunk('foxtrot', 1_260, 1_480),
    ],
  });

  assert.deepEqual(window, {
    finals: ['alpha bravo charlie delta'],
    partial: 'echo foxtrot',
  });
});

test('transcript assembler suppresses duplicate partial text and flushes the remaining tail on finalize', () => {
  const assembler = createTranscriptAssembler({ unstableTailMs: 400 });

  const initial = assembler.applyWindow({
    audioDurationMs: 900,
    chunks: [chunk('draft', 0, 850)],
  });

  assert.deepEqual(initial, {
    finals: [],
    partial: 'draft',
  });

  const duplicate = assembler.applyWindow({
    audioDurationMs: 950,
    chunks: [chunk('draft', 0, 850)],
  });

  assert.deepEqual(duplicate, {
    finals: [],
    partial: null,
  });

  const flushed = assembler.finalize();

  assert.deepEqual(flushed, {
    finals: ['draft'],
    partial: '',
  });
});

test('transcript assembler reset clears committed progress and pending partial state', () => {
  const assembler = createTranscriptAssembler({ unstableTailMs: 250 });

  assembler.applyWindow({
    audioDurationMs: 1_000,
    chunks: [
      chunk('one', 0, 300),
      chunk('two', 300, 700),
      chunk('three', 700, 960),
    ],
  });

  assembler.reset();

  const replay = assembler.applyWindow({
    audioDurationMs: 800,
    chunks: [
      chunk('fresh', 0, 350),
      chunk('start', 350, 760),
    ],
  });

  assert.deepEqual(replay, {
    finals: [],
    partial: 'fresh start',
  });
});
