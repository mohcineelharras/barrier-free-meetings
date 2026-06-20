# Capacitor Mobile Prompt Pack

Use these prompts with a coding LLM to turn the current app into Android and iOS apps with Capacitor.

## Recommended Direction

For this repo, the fastest realistic path is:

1. Keep the existing React/Vite frontend.
2. Add Capacitor for Android and iOS shells.
3. Treat the Node/Express backend as an external service instead of trying to run `server.ts` inside the mobile app.
4. Make mobile use the remote `/api/*` endpoints and remote `/ws/transcribe`.
5. Ship microphone-based transcription first.
6. Disable or defer desktop-specific features on mobile if they depend on browser-only or desktop-only behavior.

## Current Repo Status

The architecture-first pass now uses a shared client runtime layer:

- `src/config/runtime.ts` resolves API and WebSocket base URLs for both web and native shells.
- `src/config/transcriptionSupport.ts` decides whether browser speech, hosted Whisper, offline mode, and system-audio capture are actually usable.
- Web still defaults to same-origin `/api/*` and `/ws/transcribe`.
- Native shells must provide a hosted backend through `VITE_API_BASE_URL` and, when needed, `VITE_WS_BASE_URL`.

Current mobile guardrails:

- Offline Ollama and local Whisper setup are disabled.
- System-audio capture is disabled.
- Microphone transcription prefers browser speech recognition when the WebView exposes it.
- Hosted Whisper remains the fallback when browser speech is unavailable and the backend is configured.

This is the right default because the current app relies on:

- `server.ts` for `/api/*` and WebSocket handling.
- `src/hooks/useSpeechToText.ts` for `SpeechRecognition` / `webkitSpeechRecognition`.
- `src/hooks/useWhisperSTT.ts` for `getUserMedia`, `AudioWorklet`, and WebSocket streaming.
- `src/App.tsx` and `src/components/Sidebar.tsx` for mode selection that currently assumes desktop/web behavior.

Capacitor is a good fit here, but full feature parity is not a one-click conversion.

## Non-Negotiable Execution Rules

Include this block in every implementation prompt:

```text
Operating mode:
- Work autonomously and continuously.
- Do not stop to ask questions unless the issue is truly critical and blocks safe progress.
- Critical means only things like: destructive git action, missing signing credentials, a required production backend URL that cannot be inferred, or a security-sensitive secret that must come from the user.
- For everything else, make the most reasonable assumption, state it in your final summary, and continue.
- Do not pause after analysis. Implement, verify, fix follow-up issues, and continue until the task is complete.
- Do not stop until you have committed the finished work to git.
- Do not revert unrelated existing changes in the worktree.
- Prefer the smallest viable mobile-first path that produces a working Android/iOS app from this repo.
```

## Prompt 1: End-to-End Mobile Conversion

