#!/usr/bin/env bash
set -euo pipefail

# md2pdf — convert a Markdown file to PDF and copy to Windows Downloads.
# Primary backend: venv Python (markdown + weasyprint), self-contained.
# Fallbacks: pandoc, wkhtmltopdf, chromium headless, md-to-pdf (npm).

DEST_DIR="/mnt/c/Users/Zack/Downloads"
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
VENV_PYTHON="$SCRIPT_DIR/venv/bin/python"
PY_SCRIPT="$SCRIPT_DIR/md2pdf.py"

usage() {
  echo "Usage: pdf <file.md> [output.pdf]"
  echo "  Converts a Markdown file to PDF and copies it to $DEST_DIR"
  exit 1
}

die() { echo "error: $*" >&2; exit 1; }

[[ $# -lt 1 ]] && usage
[[ "$1" == "-h" || "$1" == "--help" ]] && usage

INPUT="$(realpath "$1")"
[[ ! -f "$INPUT" ]] && die "file not found: $1"

BASENAME="$(basename "$INPUT" .md)"
if [[ $# -ge 2 ]]; then
  OUTPUT="$(realpath -m "$2")"
else
  OUTPUT="$(dirname "$INPUT")/${BASENAME}.pdf"
fi

# ── backend helpers ───────────────────────────────────────────────────────────

convert_weasyprint() {
  echo "Using backend: weasyprint (python)"
  "$VENV_PYTHON" "$PY_SCRIPT" "$INPUT" "$OUTPUT"
}

convert_pandoc() {
  echo "Using backend: pandoc"
  if command -v xelatex &>/dev/null || command -v pdflatex &>/dev/null; then
    pandoc "$INPUT" -o "$OUTPUT" --pdf-engine=xelatex -V geometry:margin=1in 2>/dev/null \
      || pandoc "$INPUT" -o "$OUTPUT" -V geometry:margin=1in
  elif command -v weasyprint &>/dev/null; then
    pandoc "$INPUT" -o "$OUTPUT" --pdf-engine=weasyprint
  else
    pandoc "$INPUT" -o "$OUTPUT"
  fi
}

convert_wkhtmltopdf() {
  echo "Using backend: wkhtmltopdf"
  local TMP_HTML
  TMP_HTML="$(mktemp --suffix=.html)"
  trap 'rm -f "$TMP_HTML"' RETURN
  {
    echo '<!DOCTYPE html><html><head><meta charset="utf-8">'
    echo '<style>body{font-family:sans-serif;max-width:800px;margin:40px auto;line-height:1.6}pre,code{background:#f4f4f4;padding:2px 6px}</style>'
    echo '</head><body>'
    if command -v pandoc &>/dev/null; then
      pandoc -f markdown -t html "$INPUT"
    else
      echo '<pre>'; cat "$INPUT"; echo '</pre>'
    fi
    echo '</body></html>'
  } > "$TMP_HTML"
  wkhtmltopdf --quiet "$TMP_HTML" "$OUTPUT"
}

convert_chromium() {
  local BIN
  BIN="$(command -v chromium-browser 2>/dev/null || command -v chromium 2>/dev/null \
    || command -v google-chrome 2>/dev/null || command -v google-chrome-stable 2>/dev/null)"
  echo "Using backend: chromium ($BIN)"
  local TMP_HTML
  TMP_HTML="$(mktemp --suffix=.html)"
  trap 'rm -f "$TMP_HTML"' RETURN
  {
    echo '<!DOCTYPE html><html><head><meta charset="utf-8">'
    echo '<style>body{font-family:sans-serif;max-width:800px;margin:40px auto;line-height:1.6}pre,code{background:#f4f4f4;padding:2px 4px}</style>'
    echo '</head><body>'
    if command -v pandoc &>/dev/null; then
      pandoc -f markdown -t html "$INPUT"
    else
      echo '<pre>'; cat "$INPUT"; echo '</pre>'
    fi
    echo '</body></html>'
  } > "$TMP_HTML"
  "$BIN" --headless --disable-gpu --no-sandbox \
    --print-to-pdf="$OUTPUT" "file://$TMP_HTML" 2>/dev/null
}

# ── pick backend ─────────────────────────────────────────────────────────────

if [[ -x "$VENV_PYTHON" && -f "$PY_SCRIPT" ]]; then
  convert_weasyprint
elif command -v pandoc &>/dev/null; then
  convert_pandoc
elif command -v wkhtmltopdf &>/dev/null; then
  convert_wkhtmltopdf
elif command -v chromium-browser &>/dev/null \
  || command -v chromium &>/dev/null \
  || command -v google-chrome &>/dev/null \
  || command -v google-chrome-stable &>/dev/null; then
  convert_chromium
else
  die "No PDF backend found. Run: python3 -m venv $SCRIPT_DIR/venv && $SCRIPT_DIR/venv/bin/pip install markdown weasyprint"
fi

[[ ! -f "$OUTPUT" ]] && die "PDF was not created at $OUTPUT"
echo "PDF written to: $OUTPUT"

# ── copy to Windows Downloads if available ───────────────────────────────────
if [[ -d "$DEST_DIR" ]]; then
  cp "$OUTPUT" "$DEST_DIR/"
  echo "Copied to: $DEST_DIR/$(basename "$OUTPUT")"
else
  echo "Note: $DEST_DIR not found — skipping Windows copy"
fi
