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

  emitError(error: string) {
    this.onerror?.({ error });
  }

  emitResult(event: SpeechRecognitionResultLike) {
    this.onresult?.(event);
  }
}

test("controller restarts recognition when capture ends unexpectedly", async () => {
  const recognition = new FakeSpeechRecognition();
  const finalized: Array<{ text: string; id: string; confidence: number }> = [];

  const controller = createSpeechRecognitionController({
    recognition,
    onSegmentFinalized: (text, id, confidence) => finalized.push({ text, id, confidence }),
    generateId: () => "segment-1",
  });

  controller.startRecording();
  recognition.emitStart();
  recognition.emitEnd();

  // Restart uses exponential backoff (300ms base), so wait for it
  await new Promise((resolve) => setTimeout(resolve, 400));

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

test("controller shows final transcripts as interim text until the endpointing pause", async () => {
  const recognition = new FakeSpeechRecognition();
  const finalized: Array<{ text: string; id: string; confidence: number }> = [];

  const controller = createSpeechRecognitionController({
    recognition,
    onSegmentFinalized: (text, id, confidence) => finalized.push({ text, id, confidence }),
    generateId: () => "segment-42",
    finalCommitDelayMs: 10,
  });

  recognition.emitResult({
    resultIndex: 0,
    results: [
      { isFinal: false, 0: { transcript: "你", confidence: 0.5 }, length: 1 },
      { isFinal: true, 0: { transcript: "你好", confidence: 0.95 }, length: 1 },
    ],
  });

  assert.deepEqual(finalized, []);
  assert.equal(controller.getSnapshot().interimTranscript, "你好");

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(finalized, [{ text: "你好", id: "segment-42", confidence: 0.95 }]);
  assert.equal(controller.getSnapshot().interimTranscript, "");
});

test("controller coalesces mobile-style expanding final chunks before committing", async () => {
  const recognition = new FakeSpeechRecognition();
  const finalized: Array<{ text: string; id: string; confidence: number }> = [];
  let id = 0;

  const controller = createSpeechRecognitionController({
    recognition,
    onSegmentFinalized: (text, segmentId, confidence) => finalized.push({ text, id: segmentId, confidence }),
    generateId: () => `segment-${id++}`,
    finalCommitDelayMs: 10,
  });

  recognition.emitResult({
    resultIndex: 0,
    results: [{ isFinal: true, 0: { transcript: "انا", confidence: 0.9 }, length: 1 }],
  });
  recognition.emitResult({
    resultIndex: 0,
    results: [{ isFinal: true, 0: { transcript: "انا لا", confidence: 0.9 }, length: 1 }],
  });
  recognition.emitResult({
    resultIndex: 0,
    results: [{ isFinal: true, 0: { transcript: "انا لا اعلم", confidence: 0.9 }, length: 1 }],
  });

  assert.deepEqual(finalized, []);
  assert.equal(controller.getSnapshot().interimTranscript, "انا لا اعلم");

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(finalized, [{ text: "انا لا اعلم", id: "segment-0", confidence: 0.9 }]);
  assert.equal(controller.getSnapshot().interimTranscript, "");
});

test("controller does not re-emit committed words when a later utterance grows across separate commits", async () => {
  const recognition = new FakeSpeechRecognition();
  const finalized: Array<{ text: string; id: string; confidence: number }> = [];
  let id = 0;

  const controller = createSpeechRecognitionController({
    recognition,
    onSegmentFinalized: (text, segmentId, confidence) => finalized.push({ text, id: segmentId, confidence }),
    generateId: () => `segment-${id++}`,
    finalCommitDelayMs: 10,
  });

  controller.startRecording();
  recognition.emitStart();

  // First utterance commits and pollutes committedTranscript.
  recognition.emitResult({
    resultIndex: 0,
    results: [{ isFinal: true, 0: { transcript: "alpha beta", confidence: 0.9 }, length: 1 }],
  });
  await new Promise((resolve) => setTimeout(resolve, 20));

  // Second utterance grows across separate commits (browser re-delivers the
  // same result entry with more words, each landing after a final commit).
  recognition.emitResult({
    resultIndex: 0,
    results: [{ isFinal: true, 0: { transcript: "gamma delta", confidence: 0.9 }, length: 1 }],
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  recognition.emitResult({
    resultIndex: 0,
    results: [{ isFinal: true, 0: { transcript: "gamma delta epsilon", confidence: 0.9 }, length: 1 }],
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  recognition.emitResult({
    resultIndex: 0,
    results: [{ isFinal: true, 0: { transcript: "gamma delta epsilon zeta", confidence: 0.9 }, length: 1 }],
  });
  await new Promise((resolve) => setTimeout(resolve, 20));

  // Each word should appear exactly once across all committed segments —
  // no duplicated "gamma delta" prefixes.
  const combined = finalized.map((f) => f.text).join(" ");
  assert.equal(combined, "alpha beta gamma delta epsilon zeta");

  controller.dispose();
});

test("controller force-commits long interim speech when browser endpointing does not arrive", async () => {
  const recognition = new FakeSpeechRecognition();
  const finalized: Array<{ text: string; id: string; confidence: number }> = [];

  const controller = createSpeechRecognitionController({
    recognition,
    onSegmentFinalized: (text, id, confidence) => finalized.push({ text, id, confidence }),
    generateId: () => "segment-1",
    finalCommitDelayMs: 1_000,
    maxInterimCommitDelayMs: 10,
    maxInterimChars: 18,
  });

  recognition.emitResult({
    resultIndex: 0,
    results: [{ isFinal: false, 0: { transcript: "alpha bravo charlie delta", confidence: 0 }, length: 1 }],
  });

  assert.deepEqual(finalized, []);
  assert.equal(controller.getSnapshot().interimTranscript, "alpha bravo charlie delta");

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(finalized, [{ text: "alpha bravo", id: "segment-1", confidence: 0 }]);
  assert.equal(controller.getSnapshot().interimTranscript, "charlie delta");

  controller.dispose();
});

test("controller flushes pending final text when recording stops", () => {
  const recognition = new FakeSpeechRecognition();
  const finalized: Array<{ text: string; id: string; confidence: number }> = [];

  const controller = createSpeechRecognitionController({
    recognition,
    onSegmentFinalized: (text, id, confidence) => finalized.push({ text, id, confidence }),
    generateId: () => "segment-1",
    finalCommitDelayMs: 1000,
  });

  controller.startRecording();
  recognition.emitStart();
  recognition.emitResult({
    resultIndex: 0,
    results: [{ isFinal: true, 0: { transcript: "انا لا اعلم", confidence: 0.92 }, length: 1 }],
  });

  controller.stopRecording();

  assert.deepEqual(finalized, [{ text: "انا لا اعلم", id: "segment-1", confidence: 0.92 }]);
  assert.equal(controller.getSnapshot().interimTranscript, "");
});

test("controller stops retrying and shows guidance when speech service reports network error", () => {
  const recognition = new FakeSpeechRecognition();

  const controller = createSpeechRecognitionController({
    recognition,
    onSegmentFinalized: () => {},
  });

  controller.startRecording();
  recognition.emitStart();
  recognition.emitError("network");
  recognition.emitEnd();

  assert.equal(recognition.startCalls, 1);
  assert.equal(controller.getSnapshot().isRecording, false);
  assert.equal(
    controller.getSnapshot().error,
    "Speech recognition could not reach the browser speech service. Check your internet connection, make sure this browser supports Web Speech for the selected language, or switch to Offline mode.",
  );
});

test("controller accepts low-confidence final results (filtering deferred to downstream layers)", async () => {
  const recognition = new FakeSpeechRecognition();
  const finalized: Array<{ text: string; id: string; confidence: number }> = [];
  let id = 0;

  createSpeechRecognitionController({
    recognition,
    onSegmentFinalized: (text, segmentId, confidence) => finalized.push({ text, id: segmentId, confidence }),
    generateId: () => `segment-${id++}`,
    finalCommitDelayMs: 10,
  });

  recognition.emitResult({
    resultIndex: 0,
    results: [{ isFinal: true, 0: { transcript: "بلا بلا", confidence: 0.3 }, length: 1 }],
  });

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(finalized, [{ text: "بلا بلا", id: "segment-0", confidence: 0.3 }]);

  recognition.emitResult({
    resultIndex: 0,
    results: [{ isFinal: true, 0: { transcript: "مرحبا", confidence: 0.95 }, length: 1 }],
  });

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(finalized.length, 2);
  assert.equal(finalized[1].text, "مرحبا");
  assert.equal(finalized[1].confidence, 0.95);
});

test("controller restarts recognition after repeated empty final results to break a stuck loop", async () => {
  const recognition = new FakeSpeechRecognition();
  const finalized: Array<{ text: string; id: string; confidence: number }> = [];

  const controller = createSpeechRecognitionController({
    recognition,
    onSegmentFinalized: (text, id, confidence) => finalized.push({ text, id, confidence }),
    generateId: () => "segment-empty",
  });

  controller.startRecording();
  recognition.emitStart();
  assert.equal(recognition.startCalls, 1);

  const emitEmptyFinal = () =>
    recognition.emitResult({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "", confidence: 0 }, length: 1 }],
    });

  // First two empty finals just increment the counter without intervening.
  emitEmptyFinal();
  emitEmptyFinal();
  assert.equal(recognition.stopCalls, 0);

  // The third consecutive empty final triggers a recovery stop().
  emitEmptyFinal();
  assert.equal(recognition.stopCalls, 1);

  // Nothing empty was ever surfaced as a segment.
  assert.deepEqual(finalized, []);

  // stop() ends the session; controller then restarts (exponential backoff, 300ms base).
  recognition.emitEnd();
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(recognition.startCalls, 2);
  assert.equal(controller.getSnapshot().isRecording, true);

  controller.dispose();
});

test("internal empty-finals recovery does not burn the restart attempt budget", async () => {
  const recognition = new FakeSpeechRecognition();

  const controller = createSpeechRecognitionController({
    recognition,
    onSegmentFinalized: () => {},
    generateId: () => "segment-budget",
  });

  controller.startRecording();
  recognition.emitStart();

  const triggerEmptyFinalsRecovery = () => {
    for (let i = 0; i < 3; i += 1) {
      recognition.emitResult({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "", confidence: 0 }, length: 1 }],
      });
    }
  };

  // Six back-to-back recovery cycles — far past the 5-attempt safety cap.
  // Without the isInternalRecovery flag this would surface the
  // "stopped unexpectedly after multiple restart attempts" error.
  for (let cycle = 0; cycle < 6; cycle += 1) {
    triggerEmptyFinalsRecovery();
    recognition.emitEnd();
    await new Promise((resolve) => setTimeout(resolve, 50));
    recognition.emitStart();
  }

  assert.equal(controller.getSnapshot().error, null);
  assert.equal(controller.getSnapshot().isRecording, true);

  controller.dispose();
});

test("controller resets the empty-final counter when real speech arrives", () => {
  const recognition = new FakeSpeechRecognition();
  const finalized: Array<{ text: string; id: string; confidence: number }> = [];

  const controller = createSpeechRecognitionController({
    recognition,
    onSegmentFinalized: (text, id, confidence) => finalized.push({ text, id, confidence }),
    generateId: () => "segment-mixed",
  });

  controller.startRecording();
  recognition.emitStart();

  const emitEmptyFinal = () =>
    recognition.emitResult({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "", confidence: 0 }, length: 1 }],
    });

  emitEmptyFinal();
  emitEmptyFinal();

  // A real interim result resets the counter before it reaches the threshold.
  recognition.emitResult({
    resultIndex: 0,
    results: [{ isFinal: false, 0: { transcript: "hello", confidence: 0.8 }, length: 1 }],
  });

  emitEmptyFinal();
  emitEmptyFinal();

  // Two empties after the reset is below the threshold, so no recovery stop().
  assert.equal(recognition.stopCalls, 0);

  controller.dispose();
});
