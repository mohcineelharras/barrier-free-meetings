# Hosted Demo Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Hugging Face demo use a safer default transcription cap and make live Whisper sessions stop with a clear restart message while preserving the current conversation after sleep or disconnect.

**Architecture:** Keep the existing conversation state model intact and layer interruption handling onto the Whisper client hook as a message-classification concern. Update hosted runtime defaults at the server and Docker levels, then document the cap in the deployment guide.

**Tech Stack:** TypeScript, React hooks, Node test runner, Express runtime config, Docker.

---

### Task 1: Lock hosted demo defaults with tests first

**Files:**
- Modify: `server/runtimeConfig.test.ts`
- Modify: `server/runtimeConfig.ts`
- Modify: `Dockerfile`
- Modify: `docs/huggingface-spaces.md`

- [ ] **Step 1: Write the failing test**

Add assertions that Hugging Face defaults use `MAX_ACTIVE_TRANSCRIPTIONS=2`, keep queue size at `3`, and still allow explicit env overrides.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx server/runtimeConfig.test.ts`
Expected: FAIL because the hosted default is still `3` active transcriptions.

- [ ] **Step 3: Write minimal implementation**

Update hosted runtime defaults in `server/runtimeConfig.ts`, set `MAX_ACTIVE_TRANSCRIPTIONS=2` in `Dockerfile`, and document the new default in `docs/huggingface-spaces.md`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import tsx server/runtimeConfig.test.ts`
Expected: PASS

### Task 2: Add interruption classification with tests first

**Files:**
- Create: `src/hooks/whisperInterruption.ts`
- Create: `src/hooks/whisperInterruption.test.ts`
- Modify: `src/hooks/useWhisperSTT.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Add pure-function tests for interruption classification so we can distinguish manual stop, server-capacity errors, and unexpected live-session disconnects.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx src/hooks/whisperInterruption.test.ts`
Expected: FAIL because the helper does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create a small helper that returns the persistent restart-oriented message for unexpected live interruptions while preserving existing server-provided `busy` and capacity errors.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import tsx src/hooks/whisperInterruption.test.ts`
Expected: PASS

### Task 3: Wire interruption UX into the client flow

**Files:**
- Modify: `src/hooks/useWhisperSTT.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Add an app-level rendering test that covers the new persistent interruption notice surface and verifies the transcript placeholder behavior still works when no interruption is present.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx src/App.test.tsx`
Expected: FAIL because the interruption notice UI is not implemented yet.

- [ ] **Step 3: Write minimal implementation**

Update `useWhisperSTT` to apply the interruption helper when the socket dies unexpectedly during an active recording, keep committed transcript state untouched, and update `App.tsx` so interruption messages remain visible until dismissed or recording restarts instead of auto-hiding after five seconds.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import tsx src/hooks/whisperInterruption.test.ts src/App.test.tsx`
Expected: PASS

### Task 4: Verify the scoped change set

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add new test file to the explicit test script**

Update `package.json` so `src/hooks/whisperInterruption.test.ts` is included in `npm run test`.

- [ ] **Step 2: Run project checks for the touched surface**

Run: `npm run lint`
Expected: PASS

Run: `node --test --import tsx server/runtimeConfig.test.ts src/hooks/whisperInterruption.test.ts src/App.test.tsx`
Expected: PASS

- [ ] **Step 3: Run the full test command and document baseline reality**

Run: `npm run test`
Expected: Existing unrelated failures may remain in `server/offline-stt/transformersWhisperCache.test.ts`; the touched tests should pass.

- [ ] **Step 4: Commit**

Commit only the implementation files for this feature with a focused message.
