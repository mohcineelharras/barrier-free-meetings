<div align="center">

# Barrier-Free Meetings

**Real-time, offline-first speech transcription and live translation.**

Open-source, self-hostable, multi-provider. Built to make meetings accessible
across languages — no data leaves your machine unless you choose a cloud
provider.

[Features](#features) · [Quick start](#quick-start) · [Providers](#translation-providers) · [Architecture](#architecture) · [Contributing](CONTRIBUTING.md) · [License](LICENSE)

</div>

---

## Why this exists

Most meeting apps assume everyone speaks the same language, and most
"AI" transcription tools stream your audio to a third-party cloud. This
project does the opposite:

- **Offline-first.** The default speech-to-text path is your browser's
  built-in Web Speech API, with a fully-local Whisper fallback powered by
  [Hugging Face Transformers](https://huggingface.co/docs/transformers.js).
- **Bring your own provider.** Translate through OpenRouter, Google AI
  Studio, MiniMax, or a local Ollama server — independently, fall-back
  chain included.
- **Self-hostable.** Single `npm run dev` boots a fullstack app: React
  frontend, Express + WebSocket backend, no database required.
- **Cross-platform.** Web, Electron desktop, Capacitor for Android/iOS,
  and a Dockerfile for Hugging Face Spaces.

## Features

- **Live transcription** in the browser with a WebSocket-piped local
  Whisper fallback.
- **Live translation** between 50+ language pairs with automatic provider
  fallback when a request fails.
- **Meeting reports** generated from the transcript at the end of a
  session.
- **Session history** stored in `localStorage` — no account, no server
  storage, no tracking.
- **CORS-aware** backend that defaults to `localhost` and accepts
  Capacitor native origins out of the box.
- **Type-safe end-to-end** with shared TypeScript and a single
  `tsconfig.json`.

## Quick start

### Prerequisites

- **Node.js 20+** (the project is tested against Node 22).
- **npm 10+** (ships with Node 20).
- A modern browser — Chrome, Edge, Firefox, or Safari with Web Speech
  API support.

### One-command bootstrap

```bash
git clone https://github.com/mohcineelharras/transcribe-easy.git
cd transcribe-easy
./setup.sh
npm run dev
```

Open <http://localhost:3000>, allow microphone access, and start
talking. The app uses browser-native speech recognition by default — no
API keys are required to try it.

### Manual install

```bash
npm install
cp .env.example .env
# edit .env and add the API keys you want
npm run dev
```

### Verify the install

```bash
npm run lint   # tsc --noEmit
npm test       # node --test (uses an explicit file list, not a glob)
```

## Translation providers

Pick one or several — the app automatically chains them in priority
order and falls through on failure. Configure the keys you want in
`.env`; the rest can stay blank.

| Provider | Cost | Setup | Notes |
|---|---|---|---|
| [OpenRouter](https://openrouter.ai/keys) | Free + paid tiers | `OPENROUTER_API_KEY` | Largest model catalog. Free tier is the default. |
| [Google AI Studio](https://aistudio.google.com/apikey) | Free tier | `GOOGLE_AI_STUDIO_API_KEY` | Gemma 4 fallback models are pre-wired. |
| [MiniMax](https://minimax.io) | Paid | `MINIMAX_API_KEY` | Useful when OpenRouter/Google are rate-limited. |
| [Ollama](https://ollama.com) | Free, local | `OLLAMA_HOST=http://127.0.0.1:11434` | No API key, fully offline. |

The default free-only fallback chain is:

1. OpenRouter `liquid/lfm-2.5-1.2b-instruct:free`
2. Gemma 4 26B A4B (Google AI Studio)
3. Gemma 4 31B IT (Google AI Studio)
4. MiniMax M2.7

## Speech-to-text

Two paths, chosen automatically based on browser support:

- **Web Speech API** (default) — runs in Chrome, Edge, and Safari. No
  download, no setup, no model weight required.
- **Local Whisper** via [Hugging Face Transformers
  v4](https://huggingface.co/docs/transformers.js). The first time you
  select a non-browser model, `server/setup.ts` downloads the weights
  into `./tools/` (gitignored). Supported sizes include `tiny`, `base`,
  and `small`, with language-prefixed variants like `tiny.en` for
  English-only workloads.

Set `DEFAULT_WHISPER_MODEL=tiny` (or your preferred size) in `.env` to
change the boot-time model.

## Architecture

Fullstack TypeScript in a single package — React frontend + Express
backend share the same `package.json` and `tsconfig.json`.

```
transcribe-easy/
├── server.ts              # Express + WebSocket entry point
├── server/                # Backend modules
│   ├── translate.ts       # OpenRouter orchestration + fallback chain
│   ├── googleai.ts        # Google AI Studio provider
│   ├── minimax.ts         # MiniMax provider
│   ├── ollama.ts          # Local Ollama provider
│   ├── whisper.ts         # Local Whisper status / model selection
│   ├── wsTranscribe.ts    # WebSocket transcription stream
│   ├── transcriptionSessionManager.ts
│   ├── report.ts          # Meeting report generation
│   ├── models.ts          # Model discovery
│   ├── setup.ts           # First-run model downloads
│   ├── runtimeConfig.ts   # Server runtime config
│   ├── cors.ts            # CORS handling
│   ├── deviceAudioCapture.ts
│   ├── languageVerification.ts
│   └── offline-stt/       # Local Whisper inference pipeline
├── src/                   # React frontend
│   ├── App.tsx
│   ├── components/        # Sidebar, ReportPanel, HistoryPanel, …
│   ├── hooks/             # useSTT, useWhisperSTT, useHistory, …
│   ├── services/          # openrouter.ts, gemini.ts, report.ts
│   ├── constants/         # languages, providers, qualityTiers
│   └── config/            # runtime, transcription support
├── landing-page/          # Standalone Vite app for the marketing site
├── electron/              # Electron main process (desktop)
├── scripts/               # Utility scripts (Whisper model downloads, …)
└── public/                # Static assets (favicon, worklets)
```

The WebSocket transcription flow is:

```
browser mic
   ↓ Web Speech API (default)
   ↓ or PCM worklet → WebSocket
server/wsTranscribe.ts
   ↓
transcriptionSessionManager.ts
   ↓
server/offline-stt/ (local Whisper via HuggingFace Transformers)
   ↓
server/translate.ts (OpenRouter + fallback chain)
   ↓
React UI
```

## Running on LAN

```bash
npm run dev:lan   # binds 0.0.0.0:3000 with CORS_ALLOWED_ORIGINS=*
```

Open the printed LAN URL (e.g. `http://192.168.1.6:3000`) on another
device. For microphone access on plain HTTP, either:

- Use Chrome's `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
  flag, **or**
- Put Caddy in front: `caddy reverse-proxy --from :3001 --to :3000`.

## Mobile (Android / iOS)

Capacitor is configured against the main Vite app:

```bash
npm run mobile:build         # vite build && npx cap sync
npm run cap:open:android     # or cap:open:ios
```

Native shells disable offline Ollama and local Whisper setup — they
expect a hosted backend reachable via `VITE_API_BASE_URL` and
`VITE_WS_BASE_URL`.

## Hugging Face Spaces

A Dockerfile is included. To deploy:

1. Create a new Hugging Face **Docker Space**.
2. Push this repository.
3. Add at least one secret (`OPENROUTER_API_KEY` and/or
   `GOOGLE_AI_STUDIO_API_KEY`).
4. The Space will boot in hosted-demo mode: browser STT first, Whisper
   `tiny` fallback, OpenRouter / Google AI for translation and reports.

See [`docs/huggingface-spaces.md`](docs/huggingface-spaces.md) for the
exact settings and tradeoffs.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Express + Vite dev server on port 3000. |
| `npm run dev:lan` | Same, bound to `0.0.0.0` with permissive CORS. |
| `npm run lint` | Typecheck (`tsc --noEmit`). |
| `npm test` | Run all `node:test` suites. |
| `npm run build` | Build the frontend into `dist/`. |
| `npm run preview` | Serve the built frontend + API in production mode. |
| `npm run mobile:build` | `vite build && npx cap sync`. |
| `npm run dev:landing` | Run the marketing site in dev. |
| `npm run build:landing` | Build the marketing site. |
| `npm run electron:dev` | Launch the Electron desktop app. |
| `npm run electron:pack` | Package the desktop app for the current OS. |

## License

[MIT](LICENSE) — Copyright (c) 2026 Mohcine El Harras.

## Acknowledgments

- [Hugging Face Transformers.js](https://huggingface.co/docs/transformers.js)
  for running Whisper in the browser / Node.
- [OpenRouter](https://openrouter.ai), [Google AI
  Studio](https://aistudio.google.com), [Ollama](https://ollama.com), and
  [MiniMax](https://minimax.io) for translation backends.
- [Capacitor](https://capacitorjs.com) for the Android / iOS shells.
