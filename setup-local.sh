#!/usr/bin/env bash
# Barrier-Free Meetings — offline-oriented bootstrap for macOS and Linux.
#
# Installs npm deps, writes .env, builds the frontend, optionally ensures
# Ollama + a small translation model, and downloads required Whisper models.
#
# Usage:
#   ./setup-local.sh
#   ./setup-local.sh --skip-ollama
#   ./setup-local.sh --skip-whisper

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

SKIP_OLLAMA=0
SKIP_WHISPER=0
for arg in "$@"; do
  case "$arg" in
    --skip-ollama) SKIP_OLLAMA=1 ;;
    --skip-whisper) SKIP_WHISPER=1 ;;
    -h|--help)
      sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

log()  { printf "\033[1;34m[setup]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn ]\033[0m %s\n" "$*" >&2; }
fail() { printf "\033[1;31m[fail ]\033[0m %s\n" "$*" >&2; exit 1; }

require_node() {
  if ! command -v node >/dev/null 2>&1; then
    fail "Node.js >= 20 is required. Install from https://nodejs.org/ or via your package manager."
  fi
  local major
  major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if [ "$major" -lt 20 ]; then
    fail "Node.js >= 20 is required (you have $(node -v))."
  fi
  log "Node $(node -v) detected."
}

write_env() {
  if [ -f "$REPO_ROOT/.env" ]; then
    log ".env already exists, leaving it in place."
    return
  fi
  if [ -f "$REPO_ROOT/.env.example" ]; then
    cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
    log "Wrote .env from .env.example."
  else
    warn ".env.example not found — configure providers manually if needed."
  fi
}

install_deps() {
  if [ -d "$REPO_ROOT/node_modules" ] && [ -z "${FORCE_INSTALL:-}" ]; then
    log "node_modules already present (set FORCE_INSTALL=1 to reinstall)."
  else
    log "Running npm install..."
    npm install
  fi
}

build_frontend() {
  if [ -f "$REPO_ROOT/dist/index.html" ] && [ -z "${FORCE_BUILD:-}" ]; then
    log "Frontend already built (set FORCE_BUILD=1 to rebuild)."
  else
    log "Building frontend..."
    VITE_DEFAULT_PROVIDER="${VITE_DEFAULT_PROVIDER:-ollama}" npm run build
  fi
}

ensure_ollama() {
  if [ "$SKIP_OLLAMA" = "1" ]; then
    log "Skipping Ollama (--skip-ollama)."
    return
  fi

  if ! command -v ollama >/dev/null 2>&1; then
    warn "Ollama not found on PATH."
    warn "Install from https://ollama.com (or brew install ollama), then re-run this script."
    warn "Offline translation will be unavailable until Ollama is installed."
    return
  fi

  log "Ollama found: $(command -v ollama)"

  STARTED_OLLAMA=0
  OLLAMA_PID=""
  if ! curl -fsS --max-time 2 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
    log "Starting Ollama server..."
    ollama serve >/tmp/barrier-free-meetings-ollama.log 2>&1 &
    OLLAMA_PID=$!
    STARTED_OLLAMA=1
    for _ in $(seq 1 45); do
      if curl -fsS --max-time 2 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    if ! curl -fsS --max-time 2 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
      warn "Ollama did not become ready. See /tmp/barrier-free-meetings-ollama.log"
      kill "$OLLAMA_PID" 2>/dev/null || true
      return
    fi
  fi

  if ! curl -fsS --max-time 2 "http://127.0.0.1:11434/api/tags" | grep -q 'qwen3.5:0.8b'; then
    log "Pulling translation model qwen3.5:0.8b..."
    ollama pull qwen3.5:0.8b || warn "Model pull failed — you can retry later with: ollama pull qwen3.5:0.8b"
  else
    log "Translation model qwen3.5:0.8b already available."
  fi

  if [ "$STARTED_OLLAMA" = "1" ] && [ -n "$OLLAMA_PID" ]; then
    log "Stopping temporary Ollama server (start-local.sh will restart it)."
    kill "$OLLAMA_PID" 2>/dev/null || true
  fi
}

download_whisper() {
  if [ "$SKIP_WHISPER" = "1" ]; then
    log "Skipping Whisper download (--skip-whisper)."
    return
  fi

  local cache="$HOME/.transcribe-easy/transformers-cache/onnx-community"
  if [ -f "$cache/whisper-tiny_timestamped/onnx/encoder_model.onnx" ] \
    && [ -f "$cache/whisper-base_timestamped/onnx/encoder_model.onnx" ]; then
    log "Required Whisper models already cached."
    return
  fi

  log "Downloading required Whisper models (tiny, base)..."
  if ! npx tsx scripts/download-whisper-models.ts; then
    warn "Whisper download failed — the app will retry on first use."
  fi
}

require_node
write_env
install_deps
build_frontend
ensure_ollama
download_whisper

cat <<'EOF'

[setup] Barrier-Free Meetings local setup is ready.

  Next steps:
    ./start-local.sh          # production-style local launch
    npm run dev               # hot-reload development
    npm run doctor            # verify Ollama / Whisper / build

EOF
