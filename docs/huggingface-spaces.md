# Hugging Face Spaces Deployment

This repo can be deployed as a public Hugging Face `Docker Space` for lightweight demos.

The repository root `Dockerfile` is intentionally the full self-hosted app image. Hugging Face Spaces builds the root file named `Dockerfile`, so deploy the demo image by copying `Dockerfile.hf` to `Dockerfile` in the Space repository or by syncing a Space-specific branch that performs that copy.

## Recommended Demo Setup

- Leave `browser Web Speech` as the first-choice microphone path when supported.
- Keep backend Whisper enabled as the multilingual fallback.
- Pin backend Whisper to `tiny` for the hosted demo.
- Let users manually switch microphone transcription to `Whisper tiny` from the sidebar when they want the hosted backend path.
- Use `OpenRouter` and/or `Google AI Studio` for translation and reports.
- Do not use Ollama in the Hugging Face deployment.

## Space Settings

Create a new Space with:

- SDK: `Docker`
- Visibility: `Public`
- Hardware: `CPU Basic`

The root [`README.md`](../README.md) contains the YAML metadata Hugging Face reads for the Space.

Before pushing to the Space repo:

```bash
cp Dockerfile.hf Dockerfile
```

Do this in the Hugging Face Space checkout or in a dedicated Space deployment branch. Do not replace the main repository root `Dockerfile`; it is the full self-hosted image for open-source users.

## Required Secrets

Set at least one of these in the Space settings:

- `OPENROUTER_API_KEY`
- `GOOGLE_AI_STUDIO_API_KEY`

If you set both, users can switch between providers in the UI.

## Optional Variables

These defaults are already baked into the Docker image, but you can override them in the Space settings if needed:

- `HF_SPACES=true`
- `DISABLE_AUTO_SETUP=true`
- `DEFAULT_WHISPER_MODEL=tiny`
- `MAX_ACTIVE_TRANSCRIPTIONS=3`
- `HOST=0.0.0.0`
- `PORT=7860`

## What Changes In Hosted Demo Mode

- The Ollama-style offline toggle is hidden.
- The app starts with Whisper `tiny` as the backend default.
- The sidebar exposes a manual `Browser Speech` / `Whisper tiny` switch for microphone transcription in hosted demo mode.
- Local setup endpoints are disabled.
- The demo keeps multilingual Whisper available without trying to bootstrap Ollama.
- The OpenRouter model dropdown lists all free text chat models from OpenRouter, with a fast light default (`inclusionai/ling-3.0-flash:free`) first.
- Audio Input includes an opt-in **Browser audio** mode (Mic remains the default).

### Browser audio (tab / window share)

Hosted demos cannot capture audio on the Space host machine. Instead, **Browser audio** uses the browser’s share dialog (`getDisplayMedia`) so users can share a tab or window from their own computer:

1. Select **Browser audio** under Audio Input.
2. Start recording — Chrome/Edge shows a share picker.
3. Choose a **Chrome Tab** (or window) and enable **Share tab audio** / **Share audio**.
4. Transcription always uses Whisper (not Browser Speech) for this path.

Notes:

- Best supported on desktop Chrome/Edge. Safari/Firefox/mobile support is limited.
- If the Space is embedded in an iframe without `display-capture` permission, open the Space in a top-level tab.
- Stopping the share (or denying the prompt) ends recording with a clear error.

## Expected Limits

On free CPU hardware, this setup is best for:

- casual friend demos
- a few parallel users
- short multilingual transcription sessions

The Docker image caps backend Whisper at `3` active transcription sessions by default for lightweight parallel demo use. If several people all hit backend Whisper at once, expect slower responses. Browser speech recognition remains the best path for keeping the demo responsive.
