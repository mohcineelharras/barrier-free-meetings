# Hosted Demo Resilience Design

**Date:** 2026-05-27

## Goal

Make the Hugging Face Spaces demo behave predictably for a small group of users and make laptop sleep or connection loss interrupt live recording without losing the current conversation.

## Scope

This design covers two changes:

1. Hosted demo concurrency defaults for Hugging Face Spaces.
2. Client behavior when a live Whisper-backed recording is interrupted by laptop sleep, browser suspension, or network disconnect.

This design does not add background recording, true resumable capture, or automatic reconnection after wake.

## Current Context

- The hosted deployment is a Docker-based Hugging Face Space intended for lightweight demos on `CPU Basic`.
- The backend already has a transcription session manager with active-session caps, queueing, and busy responses.
- The client currently treats WebSocket failure as a generic recording error and stops recording.
- Transcript segments already committed in the current conversation live in React state and are not inherently tied to an active socket.

## Requirements

### Product Requirements

- A user who loses an active recording because their laptop slept should keep the current conversation and all transcript content already captured.
- The app should clearly explain that live recording was interrupted and that the user must restart manually.
- Restarting recording should continue in the same conversation instead of clearing the transcript.
- The hosted demo should prefer predictable throughput for a few users over aggressive parallelism.

### Non-Goals

- Recovering audio that occurred while the laptop was asleep.
- Silent or automatic reconnect that could imply uninterrupted capture.
- Dedicated multi-tenant scaling beyond the Hugging Face demo footprint.

## Approaches Considered

### Approach 1: Manual Restart With Preserved Transcript

When recording is interrupted, stop the live session, preserve existing transcript segments, show a restart-oriented message, and let the user resume manually.

**Pros**

- Honest about the capture gap.
- Minimal new state and low implementation risk.
- Fits the current app architecture.

**Cons**

- User must click record again.

### Approach 2: Manual Restart With Explicit Resume Marker

Same as Approach 1, but inject a system-style transcript marker when recording resumes.

**Pros**

- Makes gaps more visible in the transcript.

**Cons**

- Adds transcript semantics that do not exist elsewhere in the app.
- Risks clutter for a demo-oriented UI.

### Approach 3: Automatic Reconnect

Attempt to reconnect the WebSocket and restart capture after wake or disconnect.

**Pros**

- Less manual effort when it works.

**Cons**

- Browser permission and media state after sleep are unreliable.
- Can mislead users into thinking no gap occurred.
- More edge cases than value for the current deployment target.

## Recommended Approach

Use **Approach 1**.

The demo should preserve the current conversation, stop recording immediately on interruption, and require an explicit user restart. This is the clearest behavior for sleep mode and the safest fit for a hosted demo.

## Design

### 1. Hosted Demo Concurrency

Set an explicit hosted-demo default of `MAX_ACTIVE_TRANSCRIPTIONS=2` for the Hugging Face Spaces deployment path.

Rationale:

- The current backend default derives from CPU parallelism, which is sensible for local/server installs but too implicit for a public demo.
- A fixed limit of `2` is more predictable on `CPU Basic`.
- With queueing already implemented, a third user can wait instead of overloading the process.
- This matches the repo's stated positioning of the Space as suitable for a few short parallel demo sessions, not sustained heavy use.

Implementation intent:

- Bake `MAX_ACTIVE_TRANSCRIPTIONS=2` into the hosted Docker defaults.
- Document the value in the Hugging Face deployment guide so it remains visible and overrideable.

### 2. Interruption Semantics

Treat an unexpected client-side recording failure as an interruption of the live session, not as a reset of the conversation.

Trigger conditions:

- Laptop sleep or browser suspension drops the WebSocket.
- Network loss drops the WebSocket during recording.
- Browser media capture becomes unavailable unexpectedly.

Behavior:

- Stop recording.
- Close media and socket resources cleanly.
- Preserve all committed transcript segments already shown in the UI.
- Clear only ephemeral interim transcript state.
- Surface a specific restart-oriented error message.

Recommended copy:

