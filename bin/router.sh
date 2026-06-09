#!/usr/bin/env bash
# Robin — OpenRouter subagent launcher (many free :free models).
# Default model: meta-llama/llama-3.3-70b-instruct:free. Set OPENROUTER_MODEL in .env to override.
#
# Usage: echo "prompt" | bash /path/to/openclaude/bin/router.sh [--dangerously-skip-permissions]

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
    OPENAI_MODEL="${OPENROUTER_MODEL:-meta-llama/llama-3.3-70b-instruct:free}" \
    OPENAI_API_KEY="$OPENROUTER_API_KEY" \
    OPENAI_BASE_URL=https://openrouter.ai/api/v1 \
    NODE_OPTIONS="--max-old-space-size=1024 ${NODE_OPTIONS:-}" \
    node "$CLI" -p --dangerously-skip-permissions "$@"
