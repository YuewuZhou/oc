#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
VENV="$SCRIPT_DIR/venv"
BIN_PDF="$HOME/.local/bin/pdf"
BIN_MD2PDF="$HOME/.local/bin/md2pdf"

echo "==> Setting up md2pdf..."

# 1. Create venv and install dependencies
if [[ ! -x "$VENV/bin/python" ]]; then
  echo "    Creating Python venv at $VENV"
  python3 -m venv "$VENV"
fi
echo "    Installing Python packages (markdown, weasyprint)..."
"$VENV/bin/pip" install --quiet --upgrade markdown weasyprint

# 2. Symlink pdf and md2pdf commands into ~/.local/bin
mkdir -p "$HOME/.local/bin"
ln -sf "$SCRIPT_DIR/pdf" "$BIN_PDF"
echo "    Symlinked: $BIN_PDF -> $SCRIPT_DIR/pdf"
ln -sf "$SCRIPT_DIR/pdf" "$BIN_MD2PDF"
echo "    Symlinked: $BIN_MD2PDF -> $SCRIPT_DIR/pdf"

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
echo "Done. Usage: pdf <file.md> [output.pdf]  (also available as: md2pdf)"
echo "Restart your shell (or run: source ~/.bashrc) for the alias to take effect in new sessions."
