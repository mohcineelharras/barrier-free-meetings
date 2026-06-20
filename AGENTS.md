# AGENTS.md

## Commands

- `npm run dev` — starts Express + Vite dev server (port 3000). Uses `tsx watch server.ts`.
- `npm run lint` — **typecheck only** (`tsc --noEmit`). Despite the name, there is no linter.
- `npm run test` — runs all tests via `node --test --import tsx` with an explicit file list (not a glob).
- Single test: `node --test --import tsx <file>` (e.g. `node --test --import tsx server/translate.test.ts`)
- `npm run build` — Vite frontend build to `dist/`. Does **not** build/check the server.
- `npm run preview` — `NODE_ENV=production tsx server.ts` (serves built frontend + API).
- Landing page has its own Vite app: `npm run dev:landing`, `npm run build:landing`.
- Mobile: `npm run mobile:build` = `vite build && cap sync`.

## Architecture

Fullstack TypeScript in a single package — React frontend + Express backend share the same `package.json` and `tsconfig.json`. No monorepo boundaries.

- **Frontend entry:** `src/main.tsx` → `src/App.tsx`
- **Backend entry:** `server.ts` (root) — wires Express routes + WebSocket server
- **Path alias:** `@/*` → project root (configured in both `tsconfig.json` and `vite.config.ts`)
- **ESM only** — `"type": "module"`. Server imports must use `.js` extensions (e.g. `import { foo } from "./server/bar.js"`).
- **TypeScript never emits** — `noEmit: true`. Code runs via `tsx` (dev) or Vite (frontend build).

### Key directories

| Path | Purpose |
|---|---|
| `src/` | React frontend (hooks, components, services, constants) |
| `server/` | Express backend modules (translate, whisper, ollama, googleai, report, setup) |
| `server/offline-stt/` | Local Whisper inference pipeline (includes `transformersWhisperWorker.js` — plain JS worker) |
| `landing-page/` | Separate Vite app for the marketing site |
| `scripts/` | Utility scripts (download whisper models, test whisper languages, export brand assets) |

## Testing

- **Framework:** Node.js built-in `node:test` + `node:assert/strict`. Not Jest or Vitest.
- **Test files:** `*.test.ts(x)` colocated with source.
- **Frontend tests** use `renderToStaticMarkup` from `react-dom/server` — no DOM/JSDOM needed.
- `server/audioPipeline.e2e.test.ts` is an e2e test (may require whisper models present).
- When adding a new test file, you must also add it to the explicit file list in the `test` script in `package.json`.

## Gotchas

- `npm run lint` is typecheck-only. There is no ESLint or Prettier configured.
- Backend edits trigger `tsx watch` auto-restart. Frontend edits get Vite HMR — unless `DISABLE_HMR=true` is set (used by AI Studio to prevent flicker).
- `server.ts` uses `dotenv.config()` — env vars are read at startup, not bundled.
- CORS allows Capacitor origins (`capacitor://localhost`) and matches localhost with any port against the portless default entries.
- WebSocket transcription flow: client → `wsTranscribe.ts` → `transcriptionSessionManager.ts` → `offline-stt/` (local Whisper via HuggingFace Transformers).
- No database — session history is `localStorage` only.
- Translation supports three providers (OpenRouter, Google AI Studio, Ollama). Provider is selected per-request via `provider` query param.
- The `android/` and `ios/` directories are Capacitor native projects — excluded from `tsconfig.json`.
