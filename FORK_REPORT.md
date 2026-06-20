# Fork Report — transcribe-easy

**Date:** 2026-06-20
**Source:** local working copy (path redacted from public copy)
**Target:** `~/opensource-staging/transcribe-easy`
**License:** MIT
**GitHub:** https://github.com/mohcineelharras/barrier-free-meetings

## What was copied

The full project tree was mirrored with `rsync` using the following
exclusions:

| Excluded | Reason |
|---|---|
| `.git/` | History is rebuilt fresh on the public repo. |
| `node_modules/` | Recreated by `npm install`. |
| `dist/`, `dist-landing/`, `build/` | Vite build output. |
| `coverage/` | Test coverage reports. |
| `.worktrees/` | Local-only worktree directory. |
| `tools/` | Downloaded binaries (Ollama, Whisper, Node for Windows). |
| `.env`, `.env.*` | Live API keys. |
| `package-lock.json` | Gitignored in the source. |
| `android/`, `ios/` | Capacitor native projects (regenerable from `capacitor.config.ts`). |
| `.superpowers/`, `.playwright-mcp/`, `.codex/`, `.claude/`, `.opencode/` | Local AI tooling. |
| `*.log`, `.DS_Store` | OS / runtime noise. |

Final staging size: ~1.9 MB.

## What was modified

### `package.json`

- Removed `"private": true`.
- Added `"license": "MIT"`, `"homepage"`, and `"bugs"` fields.
- **Removed** the `extraResources` entry that bundled the local `.env`
  file into Electron desktop builds (`"from": ".env"`). This is the
  single most important security fix in the fork — it would otherwise
  ship live API keys inside every Electron release. Replaced with
  `.env.example` so the desktop build still ships a template.
- No dependency or version changes.

### `README.md`

Replaced with a clean, public-facing README. Key differences from the
original:

- Removed the AI Studio app banner, the "View in AI Studio" link, and
  the auto-generated `<img>` / "GHBanner" header.
- Removed references to internal workspace names.
- Added a feature overview, provider table, architecture diagram,
  commands table, and acknowledgements.
- Updated all commands to match `package.json` (which is unchanged).
- Kept the LAN and Hugging Face Spaces sections because they are
  genuinely useful and contain no private information.

### Files added

- `LICENSE` — MIT.
- `CONTRIBUTING.md` — contributor guide.
- `.env.example` — comprehensive template documenting every env var the
  server reads (was missing from the source).
- `setup.sh` — one-command bootstrap for macOS / Linux. The source
  already ships `setup-local.bat` for Windows.
- `FORK_REPORT.md` (this file).
- `SANITIZATION_REPORT.md` — see the next step.
- `.github/ISSUE_TEMPLATE/bug_report.md`.
- `.github/ISSUE_TEMPLATE/feature_request.md`.
- `.github/workflows/ci.yml` — minimal CI: install, typecheck, test on
  push and PR to `main`.

## What was preserved verbatim

- All source code (`server/`, `src/`, `landing-page/`).
- `AGENTS.md` and the existing `CLAUDE.md` (AI assistant onboarding
  notes, generic enough for the public repo).
- `docs/`, `branding/`, `design-system/`, `scripts/`, `electron/`.
- `capacitor.config.ts`, `vite.config.ts`, `tsconfig.json`.
- `Dockerfile` and the `metadata.json` Hugging Face Space header.
- The existing `setup-local.bat` Windows bootstrap.
- The existing `.github/workflows/test-windows-setup.yml` (manual
  Windows setup verification).

## Things to know before publishing

1. The author attribution in `package.json` is `Mohcine El Harras`.
   The license file uses the same name and the year 2026.
2. The repo URL is `mohcineelharras/barrier-free-meetings`. Update if you
   want a different name.
3. The `extraResources` change is the critical fix — verify it before
   cutting any Electron release.
4. The new `setup.sh` is macOS / Linux. Windows users continue to use
   `setup-local.bat`, which is already in the repo.
5. No secrets were found in the source tree (see
   `SANITIZATION_REPORT.md`). The only API keys ever present lived in
   the local `.env` file (gitignored) and never made it into the
   staging copy.
