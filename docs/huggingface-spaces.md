# Hugging Face Spaces Deployment

This repo can be deployed as a public Hugging Face `Docker Space` for lightweight demos.

The repository root `Dockerfile` is intentionally the full self-hosted app image. Hugging Face Spaces builds the root file named `Dockerfile`, so deploy the demo image by copying `Dockerfile.hf` to `Dockerfile` in the Space repository or by syncing a Space-specific branch that performs that copy.

## Recommended Demo Setup

- Use **browser Web Speech only** for microphone transcription (no Whisper STT on Spaces).
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
- Transcription is **Browser Speech (microphone) only** — Whisper STT, Device capture, and Browser audio share are disabled.
- Local setup endpoints are disabled.
- The OpenRouter model dropdown lists all free text chat models from OpenRouter, with a fast light default (`inclusionai/ling-3.0-flash:free`) first.
- Users need Chrome or Edge with microphone permission. Without browser speech support, recording stays disabled (no Whisper fallback).

## Expected Limits

On free CPU hardware, this setup is best for:

- casual friend demos
- a few parallel users
- short multilingual microphone sessions via browser speech recognition

Translation and reports still use the configured cloud provider API keys. There is no backend Whisper load on the Space for live transcription.
