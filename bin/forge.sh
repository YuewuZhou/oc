#!/usr/bin/env bash
# Forge — autonomous self-healing coding orchestrator.
#
# Starts an interactive OpenClaude session using Gemini (Greg) as the
# orchestrator brain. Greg dispatches coding subtasks to free providers
# (Groq, OpenRouter, NVIDIA NIM, Mistral, GitHub Models) via ProviderAgent,
# self-heals on rate limits and errors, and iterates until tasks are complete.
#
# Usage:
#   bash ~/openclaude/bin/forge.sh                    # interactive session
#   echo "task" | bash ~/openclaude/bin/forge.sh -p   # one-shot prompt mode

SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
CLI="$SCRIPT_DIR/../dist/cli.mjs"

if [[ "$(id -u)" -eq 0 ]]; then
    export IS_SANDBOX=1
fi

if [[ -f "$SCRIPT_DIR/../.env" ]]; then
    set -a; source "$SCRIPT_DIR/../.env"; set +a
fi

# ── Verify required keys ──────────────────────────────────────────────────────
if [[ -z "$GEMINI_API_KEY" ]]; then
    echo "ERROR: GEMINI_API_KEY not set in .env — Forge uses Gemini as its orchestrator brain." >&2
    exit 1
fi

# ── Report which free providers are ready ────────────────────────────────────
echo "=== Forge — Autonomous Orchestrator ===" >&2
echo "Orchestrator brain : Greg (Gemini ${GEMINI_MODEL:-gemini-2.5-flash-lite})" >&2
echo "Free subagents available:" >&2
[[ -n "$GROQ_API_KEY" ]]       && echo "  ✓ Greta  (Groq    : ${GROQ_MODEL:-llama-3.3-70b-versatile})" >&2    || echo "  ✗ Greta  (Groq)   — set GROQ_API_KEY" >&2
[[ -n "$OPENROUTER_API_KEY" ]] && echo "  ✓ Robin  (OpenRouter: ${OPENROUTER_MODEL:-meta-llama/llama-3.3-70b-instruct:free})" >&2 || echo "  ✗ Robin  (OpenRouter) — set OPENROUTER_API_KEY" >&2
[[ -n "$NVIDIA_API_KEY" ]]     && echo "  ✓ Nina   (NVIDIA NIM: ${NVIDIA_MODEL:-meta/llama-3.3-70b-instruct})" >&2  || echo "  ✗ Nina   (NVIDIA NIM) — set NVIDIA_API_KEY" >&2
[[ -n "$MISTRAL_API_KEY" ]]    && echo "  ✓ Mira   (Mistral : ${MISTRAL_MODEL:-mistral-small-latest})" >&2    || echo "  ✗ Mira   (Mistral)  — set MISTRAL_API_KEY" >&2
[[ -n "$GITHUB_TOKEN" ]]       && echo "  ✓ Gabby  (GitHub Models: ${GITHUB_MODEL:-gpt-4o-mini})" >&2         || echo "  ✗ Gabby  (GitHub Models) — set GITHUB_TOKEN" >&2
echo "" >&2
echo "Type /forge <task> to start autonomous orchestration." >&2
echo "Or just describe what you want — Forge will handle the rest." >&2
echo "=======================================" >&2
echo "" >&2

exec env \
    CLAUDE_CODE_USE_GEMINI=1 \
    GEMINI_MODEL="${GEMINI_MODEL:-gemini-2.5-flash-lite}" \
    OPENAI_API_KEY="$GEMINI_API_KEY" \
    OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai \
    NODE_OPTIONS="--max-old-space-size=1024 ${NODE_OPTIONS:-}" \
    node "$CLI" --dangerously-skip-permissions "$@"
