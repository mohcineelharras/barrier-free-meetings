# Contributing to Barrier-Free Meetings

Thanks for your interest in making meetings accessible to more people. This
project welcomes bug reports, feature ideas, documentation fixes, and pull
requests.

## Quick start

1. **Fork** the repository and clone your fork.
2. **Install dependencies:** `npm install` (the server runs through `tsx`,
   so no separate build step is needed for development).
3. **Copy the env template:** `cp .env.example .env` and fill in the keys
   you want to test against. Most providers are independent — you can run
   the app with just an `OPENROUTER_API_KEY` or just an `OLLAMA_HOST`.
4. **Run the dev server:** `npm run dev`. It starts the Express backend
   and the Vite frontend together on `http://localhost:3000`.
5. **Run the tests:** `npm test` (uses `node:test`, not Jest or Vitest).
6. **Typecheck:** `npm run lint` (this is `tsc --noEmit`, not ESLint).

## Project structure

- `server.ts` — Express + WebSocket entry point.
- `server/` — Backend modules (translation providers, Whisper pipeline, CORS, reports).
- `server/offline-stt/` — Local Whisper inference via HuggingFace Transformers.
- `src/` — React frontend (hooks, components, services, constants).
- `landing-page/` — Standalone Vite app for the marketing site (`speechbridge`).
- `scripts/` — Utility scripts (download Whisper models, export brand assets).
- `electron/` — Electron main process for the desktop app.

## Code style

- TypeScript everywhere. `"type": "module"` in `package.json`; server
  imports must use explicit `.js` extensions.
- No comments unless the surrounding code uses them — match the existing
  style of the file you are editing.
- Prefer small, focused modules. The translation providers each live in
  their own file under `server/`.
- Frontend hooks live in `src/hooks/`; pure utilities live in `src/utils/`.
- Tests are colocated with the source: `foo.ts` has `foo.test.ts` next to it.

## Adding a new translation provider

1. Create `server/<provider>.ts` exposing at least
   `translateWith<Provider>(text, model, sourceLang, targetLang)` and
   `fetch<Provider>Models()`.
2. Register the provider in `src/constants/providers.ts` and surface it in
   the sidebar settings panel (`src/components/Sidebar.tsx`).
3. Add a unit test under `server/<provider>.test.ts` that uses
   `process.env.<PROVIDER>_API_KEY` with a placeholder value.
4. If the provider needs an API key, add it to `.env.example` with a
   comment explaining where to get one.

## Pull request checklist

- [ ] Tests pass locally (`npm test`).
- [ ] Typecheck passes (`npm run lint`).
- [ ] New env vars are documented in `.env.example`.
- [ ] New behavior is reflected in `README.md` if user-visible.
- [ ] No secrets, API keys, or `.env` files are included in the diff.

## Reporting bugs

Open a GitHub issue with:

- Steps to reproduce (browser, OS, Node version, provider selected).
- Expected vs. actual behavior.
- Server log snippet (with API keys redacted).
- Browser console snippet if the issue is UI-related.

For security issues, please email the maintainer directly rather than
opening a public issue.

## License

By contributing, you agree that your contributions will be licensed under
the [MIT License](LICENSE).
