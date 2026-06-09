#!/usr/bin/env bash
# Nina — NVIDIA NIM subagent launcher (free credits, powerful open models).
# Default model: meta/llama-3.3-70b-instruct. Set NVIDIA_MODEL in .env to override.
#
# Usage: echo "prompt" | bash /path/to/openclaude/bin/nim.sh [--dangerously-skip-permissions]

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
    OPENAI_MODEL="${NVIDIA_MODEL:-meta/llama-3.3-70b-instruct}" \
    OPENAI_API_KEY="$NVIDIA_API_KEY" \
    OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1 \
    NODE_OPTIONS="--max-old-space-size=1024 ${NODE_OPTIONS:-}" \
    node "$CLI" -p --dangerously-skip-permissions "$@"
