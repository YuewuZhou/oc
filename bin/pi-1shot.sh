#!/usr/bin/env bash
# Bounded, non-interactive pi run. Loads DEEPSEEK_API_KEY from openclaude/.env,
# then delegates to pi-1shot.mjs which enforces a turn cap + wall-clock timeout
# via pi's RPC mode (pi itself has no built-in loop guard).
#
# Usage: bash bin/pi-1shot.sh "your prompt" [--max-turns 40] [--timeout-ms 900000] [--cwd /path]

SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
PROMPT="$1"
shift || true

if [[ -z "$PROMPT" ]]; then
    echo "usage: pi-1shot.sh \"prompt\" [--max-turns N] [--timeout-ms N] [--cwd path]" >&2
    exit 3
fi

# shellcheck disable=SC1090,SC1091
if [[ -f "$SCRIPT_DIR/../.env" ]]; then
    set -a; source "$SCRIPT_DIR/../.env"; set +a
fi

exec node "$SCRIPT_DIR/../tools/pi/pi-1shot.mjs" --prompt "$PROMPT" "$@"