```text
You are working in an existing repository and your job is to produce Android and iOS apps from the current web app using Capacitor.

Operating mode:
- Work autonomously and continuously.
- Do not stop to ask questions unless the issue is truly critical and blocks safe progress.
- Critical means only things like: destructive git action, missing signing credentials, a required production backend URL that cannot be inferred, or a security-sensitive secret that must come from the user.
- For everything else, make the most reasonable assumption, state it in your final summary, and continue.
- Do not pause after analysis. Implement, verify, fix follow-up issues, and continue until the task is complete.
- Do not stop until you have committed the finished work to git.
- Do not revert unrelated existing changes in the worktree.
- Prefer the smallest viable mobile-first path that produces a working Android/iOS app from this repo.

Project-specific context you must respect:
- The app is a Vite + React app.
- The repo also contains a Node/Express server in `server.ts`.
- The frontend calls `/api/*` endpoints and uses `/ws/transcribe`.
- The speech/transcription flow currently uses browser APIs in `src/hooks/useSpeechToText.ts` and `src/hooks/useWhisperSTT.ts`.
- Capacitor can wrap the frontend, but it should not try to run the Node server inside the mobile app.

Your goals:
1. Inspect the repo and confirm the current architecture.
2. Add Capacitor to the project and generate Android and iOS platforms.
3. Refactor client networking so the app can target a configurable remote API base URL and WebSocket base URL instead of assuming same-origin `/api` and `/ws`.
4. Preserve the current web behavior for browser usage.
5. Make the mobile app usable on Android and iOS even if some desktop-only features need to be disabled or deferred.
6. If a feature is not reliable on mobile yet, gate it cleanly in the UI with an explicit mobile-safe fallback instead of leaving broken controls.
7. Build and run the relevant verification commands.
8. Commit the final working changes to git.

Implementation guidance:
- Start with the simplest shippable architecture: web assets inside Capacitor, backend hosted separately.
- Introduce a runtime config layer for API and WebSocket origins.
- On mobile, prefer microphone capture only.
- If `SpeechRecognition`, `AudioWorklet`, system-audio capture, or offline desktop flows are not dependable in the mobile WebView, disable them behind platform checks and leave the app in a clearly working state.
- Do not attempt a large native plugin unless it is necessary for a working first release.
- Keep changes focused and incremental.

Expected deliverables:
- Capacitor integrated into the repo.
- Android and iOS projects added.
- Environment/config support for backend URL(s).
- Mobile-safe feature gating where needed.
- Any necessary docs updates.
- A git commit at the end.

When finished, provide:
- What you changed.
- What mobile features work now.
- What was deferred.
- What assumptions you made.
- The exact verification performed.
```

## Prompt 2: Architecture-First Pass

```text
Analyze this repository and implement the architecture changes needed before adding Capacitor.

Operating mode:
- Work autonomously and continuously.
- Do not stop to ask questions unless the issue is truly critical and blocks safe progress.
- Critical means only things like: destructive git action, missing signing credentials, a required production backend URL that cannot be inferred, or a security-sensitive secret that must come from the user.
- For everything else, make the most reasonable assumption, state it in your final summary, and continue.
- Do not pause after analysis. Implement, verify, fix follow-up issues, and continue until the task is complete.
- Do not stop until you have committed the finished work to git.
- Do not revert unrelated existing changes in the worktree.

Tasks:
1. Inspect how the frontend currently talks to `/api/*` and `/ws/transcribe`.
2. Refactor the client so API base URL and WebSocket base URL come from a shared config utility.
3. Preserve same-origin defaults for web.
4. Add clear mobile-aware platform detection if needed.
5. Identify features that should be disabled on mobile for now, and implement clean UI/logic guards.
6. Update docs so a later Capacitor step is straightforward.
7. Run tests/build/lint as appropriate.
8. Commit the result.

Important repo-specific constraints:
- `server.ts` is not going into the Capacitor bundle.
- Existing fetches like `fetch('/api/...')` and WebSocket URLs derived from `window.location` must be made portable.
- Mobile-first stability matters more than full parity on day one.
- Avoid changing unrelated app behavior.
```

## Prompt 3: Capacitor Bootstrap Only

```text
Integrate Capacitor into this existing Vite/React repository after first confirming the project build flow and output directory.

Operating mode:
- Work autonomously and continuously.
- Do not stop to ask questions unless the issue is truly critical and blocks safe progress.
- Critical means only things like: destructive git action, missing signing credentials, a required production backend URL that cannot be inferred, or a security-sensitive secret that must come from the user.
- For everything else, make the most reasonable assumption, state it in your final summary, and continue.
- Do not pause after analysis. Implement, verify, fix follow-up issues, and continue until the task is complete.
- Do not stop until you have committed the finished work to git.
- Do not revert unrelated existing changes in the worktree.

Tasks:
1. Add Capacitor dependencies and configuration to the repo.
2. Generate Android and iOS projects.
3. Ensure the Vite build output is compatible with Capacitor sync/copy.
4. Add any scripts needed for build/sync/open workflows.
5. Document how to run the mobile apps locally.
6. Verify the web build still works.
7. Commit the result.

Do not try to solve every mobile runtime issue in this prompt unless required for the basic Capacitor integration.
```

## Prompt 4: Mobile Feature Gating

```text
Make this app safe to run inside Capacitor on Android and iOS by detecting unsupported or risky features and gating them cleanly.

Operating mode:
- Work autonomously and continuously.
- Do not stop to ask questions unless the issue is truly critical and blocks safe progress.
- Critical means only things like: destructive git action, missing signing credentials, a required production backend URL that cannot be inferred, or a security-sensitive secret that must come from the user.
- For everything else, make the most reasonable assumption, state it in your final summary, and continue.
- Do not pause after analysis. Implement, verify, fix follow-up issues, and continue until the task is complete.
- Do not stop until you have committed the finished work to git.
- Do not revert unrelated existing changes in the worktree.

Focus areas:
- `src/hooks/useSpeechToText.ts`
- `src/hooks/useWhisperSTT.ts`
- `src/hooks/useSTT.ts`
- `src/App.tsx`
- `src/components/Sidebar.tsx`

Tasks:
1. Detect whether the app is running on web vs Capacitor mobile.
2. Review speech recognition, audio worklet capture, system-audio capture, offline mode, and any assumption tied to same-origin networking.
3. Disable or replace any feature that is likely to break in a mobile WebView.
4. Keep the UI honest: if something is unavailable on mobile, say so clearly.
5. Preserve the best possible microphone transcription flow for mobile.
6. Verify the app still builds and that the web app remains functional.
7. Commit the result.
```

## Prompt 5: Full Mobile MVP

```text
Build a practical mobile MVP from this repository using Capacitor.

Operating mode:
- Work autonomously and continuously.
- Do not stop to ask questions unless the issue is truly critical and blocks safe progress.
- Critical means only things like: destructive git action, missing signing credentials, a required production backend URL that cannot be inferred, or a security-sensitive secret that must come from the user.
- For everything else, make the most reasonable assumption, state it in your final summary, and continue.
- Do not pause after analysis. Implement, verify, fix follow-up issues, and continue until the task is complete.
- Do not stop until you have committed the finished work to git.
- Do not revert unrelated existing changes in the worktree.

Definition of MVP:
- Android and iOS shells exist.
- The app launches in Capacitor.
- The frontend can reach a configurable remote backend.
- The user can use the core transcription/translation path that is realistically supportable in mobile.
- Unsupported features are intentionally hidden or disabled.
- The codebase remains clean and documented.

Preferred scope decisions:
- Favor online/mobile-safe transcription first.
- Defer desktop-only offline behavior if needed.
- Do not over-engineer a native bridge unless clearly necessary.

Finish by running verification and creating a git commit.
```

## Prompt 6: If You Want Full Feature Parity Later

```text
Extend the Capacitor mobile app toward feature parity with the existing web/desktop experience, but do it in controlled phases and do not destabilize the current app.

Operating mode:
- Work autonomously and continuously.
- Do not stop to ask questions unless the issue is truly critical and blocks safe progress.
- Critical means only things like: destructive git action, missing signing credentials, a required production backend URL that cannot be inferred, or a security-sensitive secret that must come from the user.
- For everything else, make the most reasonable assumption, state it in your final summary, and continue.
- Do not pause after analysis. Implement, verify, fix follow-up issues, and continue until the task is complete.
- Do not stop until you have committed the finished work to git.
- Do not revert unrelated existing changes in the worktree.

Mission:
- First identify which current features are desktop/browser-dependent.
- Then decide which ones can be supported through Capacitor plugins, which need native custom plugins, and which should remain desktop-only.

Produce and implement a phased plan covering:
1. microphone permissions and recording UX
2. WebSocket streaming reliability in mobile
3. speech recognition fallback strategy
4. offline mode feasibility on mobile
5. any native plugin work needed for audio capture or speech processing
6. testing strategy for Android and iOS

Do not attempt everything at once. Implement the first high-confidence parity phase, verify it, document the remaining gaps, and commit.
```

## Prompt 7: Strict Repo-Surgeon Version

```text
Work as a senior repo surgeon. Your job is to convert this existing app into a Capacitor-based Android/iOS project with the least risky set of changes.

Operating mode:
- Work autonomously and continuously.
- Do not stop to ask questions unless the issue is truly critical and blocks safe progress.
- Critical means only things like: destructive git action, missing signing credentials, a required production backend URL that cannot be inferred, or a security-sensitive secret that must come from the user.
- For everything else, make the most reasonable assumption, state it in your final summary, and continue.
- Do not pause after analysis. Implement, verify, fix follow-up issues, and continue until the task is complete.
- Do not stop until you have committed the finished work to git.
- Do not revert unrelated existing changes in the worktree.

Rules:
- Inspect before changing.
- Follow existing project patterns.
- Keep diffs small and readable.
- Prefer configuration and feature gating over broad rewrites.
- Preserve current web behavior.
- Avoid speculative abstractions.
- Verify every major step.
- Commit only when the repo is in a coherent state.

Goal:
- A working Capacitor integration and a believable mobile app path for this specific repository.
```

## Best Prompt To Start With

If you want one prompt only, start with Prompt 1.

If you want the safest sequence, use:

1. Prompt 2
2. Prompt 3
3. Prompt 4
4. Prompt 5
5. Prompt 6 later only if you want deeper native parity