`Recording was interrupted while your device was asleep, offline, or unable to keep the live connection. Start recording again to continue this conversation.`

This wording is intentionally broad enough to cover sleep, wake, tab suspension, and network loss without pretending the app can precisely classify the root cause every time.

### 3. Same-Conversation Resume

Restarting recording after an interruption should append new finalized segments to the existing `segments` state in the current app session.

Behavioral rules:

- Do not clear transcript segments on interruption.
- Do not clear completed translations for earlier segments.
- Do not create a new conversation automatically.
- Keep manual “clear” or history actions as the only ways to discard the current conversation.

### 4. UI State and Messaging

The existing error surface in `App.tsx` should become more intentional for interruption cases.

Desired user experience:

- If recording is interrupted mid-session, the visible error explains what happened in plain language.
- The transcript remains visible underneath the error.
- The main recording action stays available so the user can restart immediately.

No separate “resume mode” data model is required. The combination of:

- preserved transcript state,
- `isRecording = false`, and
- a specific interruption message

is sufficient for the current UI.

### 5. Detection Strategy

Do not implement a separate sleep detector in the first pass.

Instead:

- Continue treating unexpected WebSocket/media failure during an active recording as the canonical interruption event.
- Map those failures to the clearer interruption message when the stop was not user-initiated.

Rationale:

- Sleep is already observable indirectly because it interrupts capture or the socket.
- A dedicated sleep/wake heuristic would add complexity and cross-browser ambiguity without improving the core user outcome.

## Affected Files

Expected design targets:

- `src/hooks/useWhisperSTT.ts`
  - refine unexpected failure handling and interruption messaging
- `src/App.tsx`
  - preserve conversation and present clearer interruption feedback
- `server/runtimeConfig.ts`
  - continue honoring explicit transcription caps from env
- `Dockerfile`
  - set hosted-demo `MAX_ACTIVE_TRANSCRIPTIONS=2`
- `docs/huggingface-spaces.md`
  - document the explicit demo concurrency default and tradeoff

## Testing Strategy

### Automated Tests

- Add or extend frontend tests to verify interruption behavior preserves transcript state.
- Add a test for the Whisper client hook or surrounding state flow proving that an unexpected disconnect during recording yields the interruption message and stops recording.
- Add or extend runtime config tests to verify `MAX_ACTIVE_TRANSCRIPTIONS` still respects an explicit env override.
- Add or extend deployment-oriented tests only where practical; avoid brittle tests that depend on actual browser sleep behavior.

### Manual Verification

1. Start a Whisper-backed recording in the browser.
2. Finalize at least one transcript segment.
3. Simulate connection loss or manually suspend the machine/browser.
4. Confirm recording stops and the transcript remains visible.
5. Confirm the interruption message is shown.
6. Restart recording.
7. Confirm new transcript segments append to the same conversation.

### Hugging Face Validation

After deploy:

1. Confirm the Space starts with `MAX_ACTIVE_TRANSCRIPTIONS=2`.
2. Open three browser sessions.
3. Start backend Whisper recording in two sessions.
4. Confirm the third session queues or receives a capacity message rather than degrading the whole app.

## Edge Cases

- If interruption occurs before the backend sends `started`, the user should still receive a clear failure message and remain able to retry.
- If the server returns an explicit `busy` message, preserve the existing capacity-specific copy rather than replacing it with the sleep/disconnect message.
- If the user intentionally presses stop, do not show the interruption message.
- If the app is using browser Web Speech instead of backend Whisper, this design does not change that path unless the same generic interruption messaging already applies there.

## Risks

- The app cannot guarantee that every unexpected disconnect was caused by sleep specifically.
- Queueing a third user helps protect the demo, but translation provider limits may still affect perceived responsiveness.
- A fixed cap of `2` is conservative; it improves predictability but may underuse stronger hardware if the Space is upgraded later.

## Rollout Notes

- The hosted concurrency cap should remain easy to override with an env var for future hardware changes.
- This work is safe to ship incrementally because preserving transcript state is already aligned with the current architecture.
