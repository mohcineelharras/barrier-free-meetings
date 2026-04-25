import test from "node:test";
import assert from "node:assert/strict";

import {
  createSpeechRecognitionController,
  type SpeechRecognitionLike,
  type SpeechRecognitionResultLike,
} from "./speechRecognitionController";

class FakeSpeechRecognition implements SpeechRecognitionLike {
  continuous = false;
  interimResults = false;
  lang = "";
  onstart: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onresult: ((event: SpeechRecognitionResultLike) => void) | null = null;
  startCalls = 0;
  stopCalls = 0;

  start() {
    this.startCalls += 1;
  }

  stop() {
    this.stopCalls += 1;
  }

  emitStart() {
    this.onstart?.();
  }

  emitEnd() {
    this.onend?.();
  }

  emitResult(event: SpeechRecognitionResultLike) {
    this.onresult?.(event);
  }
}

test("controller restarts recognition when capture ends unexpectedly", () => {
  const recognition = new FakeSpeechRecognition();
  const finalized: Array<{ text: string; id: string }> = [];

  const controller = createSpeechRecognitionController({
    recognition,
    onSegmentFinalized: (text, id) => finalized.push({ text, id }),
    generateId: () => "segment-1",
  });

  controller.startRecording();
  recognition.emitStart();
  recognition.emitEnd();

  assert.equal(recognition.startCalls, 2);
  assert.equal(controller.getSnapshot().isRecording, true);
  assert.deepEqual(finalized, []);
});

test("controller stops restarting after manual stop", () => {
  const recognition = new FakeSpeechRecognition();

  const controller = createSpeechRecognitionController({
    recognition,
    onSegmentFinalized: () => {},
  });

  controller.startRecording();
  recognition.emitStart();
  controller.stopRecording();
  recognition.emitEnd();

  assert.equal(recognition.startCalls, 1);
  assert.equal(recognition.stopCalls, 1);
  assert.equal(controller.getSnapshot().isRecording, false);
});

test("controller forwards final transcripts and interim text", () => {
  const recognition = new FakeSpeechRecognition();
  const finalized: Array<{ text: string; id: string }> = [];

  const controller = createSpeechRecognitionController({
    recognition,
    onSegmentFinalized: (text, id) => finalized.push({ text, id }),
    generateId: () => "segment-42",
  });

  recognition.emitResult({
    resultIndex: 0,
    results: [
      { isFinal: false, 0: { transcript: "你" }, length: 1 },
      { isFinal: true, 0: { transcript: "你好" }, length: 1 },
    ],
  });

  assert.deepEqual(finalized, [{ text: "你好", id: "segment-42" }]);
  assert.equal(controller.getSnapshot().interimTranscript, "你");
});
