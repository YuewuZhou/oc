#!/usr/bin/env bash
# setup-new-machine.sh — Bootstrap openclaude and all tools on a fresh machine.
#
# Usage:
#   cd ~/openclaude
#   bash setup-new-machine.sh
#
# After this runs, the only thing left to do is:
#   Fill in ~/openclaude/.env with your API keys

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  openclaude new-machine setup"
echo "  repo: $REPO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Build openclaude CLI ───────────────────────────────────────────────────
echo "[1/3] Building openclaude CLI..."
if ! command -v bun &>/dev/null; then
    echo "  bun not found — installing..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
fi
cd "$REPO"
bun install --frozen-lockfile
bun run build
echo "  ✓ dist/cli.mjs built"
echo ""

# ── 2. Python tool venvs ──────────────────────────────────────────────────────
echo "[2/3] Setting up Python tool environments..."

setup_venv() {
    local dir="$1" packages="$2"
    echo "  • tools/$dir"
    cd "$REPO/tools/$dir"
    [[ -d venv ]] || python3 -m venv venv
    if [[ -f requirements.txt ]]; then
        venv/bin/pip install -q -r requirements.txt
    else
        # shellcheck disable=SC2086
        venv/bin/pip install -q $packages
    fi
}

setup_venv "search" "openai python-dotenv"
setup_venv "gemini" "google-genai python-dotenv"
setup_venv "email"  ""   # has requirements.txt (includes python-dotenv)

echo "  ✓ all venvs ready"
echo ""

# ── 3. Generate ~/CLAUDE.md from template ────────────────────────────────────
echo "[3/4] Writing ~/CLAUDE.md..."
CLAUDE_MD="$HOME/CLAUDE.md"
if [[ -f "$CLAUDE_MD" ]]; then
    echo "  ~/CLAUDE.md already exists — skipping (delete it to regenerate)"
else
    sed "s|<OPENCLAUDE_PATH>|$REPO|g" "$REPO/PARENT_CLAUDE.md" \
        | grep -v '^# PARENT_CLAUDE' \
        | grep -v '^# Template' \
        | grep -v '^# Copy to' \
        | grep -v '^#   sed' \
        | sed '/^---$/d' \
        > "$CLAUDE_MD"
    echo "  ✓ ~/CLAUDE.md written"
fi
echo ""

# ── 4. Create .env if missing ─────────────────────────────────────────────────
echo "[4/4] Checking $REPO/.env..."
if [[ -f "$REPO/.env" ]]; then
    echo "  .env already exists — skipping"
else
    cp "$REPO/.env.example" "$REPO/.env"
    echo "  ✓ .env created from template"
fi
echo ""

# ── Done ──────────────────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Setup complete!"
echo ""
echo "  Next step:"
echo "  Fill in $REPO/.env with your API keys"
echo "     Required: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY"
echo "     Email:    SMTP_PASS, SMTP_USER, IMAP_PASS, IMAP_USER"
echo ""
echo "  Then test:"
echo "     echo 'say hello' | bash $REPO/bin/greg.sh"
echo "     $REPO/tools/search/search 'python latest version'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
