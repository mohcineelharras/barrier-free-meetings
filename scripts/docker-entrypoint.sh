#!/usr/bin/env bash
set -euo pipefail

export OLLAMA_HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"
export TRANSCRIBE_EASY_SETUP_MODE="${TRANSCRIBE_EASY_SETUP_MODE:-docker}"

ollama serve &
OLLAMA_PID="$!"

cleanup() {
  kill "$OLLAMA_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[docker] Waiting for Ollama at ${OLLAMA_HOST}"
for _ in $(seq 1 120); do
  if node -e "fetch(process.env.OLLAMA_HOST + '/api/tags').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"; then
    break
  fi
  sleep 1
done

node -e "fetch(process.env.OLLAMA_HOST + '/api/tags').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

npm run setup:verify

exec npm run preview
