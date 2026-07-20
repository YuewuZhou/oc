#!/usr/bin/env bash
# Peter — DeepSeek V4 Pro subagent launcher.
#
# Usage: echo "prompt" | bash /path/to/openclaude/bin/peter.sh [--dangerously-skip-permissions]

SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
CLI="$SCRIPT_DIR/../dist/cli.mjs"
PROMPT=$(cat)

# ── Recursion guard ───────────────────────────────────────────────────────────
if [[ "${OPENCLAUDE_DEPTH:-0}" -gt 0 ]]; then
    echo "ERROR: peter.sh cannot be invoked from within a Derek or Greg subagent (OPENCLAUDE_DEPTH=${OPENCLAUDE_DEPTH}). Perform research directly using your built-in tools — do NOT invoke any skills or subagents." >&2
    exit 1
fi
export OPENCLAUDE_DEPTH=1

# Hard process-count failsafe: abort if too many cli.mjs processes are already running.
RUNNING=$(pgrep -f "dist/cli.mjs" 2>/dev/null | wc -l)
if [[ "$RUNNING" -gt 25 ]]; then
    echo "ERROR: Too many openclaude processes already running ($RUNNING). Aborting to prevent runaway recursion." >&2
    exit 1
fi

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
    OPENAI_MODEL="${DEEPSEEK_PRO_MODEL:-deepseek-v4-pro}" \
    OPENAI_API_KEY="$DEEPSEEK_API_KEY" \
    OPENAI_BASE_URL=https://api.deepseek.com/v1 \
    OPENAI_SEARCH_API_KEY="${OPENAI_API_KEY}" \
    CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 \
    node "$CLI" -p --dangerously-skip-permissions "$@"
