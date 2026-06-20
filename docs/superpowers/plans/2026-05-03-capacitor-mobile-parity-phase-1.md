# Capacitor Mobile Parity Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first high-confidence mobile parity slice without destabilizing the web and desktop app.

**Architecture:** Keep the React app shared across web and Capacitor, add a runtime config layer for backend routing, and constrain mobile to microphone-first transcription paths that can already be supported by the current frontend/server protocol. Treat offline desktop flows and system-audio capture as explicitly deferred.

**Tech Stack:** React 19, Vite, Capacitor 8, TypeScript, Express, WebSocket (`ws`), Node test runner.

---

### Phase 1 Deliverables

- Capacitor config and native project metadata are present and test-covered
- Android and iOS shells declare microphone/speech permissions
- Frontend API and WebSocket calls use shared runtime config helpers
- Mobile shells can override the backend URL from the app UI
- Mobile shells disable offline mode and system audio capture
- Transcription support logic keeps browser speech recognition on the web while preferring hosted Whisper streaming for native mobile
- Server runtime config allows Capacitor and localhost origins for REST and WebSocket flows

### Deferred To Later Phases

- App lifecycle-aware reconnect and buffering
- Native PCM audio plugin
- On-device speech or on-device Whisper
- Background recording guarantees

### Verification Commands

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run cap:sync`
