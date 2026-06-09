#!/usr/bin/env bash
# Greta — Groq subagent launcher (free tier, ultra-fast inference).
# Default model: llama-3.3-70b-versatile (free). Set GROQ_MODEL in .env to override.
#
# Usage: echo "prompt" | bash /path/to/openclaude/bin/groq.sh [--dangerously-skip-permissions]

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
    OPENAI_MODEL="${GROQ_MODEL:-llama-3.3-70b-versatile}" \
    OPENAI_API_KEY="$GROQ_API_KEY" \
    OPENAI_BASE_URL=https://api.groq.com/openai/v1 \
    NODE_OPTIONS="--max-old-space-size=1024 ${NODE_OPTIONS:-}" \
    node "$CLI" -p --dangerously-skip-permissions "$@"
