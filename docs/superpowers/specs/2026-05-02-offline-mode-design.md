# Offline Mode + Theme Toggle — Design Spec
**Date:** 2026-05-02
**Status:** Approved

---

## Overview

Add two features to Transcribe Easy:

1. **Theme toggle** — light/dark switch in the top-right header corner.
2. **Offline mode** — switch that replaces Web Speech API + OpenRouter with server-side Whisper + local Ollama, allowing the app to work entirely without internet.

---

## 1. Theme Toggle

### What
A sun/moon icon button in the top-right of the header. Clicking it toggles light/dark mode. Preference persisted to `localStorage`.

### How
- Configure Tailwind v4 dark mode using `@variant dark (&:where(.dark, .dark *))` in `index.css`.
- Toggle a `dark` class on the `<html>` element.
- Update all component classes to have light-mode base colors with `dark:` overrides.
- A `useTheme` hook manages state + `localStorage` persistence.

### Colour mapping
| Element | Light | Dark |
|---|---|---|
| Page background | `bg-white` | `dark:bg-gray-950` |
| Panel/card | `bg-gray-50` | `dark:bg-gray-900` |
| Border | `border-gray-200` | `dark:border-gray-800` |
| Primary text | `text-gray-900` | `dark:text-gray-100` |
| Secondary text | `text-gray-500` | `dark:text-gray-400` |
| Muted text | `text-gray-400` | `dark:text-gray-600` |

---

## 2. Offline Mode

### Mode Toggle (UI)
- **Location:** Top of the Settings sidebar, above all other controls.
- **Design:** Segmented control — `Online` (blue when active) / `Offline` (amber when active).
- **Behaviour on flip to Offline:**
  1. Starts Whisper model download in the background (skips if already cached).
  2. Locks Provider to "Ollama (local)".
  3. Fetches installed Ollama models from `localhost:11434`.
  4. Disables the Record button until Whisper model is ready.
- **Flip back to Online:** Restores previous OpenRouter provider/model selection.

---

## 3. Auto-Setup — Ollama + Whisper (no admin rights)

When the user flips to Offline mode for the first time, the server detects whether the dependencies are present and installs them silently if not. Everything installs to user-writable directories — no elevated permissions required on either macOS or Windows.

### New file: `server/setup.ts`

Orchestrates the full setup sequence and exposes status for the UI.

**Functions:**
- `getSetupStatus(): SetupStatus` — returns current state of each step.
- `runSetup(onProgress): Promise<void>` — runs all steps sequentially; idempotent (each step is skipped if already done).

**Setup steps (run in order):**

| # | Step | Skipped if |
|---|---|---|
| 1 | Detect Ollama in PATH or local install dir | `ollama` found |
| 2 | Download Ollama binary | Already downloaded |
| 3 | Start Ollama server | `localhost:11434` already responding |
| 4 | Pull `qwen3.5:0.8b` model | Model already in `ollama list` |
| 5 | Download Whisper tiny model | Model file already on disk |

**`SetupStatus` shape:**
```ts
interface SetupStatus {
  step: 'detecting' | 'downloading-ollama' | 'starting-ollama' |
        'pulling-model' | 'downloading-whisper' | 'ready' | 'error';
  progress: number;   // 0-100, relevant during download steps
  error: string | null;
}
```

### Ollama download paths (no admin)

The server resolves a per-user install directory at startup:
- **macOS:** `~/Library/Application Support/TranscribeEasy/ollama/`
- **Windows:** `%LOCALAPPDATA%\TranscribeEasy\ollama\`

**macOS:** Download `ollama-darwin.zip` from the Ollama GitHub releases, unzip it, extract the `Ollama.app/Contents/MacOS/ollama` binary to the install dir, `chmod +x` it.

**Windows:** Download `OllamaSetup.exe` from the Ollama GitHub releases and run it with `/SILENT /NORESTART`. The installer targets per-user `%LOCALAPPDATA%\Programs\Ollama\` by default — no UAC prompt needed.

**PATH fallback:** Before downloading, check `which ollama` (macOS) / `where ollama` (Windows). If found, use the system binary and skip download.

### Ollama server management

After the binary is confirmed, `setup.ts` checks if `http://localhost:11434/api/tags` is reachable. If not, it spawns `ollama serve` as a detached child process using `child_process.spawn`. The process is kept alive for the duration of the Node server session and killed on `process.exit`.

