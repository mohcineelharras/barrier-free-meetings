# Audio Pipeline Audit Prompt

Use this prompt when you want an autonomous deep investigation and hardening pass over the full audio stack in this repo.

```text
Audit and fix the complete audio/transcription pipeline in this repository end-to-end.

Scope:
- microphone mode
- device/system-audio mode
- online mode
- offline mode
- Whisper setup, model download, model switching, and multilingual transcription
- Ollama setup, model filtering, model availability, and local translation
- UI state transitions, capability detection, and user-facing errors
- WebSocket/session lifecycle, queued start behavior, config propagation, and race conditions
- browser behavior on desktop and the smallest viable mobile-safe path already supported by the repo

Operating rules:
- Work autonomously and continuously until the task is complete.
- Do not stop for questions unless there is a truly critical blocker.
- Do not revert unrelated local changes.
- Prefer root-cause fixes over symptom patches.
- Add regression coverage before or alongside each fix.
- Add or improve integration/E2E-style tests around the real audio pipeline behavior, especially for:
  - source language propagation
  - online/offline mode switching
  - queued transcription session startup
  - Whisper multilingual behavior
  - device/system-audio capture setup
  - Ollama model discovery and setup state
- Verify with the in-app browser on the local app when possible.
- Run the relevant tests after each fix and finish with the full test suite plus lint/typecheck.
- Commit the final working state to git with a clear message.

Deliverables:
- root-cause summary for each issue found
- code fixes
- stronger regression and integration/E2E-style tests
- verification results
- final git commit
```
