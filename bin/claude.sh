#!/usr/bin/env bash
# Claude Code wrapper — sources openclaude/.env so API keys are available.
# Usage: echo "prompt" | bash /path/to/openclaude/bin/claude.sh [--dangerously-skip-permissions]

SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
PROMPT=$(cat)

if [[ "$(id -u)" -eq 0 ]]; then
    export IS_SANDBOX=1
fi

if [[ -f "$SCRIPT_DIR/../.env" ]]; then
    set -a; source "$SCRIPT_DIR/../.env"; set +a
fi

CLAUDE_BIN="${CLAUDE_BIN:-claude}"

echo "$PROMPT" | "$CLAUDE_BIN" -p "$@"
