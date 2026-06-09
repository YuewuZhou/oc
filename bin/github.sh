#!/usr/bin/env bash
# Gabby — GitHub Models subagent launcher (free with GitHub account).
# Default model: gpt-4o-mini. Set GITHUB_MODEL in .env to override.
# Other options: Phi-4, meta-llama/Meta-Llama-3.1-70B-Instruct, mistral-large-2411
#
# Usage: echo "prompt" | bash /path/to/openclaude/bin/github.sh [--dangerously-skip-permissions]

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
    OPENAI_MODEL="${GITHUB_MODEL:-gpt-4o-mini}" \
    OPENAI_API_KEY="$GITHUB_TOKEN" \
    OPENAI_BASE_URL=https://models.inference.ai.azure.com \
    NODE_OPTIONS="--max-old-space-size=1024 ${NODE_OPTIONS:-}" \
    node "$CLI" -p --dangerously-skip-permissions "$@"
