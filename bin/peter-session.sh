#!/usr/bin/env bash
# Peter — interactive DeepSeek V4 Pro session.
#
# Usage: peter [<cli args>]

SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
CLI="$SCRIPT_DIR/../dist/cli.mjs"

# ── Load keys from openclaude/.env ───────────────────────────────────────────
# shellcheck disable=SC1090,SC1091
if [[ -f "$SCRIPT_DIR/../.env" ]]; then
    set -a; source "$SCRIPT_DIR/../.env"; set +a
fi

exec env \
    CLAUDE_CODE_USE_OPENAI=1 \
    CLAUDE_CODE_USE_GEMINI= \
    GEMINI_MODEL= \
    OPENAI_MODEL="${DEEPSEEK_PRO_MODEL:-deepseek-v4-pro}" \
    OPENAI_API_KEY="$DEEPSEEK_API_KEY" \
    OPENAI_BASE_URL=https://api.deepseek.com/v1 \
    OPENAI_SEARCH_API_KEY="${OPENAI_API_KEY}" \
    OPENCLAUDE_LAUNCH_CWD="$PWD" \
    node "$CLI" "$@"
