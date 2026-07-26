#!/usr/bin/env bash
# Barrier-Free Meetings — local production launcher for macOS and Linux.
# Run ./setup-local.sh first if you have not already.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

log()  { printf "\033[1;34m[start]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn ]\033[0m %s\n" "$*" >&2; }
fail() { printf "\033[1;31m[fail ]\033[0m %s\n" "$*" >&2; exit 1; }

if ! command -v node >/dev/null 2>&1; then
  fail "Node.js not found. Run ./setup-local.sh or install Node.js >= 20."
fi

if [ ! -f "$REPO_ROOT/dist/index.html" ]; then
  fail "Frontend not built. Run ./setup-local.sh first."
fi

export NODE_ENV=production
export HOST="${HOST:-127.0.0.1}"
export DISABLE_AUTO_SETUP="${DISABLE_AUTO_SETUP:-true}"
export TRANSCRIBE_EASY_SETUP_MODE="${TRANSCRIBE_EASY_SETUP_MODE:-disabled}"
export OLLAMA_HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"
export DEFAULT_WHISPER_MODEL="${DEFAULT_WHISPER_MODEL:-tiny}"
export REQUIRED_OLLAMA_MODELS="${REQUIRED_OLLAMA_MODELS:-qwen3.5:0.8b}"
export OPTIONAL_OLLAMA_MODELS="${OPTIONAL_OLLAMA_MODELS:-qwen3.5:2b}"
export REQUIRED_WHISPER_MODELS="${REQUIRED_WHISPER_MODELS:-tiny,base}"

OLLAMA_PID=""
cleanup() {
  if [ -n "$OLLAMA_PID" ] && kill -0 "$OLLAMA_PID" 2>/dev/null; then
    kill "$OLLAMA_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if curl -fsS --max-time 2 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
  log "Ollama already running."
elif command -v ollama >/dev/null 2>&1; then
  log "Starting Ollama..."
  ollama serve >/tmp/barrier-free-meetings-ollama.log 2>&1 &
  OLLAMA_PID=$!
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 2 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
      log "Ollama ready."
      break
    fi
    sleep 1
  done
  if ! curl -fsS --max-time 2 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
    warn "Ollama slow to start — translation may be unavailable. See /tmp/barrier-free-meetings-ollama.log"
  fi
else
  warn "Ollama not found — translation will be unavailable until it is installed."
fi

# Open the browser once the server responds (best-effort).
(
  for _ in $(seq 1 45); do
    if curl -fsS --max-time 2 "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
      if command -v open >/dev/null 2>&1; then
        open "http://127.0.0.1:3000" || true
      elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "http://127.0.0.1:3000" || true
      fi
      exit 0
    fi
    sleep 1
  done
) &

log "Starting app server on http://127.0.0.1:3000 (Ctrl+C to stop)."
npm run preview
