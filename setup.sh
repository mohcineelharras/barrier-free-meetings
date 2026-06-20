#!/usr/bin/env bash
# transcribe-easy — one-command bootstrap for macOS and Linux.
#
# Usage:
#   ./setup.sh            # install deps + write a .env from .env.example
#   ./setup.sh --no-env   # install deps but leave existing .env untouched
#
# This script is intentionally idempotent: re-running it is safe and will
# only re-install or update what is missing.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKIP_ENV=0
for arg in "$@"; do
  case "$arg" in
    --no-env) SKIP_ENV=1 ;;
    -h|--help)
      sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

log()  { printf "\033[1;34m[setup]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn ]\033[0m %s\n" "$*" >&2; }
fail() { printf "\033[1;31m[fail ]\033[0m %s\n" "$*" >&2; exit 1; }

# --- Node.js -----------------------------------------------------------------
require_node() {
  if ! command -v node >/dev/null 2>&1; then
    fail "Node.js is required (>= 20). Install it from https://nodejs.org/ or via 'brew install node'."
  fi
  local major
  major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if [ "$major" -lt 20 ]; then
    fail "Node.js >= 20 is required (you have $(node -v))."
  fi
  log "Node $(node -v) detected."
}

# --- .env --------------------------------------------------------------------
write_env() {
  if [ "$SKIP_ENV" = "1" ]; then
    log "Skipping .env creation (--no-env)."
    return
  fi
  if [ -f "$REPO_ROOT/.env" ]; then
    log ".env already exists, leaving it in place."
    return
  fi
  if [ ! -f "$REPO_ROOT/.env.example" ]; then
    warn ".env.example not found — copy it manually if you want to configure providers."
    return
  fi
  cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
  log "Wrote .env from .env.example. Fill in the API keys you want to use."
}

# --- npm install -------------------------------------------------------------
install_deps() {
  if [ -d "$REPO_ROOT/node_modules" ] && [ -z "${FORCE_INSTALL:-}" ]; then
    log "node_modules already present, skipping install. Set FORCE_INSTALL=1 to re-install."
  else
    log "Running npm install..."
    (cd "$REPO_ROOT" && npm install)
  fi
}

# --- main --------------------------------------------------------------------
require_node
write_env
install_deps

cat <<'EOF'

[setup] transcribe-easy is ready.

  Next steps:
    1. Edit .env and add API keys for the providers you want to use.
    2. Run `npm run dev` to start the dev server on http://localhost:3000.
    3. Run `npm test` to verify the install (requires at least one provider key).

  Optional providers (all independent — pick one or several):
    - OpenRouter       https://openrouter.ai/keys
    - Google AI Studio https://aistudio.google.com/apikey
    - MiniMax          your MiniMax dashboard
    - Ollama (local)   install from https://ollama.com — no API key required

EOF
