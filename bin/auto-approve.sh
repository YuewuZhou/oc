#!/usr/bin/env bash
# Greg — Auto-approve subagent launcher (always skips permissions).
#
# Usage: echo "prompt" | bash /path/to/openclaude/bin/auto-approve.sh

SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
CLI="$SCRIPT_DIR/../dist/cli.mjs"
PROMPT=$(cat)

# openclaude's CLI blocks --dangerously-skip-permissions when running as root (uid 0)
# unless IS_SANDBOX=1 is set.
if [[ "$(id -u)" -eq 0 ]]; then
    export IS_SANDBOX=1
fi

# ── Load keys from openclaude/.env ───────────────────────────────────────────
# shellcheck disable=SC1090,SC1091
if [[ -f "$SCRIPT_DIR/../.env" ]]; then
    set -a; source "$SCRIPT_DIR/../.env"; set +a
fi

echo "$PROMPT" | env \
    CLAUDE_CODE_USE_GEMINI=1 \
    GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.1-flash-lite}" \
    OPENAI_API_KEY="$GEMINI_API_KEY" \
    OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai \
    node "$CLI" -p --dangerously-skip-permissions "$@"