### Model auto-pull

Once the Ollama server is running, `setup.ts` calls `ollama pull qwen3.5:0.8b` as a child process and streams its JSON progress lines to compute the `progress` percentage for the UI.

> **Note:** The model ID `qwen3.5:0.8b` is used as specified. If Ollama reports it is not found, the setup step shows an error with the exact Ollama error message and a retry button.

### New endpoint: `GET /api/setup/status`

Returns the current `SetupStatus` object. The sidebar polls this every 1 second while `step !== 'ready'`.

### Sidebar: Setup progress card

Replaces the Whisper-only download card with a unified setup card shown when `step !== 'ready'`:

```
┌─────────────────────────────────┐
│ ⚙ First-time setup              │
│ ████████░░░░░░░ 52%             │
│ Pulling qwen3.5:0.8b…           │
└─────────────────────────────────┘
```

Step labels shown to the user:
- `detecting` → "Checking for Ollama…"
- `downloading-ollama` → "Downloading Ollama (~80 MB)…"
- `starting-ollama` → "Starting Ollama server…"
- `pulling-model` → "Pulling qwen3.5:0.8b…"
- `downloading-whisper` → "Downloading Whisper model (~75 MB)…"
- `ready` → card hidden, Record button enabled

---

## 4. Offline Translation — Ollama

### Architecture
```
POST /api/translate  { text, model, sourceLang, targetLang, provider: "ollama" }
  → server/ollama.ts → fetch http://localhost:11434/api/chat
  → { translation }
```

### New file: `server/ollama.ts`
- `translateWithOllama(text, model, sourceLang, targetLang): Promise<string>`
  Calls `POST http://localhost:11434/api/chat` with OpenAI-compatible payload.
  Reuses `buildTranslationPrompt()` from `server/translate.ts`.

### Model list: `server/models.ts` addition
- `fetchOllamaModels(): Promise<FreeModel[]>`
  Calls `GET http://localhost:11434/api/tags`, maps `models[].name` to `{ id, name }`.
  Returns empty array (not an error) if Ollama is not running.

### Server endpoints added to `server.ts`
- `GET /api/models?provider=openrouter|ollama` — routes to correct fetcher.
- `POST /api/translate` — reads `provider` from body; routes to OpenRouter or Ollama.
- `GET /api/ollama/status` — returns `{ running: boolean }` by probing `localhost:11434/api/tags`.

### Client: `src/hooks/useModels.ts`
- Accepts `provider` parameter; re-fetches when it changes.

### Constants: `src/constants/providers.ts`
- Add `{ id: 'ollama', name: 'Ollama (local)' }` to `PROVIDERS`.

---

## 4. Offline STT — Whisper (server-side WebSocket)

### Architecture
```
Browser (MediaRecorder → PCM Float32 via AudioWorklet)
  → WebSocket ws://localhost:3000/ws/transcribe
    → server/wsTranscribe.ts → server/whisper.ts → nodejs-whisper (whisper.cpp)
      → transcript text frame back over WebSocket
        → App.tsx onSegmentFinalized
```

### Model
- **Model:** `whisper-tiny` (multilingual, ~75 MB, downloaded once on first Offline toggle).
- **Storage:** `models/whisper/` directory at project root.
- **Progress:** Polled via `GET /api/whisper/status` → `{ state: 'idle'|'downloading'|'ready', progress: number }`.

### New file: `server/whisper.ts`
- `getWhisperStatus(): WhisperStatus`
- `ensureModelDownloaded(onProgress): Promise<void>` — no-op if already ready.
- `transcribeAudio(pcmData: Float32Array, sampleRate: number, language: string): Promise<string>`
  Writes PCM → temp WAV → nodejs-whisper → deletes temp file → returns text.

### New file: `server/wsTranscribe.ts`
WebSocket handler attached to the Express HTTP server:
- On binary message: accumulate PCM Float32 frames; flush to `transcribeAudio()` when silence detected (RMS below threshold for 800 ms) or chunk exceeds 6 seconds.
- On text message `{ type: 'config', language }`: set recognition language.
- On close: clean up session state.

### Client: `src/hooks/useWhisperSTT.ts`
Same return interface as `useSpeechToText`:
`{ isRecording, interimTranscript, error, startRecording, stopRecording }`
- Opens WebSocket on `startRecording()`.
- Uses `AudioWorklet` to capture PCM Float32 at 16 kHz.
- Sends binary frames every 100 ms.
- On text frame from server: calls `onSegmentFinalized(text, id)`.
- Shows `"…"` as interim placeholder while a chunk is processing.

