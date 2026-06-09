#!/usr/bin/env bash
# Mira — Mistral AI subagent launcher (free tier available).
# Default model: mistral-small-latest. Set MISTRAL_MODEL in .env to override.
#
# Usage: echo "prompt" | bash /path/to/openclaude/bin/mistral.sh [--dangerously-skip-permissions]

SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
CLI="$SCRIPT_DIR/../dist/cli.mjs"
PROMPT=$(cat)

if [[ "$(id -u)" -eq 0 ]]; then
    export IS_SANDBOX=1
fi

if [[ -f "$SCRIPT_DIR/../.env" ]]; then
    set -a; source "$SCRIPT_DIR/../.env"; set +a
fi

echo "$PROMPT" | env \
    CLAUDE_CODE_USE_OPENAI=1 \
    CLAUDE_CODE_USE_GEMINI= \
    GEMINI_MODEL= \
    OPENAI_MODEL="${MISTRAL_MODEL:-mistral-small-latest}" \
    OPENAI_API_KEY="$MISTRAL_API_KEY" \
    OPENAI_BASE_URL=https://api.mistral.ai/v1 \
    NODE_OPTIONS="--max-old-space-size=1024 ${NODE_OPTIONS:-}" \
    node "$CLI" -p --dangerously-skip-permissions "$@"
