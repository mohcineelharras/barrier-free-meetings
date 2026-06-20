# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

**Development:**
```bash
npm install
npm run dev           # Starts dev server with hot reload on http://localhost:3000
npm run lint          # Type check with TypeScript
npm run test          # Run Node.js tests
```

**Production:**
```bash
npm run build         # Build frontend with Vite
npm run preview       # Run production-built app
```

**Environment:**
- Copy `.env.example` to `.env` 
- Set `OPENROUTER_API_KEY` for default translation provider
- Optionally set `GOOGLE_AI_STUDIO_API_KEY` for Google AI Studio provider

## Architecture

This is a **fullstack TypeScript monorepo** (React frontend + Express backend, no separate directories).

### High-Level Design

**Frontend (React):**
- **Entry:** `src/main.tsx` → `src/App.tsx` (main orchestrator)
- **Hooks:** Custom React hooks in `src/hooks/` manage state:
  - `useSTT` - Speech-to-text switching (web-speech vs local whisper)
  - `useHistory` - Session persistence (localStorage)
  - `useTheme` - Theme management
  - `useModels` - Model fetching from providers
- **Components:** UI components in `src/components/`:
  - `Sidebar` - Language, provider, model selection + recording controls
  - `ReportPanel` - Meeting report generation UI
  - `HistoryPanel` - Session history and management
- **Services:** API calls in `src/services/`:
  - `openrouter.ts` - Translation via OpenRouter API
  - `report.ts` - Report generation service
- **Constants:** Shared data in `src/constants/`:
  - `languages.ts` - Language list and lookup
  - `providers.ts` - Provider/model defaults

**Backend (Express + WebSocket):**
- **Entry:** `server.ts` - Sets up Express + Vite (dev) or static serving (prod)
- **REST Endpoints:**
  - `/api/models` - Fetch available models from provider
  - `/api/translate` - Translate text (supports OpenRouter, Google AI Studio, Ollama)
  - `/api/report` - Generate meeting report from transcript segments
  - `/api/setup/*` - Setup status and initialization
  - `/api/whisper/*` - Local whisper model selection and status
  - `/api/ollama/status` - Check if Ollama is running
- **WebSocket:** `server/wsTranscribe.ts` - Real-time transcription streaming
- **Server Modules:**
  - `server/models.ts` - Model discovery logic
  - `server/translate.ts` - Translation orchestration
  - `server/ollama.ts` - Ollama provider integration
  - `server/googleai.ts` - Google AI Studio integration
  - `server/whisper.ts` - Local Whisper inference
  - `server/report.ts` - Report generation logic
  - `server/setup.ts` - Initial setup (downloading models)

### Data Flow

1. **Recording:** User speaks → Browser captures audio via Web Audio API
2. **Transcription:** 
   - Online: WebSocket streams audio to server → Whisper returns text
   - Offline: Browser-local speech recognition API
3. **Translation:** Finalized segments sent to `/api/translate` → Response updates UI
4. **Report:** User triggers report → Segments sent to `/api/report` → Generated report displayed
5. **History:** Sessions saved to localStorage via `useHistory` hook

### Key Design Patterns

- **Immutable state updates:** React state always uses new arrays/objects (`.map()`, spread operator)
- **Error handling:** Explicit error catching at API boundaries with user-facing messages
- **Provider abstraction:** Translation/report generation support multiple AI providers through common interfaces
- **WebSocket for streaming:** Low-latency real-time transcription via persistent connection
- **localStorage persistence:** No backend database; history stored client-side

## Development Workflow

**Making Changes:**
1. Frontend: Edit `src/**` → Vite hot reload
2. Backend: Edit `server.ts` or `server/**` → Restart with `npm run dev`
3. Types: Always run `npm run lint` before commit
4. Tests: Run `npm run test` (currently testing translate, wsTranscribe, and speechRecognitionController)

**Common Tasks:**
- **Add new language:** Update `src/constants/languages.ts` 
- **Add new translation provider:** Extend `server/translate.ts` + add API integration
- **Modify transcription:** Edit `server/wsTranscribe.ts` (WebSocket) or `src/hooks/useWhisperSTT.ts` (client)
- **Change UI layout:** Edit components in `src/components/` or main `src/App.tsx`

## Important Context

### Multi-Provider Translation
The app supports three translation backends:
- **OpenRouter** (default, requires API key) - best quality
- **Google AI Studio** (optional, requires API key) - alternative
- **Ollama** (local, no API key) - offline mode

The UI switches providers via sidebar. Backend routes requests through correct service based on `provider` param.

### Offline Mode
When online models aren't available, users can:
1. Run Ollama locally (`ollama serve`)
2. Set provider to "Ollama" in sidebar
3. App uses local inference (no API keys needed)

### Report Generation
Segments are sent to `/api/report` with language metadata. Server generates meeting notes/summary using selected AI provider. Reports are displayed in ReportPanel but not persisted (user can copy/export).

### Session History
All transcription sessions are saved to localStorage automatically. Users can:
- View/load previous sessions from HistoryPanel
- Delete individual sessions or clear all history
- Session includes: transcript segments, translations, timestamps, metadata

### Testing
Tests are in `*.test.ts(x)` files. Current coverage:
- `server/translate.test.ts` - Translation API error handling
- `server/wsTranscribe.test.ts` - WebSocket transcription logic
- `src/hooks/speechRecognitionController.test.ts` - Speech recognition client

Run specific test: `node --test --import tsx src/hooks/speechRecognitionController.test.ts`

## Build & Deploy

**Development:** `npm run dev` runs Vite dev server + Express on same port (3000)

**Production:**
1. `npm run build` creates `dist/` with frontend build
2. `npm run preview` serves `dist/` via Express as static files
3. All API routes still work (Express middleware routing)

Environment variables are read at server startup; no bundling of secrets.

## Troubleshooting

- **Hot reload not working:** Check `DISABLE_HMR` env var (AI Studio sets it)
- **Translation failing:** Verify API keys in `.env`, check provider status
- **Transcription not working:** Check browser permissions, verify WebSocket connection
- **Ollama integration:** Ensure Ollama is running (`ollama serve`), accessible on localhost
