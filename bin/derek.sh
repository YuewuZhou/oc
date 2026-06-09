#!/usr/bin/env bash
# Derek — DeepSeek subagent launcher.
#
# Usage: echo "prompt" | bash /path/to/openclaude/bin/derek.sh [--dangerously-skip-permissions]

SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
CLI="$SCRIPT_DIR/../dist/cli.mjs"
PROMPT=$(cat)

# openclaude's CLI blocks --dangerously-skip-permissions when running as root (uid 0)
# unless IS_SANDBOX=1 is set. Export it automatically so invocations work in this env.
if [[ "$(id -u)" -eq 0 ]]; then
    export IS_SANDBOX=1
fi

# ── Load keys from openclaude/.env ───────────────────────────────────────────
# shellcheck disable=SC1090,SC1091
if [[ -f "$SCRIPT_DIR/../.env" ]]; then
    set -a; source "$SCRIPT_DIR/../.env"; set +a
fi

echo "$PROMPT" | env \
    CLAUDE_CODE_USE_OPENAI=1 \
    CLAUDE_CODE_USE_GEMINI= \
    GEMINI_MODEL= \
    OPENAI_MODEL="${DEEPSEEK_MODEL:-deepseek-v4-flash}" \
    OPENAI_API_KEY="$DEEPSEEK_API_KEY" \
    OPENAI_BASE_URL=https://api.deepseek.com/v1 \
    node "$CLI" -p --dangerously-skip-permissions "$@"
