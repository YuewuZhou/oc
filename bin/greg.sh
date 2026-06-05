#!/usr/bin/env bash
# Greg — gemini-3.1-flash-lite with API key rotation + Kevin fallback.
#
# Usage: echo "prompt" | bash /path/to/openclaude/bin/greg.sh [--dangerously-skip-permissions]
#
# Key rotation:
#   Set GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, ... in openclaude/.env
#   Greg round-robins across all available keys before falling back to Kevin.
#   Add new keys by adding GEMINI_API_KEY_4, etc. — no other changes needed.
#
# Rotation state tracked in /tmp/greg_key_rotation (index of last-used key).

SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
CLI="$SCRIPT_DIR/../dist/cli.mjs"
PROMPT=$(cat)
GREG_ARGS=("$@")   # save before any function stomps $@

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

# ── Collect all available Gemini keys ────────────────────────────────────────
# Supports both naming conventions:
#   GEMINI_API_KEY_2, GEMINI_API_KEY_3, ...  (underscore-separated)
#   GEMINI_API_KEY2,  GEMINI_API_KEY3,  ...  (no separator)
# Add new keys in either format — Greg discovers them automatically.
# To add a 3rd key: set GEMINI_API_KEY_3 or GEMINI_API_KEY3 in any of the above files.
GEMINI_KEYS=()
_add_key() { [[ -n "$1" ]] && GEMINI_KEYS+=("$1"); }

_add_key "$GEMINI_API_KEY"
for i in $(seq 2 20); do
    v_under="GEMINI_API_KEY_${i}";  _add_key "${!v_under}"   # GEMINI_API_KEY_2 style
    v_plain="GEMINI_API_KEY${i}";   _add_key "${!v_plain}"   # GEMINI_API_KEY2 style
done
# Deduplicate (in case same key is set under both names)
readarray -t GEMINI_KEYS < <(printf '%s\n' "${GEMINI_KEYS[@]}" | sort -u)

# ── Helper: try one Gemini key, return 0 on success / 1 on rate-limit ────────
try_gemini_key() {
    local key="$1" label="$2"
    local out err
    out=$(mktemp); err=$(mktemp)

    echo "$PROMPT" | env \
        CLAUDE_CODE_USE_GEMINI=1 \
        GEMINI_MODEL=gemini-3.1-flash-lite \
        OPENAI_API_KEY="$key" \
        OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai \
        node "$CLI" -p "${GREG_ARGS[@]}" >"$out" 2>"$err"
    local code=$?

    if grep -qi "429\|RESOURCE_EXHAUSTED\|quota.exceeded\|rate.limit" "$out" "$err" 2>/dev/null; then
        echo "[Greg] $label rate-limited, trying next..." >&2
        rm -f "$out" "$err"
        return 1
    fi

    cat "$out"; cat "$err" >&2
    rm -f "$out" "$err"
    exit "$code"   # success — propagate exit code to caller
}

# ── No Gemini keys at all → go straight to Kevin ─────────────────────────────
if [[ ${#GEMINI_KEYS[@]} -eq 0 ]]; then
    echo "[Greg] No Gemini API keys found, using Kevin." >&2
    echo "$PROMPT" | node "$CLI" -p "${GREG_ARGS[@]}"
    exit $?
fi

# ── Round-robin: pick starting key, rotating from last used ──────────────────
ROTATION_FILE="/tmp/greg_key_rotation"
num_keys=${#GEMINI_KEYS[@]}

last_idx=-1
[[ -f "$ROTATION_FILE" ]] && last_idx=$(cat "$ROTATION_FILE" 2>/dev/null || echo "-1")
start_idx=$(( (last_idx + 1) % num_keys ))
echo "$start_idx" > "$ROTATION_FILE"   # persist for next caller

# ── Try each key in rotation order ───────────────────────────────────────────
for offset in $(seq 0 $((num_keys - 1))); do
    idx=$(( (start_idx + offset) % num_keys ))
    key="${GEMINI_KEYS[$idx]}"
    label="gemini-3.1-flash-lite [key $((idx + 1))/$num_keys]"
    try_gemini_key "$key" "$label"   # exits on success; returns 1 on rate-limit
done

# ── All Gemini keys exhausted → Kevin ────────────────────────────────────────
echo "[Greg] All Gemini keys exhausted, using Kevin." >&2
echo "$PROMPT" | node "$CLI" -p "${GREG_ARGS[@]}"
