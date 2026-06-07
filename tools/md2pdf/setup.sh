#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
VENV="$SCRIPT_DIR/venv"
BIN_LINK="$HOME/.local/bin/pdf"

echo "==> Setting up md2pdf..."

# 1. Create venv and install dependencies
if [[ ! -x "$VENV/bin/python" ]]; then
  echo "    Creating Python venv at $VENV"
  python3 -m venv "$VENV"
fi
echo "    Installing Python packages (markdown, weasyprint)..."
"$VENV/bin/pip" install --quiet --upgrade markdown weasyprint

# 2. Symlink the pdf command into ~/.local/bin
mkdir -p "$(dirname "$BIN_LINK")"
ln -sf "$SCRIPT_DIR/pdf" "$BIN_LINK"
echo "    Symlinked: $BIN_LINK -> $SCRIPT_DIR/pdf"

# 3. Ensure ~/.local/bin is in PATH via ~/.bashrc
EXPORT_LINE='export PATH="$HOME/.local/bin:$PATH"'
BASHRC="$HOME/.bashrc"
if ! grep -qF "$EXPORT_LINE" "$BASHRC" 2>/dev/null; then
  echo "" >> "$BASHRC"
  echo "# md2pdf: ensure ~/.local/bin is in PATH" >> "$BASHRC"
  echo "$EXPORT_LINE" >> "$BASHRC"
  echo "    Added to $BASHRC:"
  echo "        $EXPORT_LINE"
else
  echo "    $BASHRC already exports ~/.local/bin — skipping"
fi

echo ""
echo "Done. Usage: pdf <file.md> [output.pdf]"
echo "Restart your shell (or run: source ~/.bashrc) for the alias to take effect in new sessions."
