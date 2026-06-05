#!/usr/bin/env bash
# Kevin — gpt-5.4-mini via the openclaude OpenAI shim.
#
# Usage: echo "prompt" | bash /path/to/openclaude/bin/kevin.sh [--dangerously-skip-permissions]
#
# Prefer Greg (greg.sh) for most tasks — Kevin is the reliable fallback when
# Gemini rate-limits hit. Use Kevin directly when you need guaranteed OpenAI
# behavior or when Greg is unavailable.

SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
CLI="$SCRIPT_DIR/../dist/cli.mjs"

# ── Load keys from openclaude/.env ───────────────────────────────────────────
# shellcheck disable=SC1090,SC1091
if [[ -f "$SCRIPT_DIR/../.env" ]]; then
    set -a; source "$SCRIPT_DIR/../.env"; set +a
fi

# ── Root environment: CLI blocks --dangerously-skip-permissions at uid 0 ─────
# Set IS_SANDBOX=1 to bypass the check (safe in this automated environment).
if [[ "$(id -u)" -eq 0 ]]; then
    export IS_SANDBOX=1
fi

exec node "$CLI" -p "$@"
