# Capacitor Mobile Parity Design

## Goal

Extend the existing web and desktop transcription app into a stable Capacitor-based Android and iOS client without destabilizing the current browser experience. Ship parity in controlled phases, starting with the smallest mobile-safe path.

## Current Feature Inventory

### Browser/Desktop-Dependent Today

| Feature | Current implementation | Mobile status |
| --- | --- | --- |
| Microphone transcription via browser speech API | `SpeechRecognition` / `webkitSpeechRecognition` in `src/hooks/useSpeechToText.ts` | Kept for browser/desktop; not the preferred mobile MVP path |
| Microphone transcription via Whisper streaming | `getUserMedia` + `AudioWorklet` + WebSocket in `src/hooks/useWhisperSTT.ts` | Feasible if backend URL is configured and WebView audio APIs are present |
| System audio capture | `getDisplayMedia({ audio: true })` | Desktop/browser only |
| Offline Ollama + local Whisper setup | Local server/bootstrap flow in `server.ts` and sidebar setup controls | Desktop-only |
| Same-origin `/api/*` and `/ws/transcribe` assumptions | Frontend service calls and WebSocket URL derivation | Must be refactored for mobile |
| Session history and report UI | `localStorage`, React state, REST calls | Mobile-safe once backend routing is portable |

## Support Matrix

### Supported via Capacitor Shell + Existing Web APIs

- Basic app shell, navigation, local history, report UI
- Microphone permissions when native manifests/plists are present
- Hosted Whisper streaming when the backend URL is reachable and audio APIs exist

### Supported via Capacitor Plugins

- `@capacitor/core`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/cli` for shell packaging
- Candidate phase-2 plugins:
  - `@capacitor/app` for resume/background lifecycle handling during active transcription
  - `@capacitor/network` for online/offline detection and better reconnect UX

### Likely Custom Native Plugin Work

- Raw PCM microphone capture if WebView `AudioWorklet` is unreliable on target devices
- On-device speech recognition or on-device Whisper if offline mobile transcription becomes a hard requirement
- Background-safe audio capture if the app must keep recording while partially backgrounded

### Should Remain Desktop-Only For Now

- System audio capture
- Local Ollama bootstrapping
- Local desktop Whisper model download/setup
- “Offline mode” as currently implemented

## Phased Plan

### Phase 1: Safe Mobile Foundation

Ship a Capacitor shell, portable runtime config, mobile-safe feature gating, native microphone permission metadata, and a stable mobile transcription path that prefers hosted Whisper streaming over desktop-specific behavior.

Status: Implemented in this change set.

### Phase 2: Mobile Streaming Reliability

- Add app lifecycle awareness so active recordings react cleanly to background/resume events
- Add network awareness and clearer reconnect/retry UX for dropped WebSocket sessions
- Consider explicit server origin allowlists and telemetry for mobile handshake failures

### Phase 3: Native Audio Capture Escape Hatch

- Prototype a custom Capacitor plugin for PCM microphone capture
- Keep the frontend WebSocket protocol intact so only the capture layer swaps out
- Use this only if WebView `AudioWorklet` proves too inconsistent across devices

### Phase 4: Offline Mobile Feasibility

- Evaluate on-device speech options separately from the current desktop Ollama/Whisper path
- Treat mobile offline transcription as a new capability, not a direct reuse of the desktop bootstrap flow
- Keep it out of the MVP unless accuracy, size, startup time, and battery cost are acceptable

## Phase 1 Scope

- Add and verify Capacitor config plus native shells
- Add microphone permission declarations to Android and iOS
- Replace same-origin API/WebSocket assumptions with a shared runtime config layer
- Add mobile backend configuration UI for native shells
- Gate offline mode and system audio on mobile
- Keep browser speech recognition as a browser-first path
- Prefer hosted Whisper streaming for native mobile recording

## Testing Strategy

### Automated in Repo

- Typecheck the combined web/mobile source tree
- Unit-test runtime config resolution, mobile capability classification, transcription support, and native shell metadata
- Run existing WebSocket/session/server tests to ensure mobile changes do not regress desktop flows

### Manual Android

- Launch emulator against local backend and confirm model loading
- Verify microphone permission prompt and denied-permission messaging
- Record with browser speech if supported; otherwise verify Whisper fallback path
- Confirm system-audio and offline toggles are disabled

### Manual iOS

- Launch simulator against local backend and confirm model loading
- Verify Info.plist microphone/speech permission prompts
- Repeat browser speech vs Whisper fallback validation
- Confirm sidebar backend override can point to a hosted server for physical-device testing

## Remaining Gaps After Phase 1

- No background-safe mobile recording guarantee
- No mobile-specific reconnect buffering yet
- No native PCM capture plugin yet
- No true offline mobile transcription yet
