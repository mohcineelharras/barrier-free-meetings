# LinkedIn post — drafts

Below are three drafts (short, medium, technical) you can pick from. Each is
ready to copy-paste into LinkedIn. Replace placeholders in `[]` before posting.

---

## Draft 1 — Short (recommended for maximum reach)

> Today I'm open-sourcing **Barrier-Free Meetings** — a real-time,
> offline-first meeting app that does live speech-to-text and
> translation across 50+ language pairs.
>
> Why it matters: most "AI meeting" tools stream your audio to a third
> party. This one runs Whisper locally by default and lets you choose
> your own translation provider (OpenRouter, Google AI Studio, Ollama,
> MiniMax). No vendor lock-in, no required cloud.
>
> Stack: React + Express + WebSocket in a single TypeScript package.
> Runs as a web app, Electron desktop, Android/iOS via Capacitor, on
> Hugging Face Spaces, or in a one-line `docker compose up` for
> self-hosted installs.
>
> 🤗 Try the live demo: https://huggingface.co/spaces/mohcineelharras/barrier-free-meetings
>
> MIT licensed. Repo + quick start in the first comment 👇

---

## Draft 2 — Medium (story-led)

> I've spent the last few months building something I wish existed:
> **Barrier-Free Meetings** — a meeting tool that respects your
> privacy.
>
> The premise is simple: in a world where most teams are now
> multilingual, and most "AI assistants" are just thin wrappers around
> someone else's API, the meeting layer should be:
>
> • **Local-first** — Whisper runs in your browser or on your machine.
> • **Provider-agnostic** — translate with OpenRouter, Google AI
>   Studio, Ollama, or MiniMax. Mix and match.
> • **Self-hostable** — `docker compose up` and you have a full
>   fullstack app running, or `npm run dev` for the source-build path.
> • **Cross-platform** — same code, web / Electron / Capacitor mobile
>   / Hugging Face Spaces.
>
> Try it without installing anything:
> 🤗 https://huggingface.co/spaces/mohcineelharras/barrier-free-meetings
>
> It's MIT-licensed, ~2k LoC of TypeScript on the backend plus a
> React + Tailwind frontend, and it has been my single biggest
> forcing function for learning AI engineering end-to-end:
> WebSocket streaming, provider fallback chains, model discovery, the
> whole loop.
>
> If you've ever wished a meeting tool could just *work* in your
> language without shipping your audio to Silicon Valley, give it a
> try.
>
> Repo: https://github.com/mohcineelharras/barrier-free-meetings
> Quick start: `git clone … && docker compose up -d`

---

## Draft 3 — Technical (for AI / dev audiences)

> Open-sourced today: **Barrier-Free Meetings** — a real-time offline
> speech transcription + translation app, MIT-licensed.
>
> Live demo running on HF Spaces:
> 🤗 https://huggingface.co/spaces/mohcineelharras/barrier-free-meetings
>
> What I learned building it that might be useful:
>
> 1. **WebSocket + browser PCM worklets** is the cleanest way to push
>    mic audio into a backend Whisper pipeline without a third-party
>    SDK.
> 2. **Provider fallback chains** beat "best provider" pickers.
>    Encode the chain in one place; tests can simulate the failure
>    modes individually.
> 3. **`dotenv` + explicit `.env.example`** is the right pattern for
>    a single-package fullstack app where the same repo ships server
>    + frontend + Electron.
> 4. **`node:test` + `tsx`** is a perfectly good test stack if you
>    don't want to drag in Jest/Vitest.
> 5. **Capacitor** can reuse a Vite-built web app as the native
>    shell if you keep `server.ts` out of the bundle.
> 6. **A multi-stage Dockerfile per deployment target** keeps each
>    profile lean: one for Hugging Face Spaces (port 7860, hosted
>    demo), one for personal Docker (port 3000, full features,
>    persisted model cache).
>
> Stack: React 19, Vite 6, Express 4, WebSocket (ws), HuggingFace
> Transformers 4 (Whisper), TypeScript end-to-end.
>
> Repo: https://github.com/mohcineelharras/barrier-free-meetings

---

## Suggested first comment on the LinkedIn post

> Repo + live demo:
>
> 🤗 Try it: https://huggingface.co/spaces/mohcineelharras/barrier-free-meetings
> 💻 Source: https://github.com/mohcineelharras/barrier-free-meetings
>
> One-line self-host:
> ```bash
> git clone https://github.com/mohcineelharras/barrier-free-meetings.git
> cd barrier-free-meetings
> docker compose up -d
> ```
>
> Open http://localhost:3000, allow microphone, and start talking.
> Browser-native speech recognition is the default — no API keys
> required to try it.
>
> If you want translations, add at least one of these to `.env`:
> - `OPENROUTER_API_KEY` (free tier available)
> - `GOOGLE_AI_STUDIO_API_KEY` (free tier)
> - `MINIMAX_API_KEY`
> - `OLLAMA_HOST` (fully local, no key)
>
> Issues, PRs, and stars all welcome. 🙏
