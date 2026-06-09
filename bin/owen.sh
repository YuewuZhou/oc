#!/usr/bin/env bash
# Owen — OpenAI subagent launcher.
# Model is read from OWEN_MODEL in .env (defaults to OPENAI_MODEL, then gpt-4o).
#
# Usage: echo "prompt" | bash /path/to/openclaude/bin/owen.sh [--dangerously-skip-permissions]

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
    OPENAI_MODEL="${OWEN_MODEL:-${OPENAI_MODEL:-gpt-4o}}" \
    node "$CLI" -p --dangerously-skip-permissions "$@"