### New file: `src/worklets/pcm-capture.worklet.ts`
AudioWorklet processor that downsamples browser audio (44.1/48 kHz) to 16 kHz Float32.

### New file: `src/hooks/useSTT.ts` (unified adapter)
Conditionally calling two different hooks violates React's Rules of Hooks. Instead, a single `useSTT` hook wraps both internally:
```tsx
// Always called — both internal hooks are always mounted
const { isRecording, interimTranscript, error, startRecording, stopRecording } =
  useSTT({ mode: isOffline ? 'whisper' : 'web-speech', onSegmentFinalized, language: sourceLanguage });
```
`useSTT` calls both `useSpeechToText` and `useWhisperSTT` unconditionally on every render, then forwards the active one's interface based on `mode`. The inactive hook stays idle.

Record button disabled when `isOffline && whisperStatus !== 'ready'`.

---

## 5. Sidebar UX Changes (`src/components/Sidebar.tsx`)

- **Top:** Mode segmented toggle (Online / Offline).
- **Offline-only:** Whisper status card with progress bar — hidden in Online mode.
- **Provider:** Online → OpenRouter dropdown. Offline → "Ollama (local)" locked label.
- **Model:** Online → OpenRouter free models. Offline → Ollama installed models; shows install hint if empty.
- **Bottom:** Green/red Ollama connectivity dot shown in Offline mode only.

---

## 6. New npm Dependencies

| Package | Purpose |
|---|---|
| `nodejs-whisper` | whisper.cpp wrapper — model download + transcription |
| `ws` | WebSocket server attached to Express |
| `@types/ws` | TypeScript types |
| `adm-zip` | Unzip `ollama-darwin.zip` on macOS during auto-setup |

Ollama binary download uses Node's built-in `https` + `fs` — no extra HTTP client needed.  
No new client dependencies — `AudioWorklet` and `WebSocket` are native browser APIs.

---

## 7. File Change Summary

### New files
| File | Purpose |
|---|---|
| `server/setup.ts` | Auto-setup orchestrator (Ollama download, server spawn, model pull, Whisper download) |
| `server/ollama.ts` | Ollama translation client |
| `server/whisper.ts` | Whisper model management + transcription |
| `server/wsTranscribe.ts` | WebSocket audio streaming handler |
| `src/hooks/useWhisperSTT.ts` | Client STT hook (WebSocket + AudioWorklet) |
| `src/hooks/useSTT.ts` | Unified adapter — switches between Web Speech and Whisper without violating Rules of Hooks |
| `src/worklets/pcm-capture.worklet.ts` | 16 kHz PCM AudioWorklet processor |
| `src/hooks/useTheme.ts` | Theme toggle + localStorage |

### Modified files
| File | Change |
|---|---|
| `server/models.ts` | Add `fetchOllamaModels()` |
| `server.ts` | Provider routing, `/api/setup/status`, Whisper/Ollama status endpoints, WebSocket upgrade |
| `src/constants/providers.ts` | Add Ollama |
| `src/hooks/useModels.ts` | Accept + react to `provider` param |
| `src/components/Sidebar.tsx` | Mode toggle, Whisper card, Ollama status |
| `src/App.tsx` | Theme button, `isOffline` state, dynamic STT hook |
| `src/index.css` | Tailwind dark mode variant |
| `package.json` | Add `nodejs-whisper`, `ws`, `@types/ws` |

---

## 8. Error States

| Condition | UI response |
|---|---|
| Whisper download fails | Red error in Whisper card with retry button |
| Ollama download fails | Setup card shows error + retry button |
| `qwen3.5:0.8b` pull fails | Setup card shows Ollama's error message + retry button |
| Ollama not running after setup | Red dot + retry spawning server |
| No Ollama models installed | Model dropdown empty + "Run `ollama pull qwen3.5:0.8b`" hint |
| WebSocket disconnects mid-recording | Error shown, recording stops cleanly |
| Whisper transcription fails | Segment shows `[Transcription Error]` |

---

## 9. Out of Scope

- Auto-detecting network connectivity (manual toggle only).
- Streaming word-by-word output from Whisper (batch chunks only).
- Offline mode on mobile (AudioWorklet support varies).
