# Offline Streaming Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pseudo-streaming offline STT path with a real incremental offline backend that emits durable `partial` and `final` transcript events over the existing WebSocket transport.

**Architecture:** Add a dedicated offline STT module on the server that separates transcript assembly, session state, and engine integration. Use a streaming-capable Whisper adapter in Node that can run from repo/user-writable directories, then refactor the WebSocket session and client hook to consume explicit draft-versus-committed semantics.

**Tech Stack:** TypeScript, Node.js worker threads, WebSocket (`ws`), `@huggingface/transformers`, ONNX Runtime via Transformers.js, React hooks, Node test runner.

---

### Task 1: Capture the session protocol in tests

**Files:**
- Modify: `server/wsTranscribe.test.ts`
- Create: `server/offline-stt/transcriptAssembler.test.ts`

- [ ] Add failing tests that assert `partial` updates arrive before `final`, duplicate partial text is suppressed, stop/reset clears draft state, and engine startup/runtime errors are surfaced as actionable events.
- [ ] Run: `npm test -- server/wsTranscribe.test.ts server/offline-stt/transcriptAssembler.test.ts`
- [ ] Confirm the new assertions fail for the current batch-oriented implementation.

### Task 2: Add transcript assembly primitives

**Files:**
- Create: `server/offline-stt/transcriptAssembler.ts`
- Test: `server/offline-stt/transcriptAssembler.test.ts`

- [ ] Implement minimal transcript assembly code that tracks committed text separately from the unstable tail, deduplicates identical partial drafts, and exposes reset/finalize operations for session stop and disconnect.
- [ ] Run: `npm test -- server/offline-stt/transcriptAssembler.test.ts`
- [ ] Refine names/types only after the new tests pass.

### Task 3: Add a real streaming offline engine adapter

**Files:**
- Create: `server/offline-stt/transformersWhisperEngine.ts`
- Create: `server/offline-stt/transformersWhisperWorker.ts`
- Modify: `package.json`

- [ ] Add the failing engine-contract tests around startup timeout, incremental partial/final callbacks, and crash/error propagation using mocked worker boundaries where direct inference is impractical.
- [ ] Implement a worker-backed `@huggingface/transformers` Whisper engine with repo/user-cache configuration, first-run model bootstrap, graceful startup timeout handling, and explicit cleanup.
- [ ] Run the focused server tests to verify the adapter contract.

### Task 4: Refactor WebSocket transcription sessions onto the new engine

**Files:**
- Modify: `server/wsTranscribe.ts`
- Modify: `server/wsTranscribe.test.ts`
- Create: `server/offline-stt/session.ts`

- [ ] Replace the current batch-flush path with a session object that receives PCM frames, feeds overlapping windows into the streaming engine, and emits protocol-safe `partial` and `final` messages.
- [ ] Preserve graceful stop/disconnect teardown and ensure engine failures produce human-readable `error` messages without leaking workers.
- [ ] Run: `npm test -- server/wsTranscribe.test.ts`

### Task 5: Update the client hook to consume explicit draft/final semantics

**Files:**
- Modify: `src/hooks/useWhisperSTT.ts`
- Modify: `src/hooks/useSTT.ts`
- Modify: `src/App.test.tsx`

- [ ] Add failing tests for in-place interim updates, final segment commit behavior, and actionable error handling without regressing online mode.
- [ ] Update the hook to consume `partial` as replaceable draft text and `final` as committed transcript rows.
- [ ] Run: `npm test -- src/App.test.tsx src/hooks/speechRecognitionController.test.ts`

### Task 6: Verify the end-to-end change and commit

**Files:**
- Modify: `server/whisper.ts` if any legacy helpers remain shared, otherwise leave untouched or narrow its responsibility
- Update: any touched files from Tasks 1-5

- [ ] Run the full targeted verification: `npm test`
- [ ] Run static verification: `npm run lint`
- [ ] Review the diff for accidental changes outside the isolated worktree scope.
- [ ] Commit the finished implementation with a focused message.
