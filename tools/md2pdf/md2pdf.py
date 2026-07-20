#!/usr/bin/env python3
"""Convert a Markdown file to PDF using markdown + weasyprint."""
import sys
import os
import argparse
import markdown
import weasyprint

CSS = """
@page { margin: 1in; }
body {
    font-family: "Segoe UI", "DejaVu Sans", "Liberation Sans", "Droid Sans Fallback", Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #222;
    max-width: 100%;
}
h1, h2, h3, h4, h5, h6 {
    color: #111;
    margin-top: 1.4em;
    margin-bottom: 0.4em;
    line-height: 1.2;
}
h1 { font-size: 2em; border-bottom: 2px solid #ddd; padding-bottom: 0.2em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.1em; }
h3 { font-size: 1.2em; }
pre {
    background: #f6f8fa;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 0.8em 1em;
    overflow-x: auto;
    font-size: 9pt;
}
code {
    background: #f0f0f0;
    border-radius: 3px;
    padding: 0.1em 0.3em;
    font-size: 9pt;
}
pre code { background: none; padding: 0; }
blockquote {
    border-left: 4px solid #ccc;
    padding-left: 1em;
    margin-left: 0;
    color: #555;
}
table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
}
th, td {
    border: 1px solid #ddd;
    padding: 0.4em 0.7em;
    text-align: left;
}
th { background: #f0f0f0; font-weight: bold; }
tr:nth-child(even) { background: #fafafa; }
a { color: #0366d6; }
img { max-width: 100%; }
hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
"""

EXTENSIONS = [
    "extra",        # tables, footnotes, attr_list, etc.
    "codehilite",
    "toc",
    "nl2br",
    "sane_lists",
]

def main():
    parser = argparse.ArgumentParser(description="Convert Markdown to PDF")
    parser.add_argument("input", help="Input .md file")
    parser.add_argument("output", help="Output .pdf file")
    args = parser.parse_args()

    with open(args.input, encoding="utf-8") as f:
        md_text = f.read()

    html_body = markdown.markdown(md_text, extensions=EXTENSIONS)
    html = f"<!DOCTYPE html><html><head><meta charset='utf-8'></head><body>{html_body}</body></html>"

    base_url = f"file://{os.path.abspath(os.path.dirname(args.input))}/"
    doc = weasyprint.HTML(string=html, base_url=base_url)
    stylesheet = weasyprint.CSS(string=CSS)
    doc.write_pdf(args.output, stylesheets=[stylesheet])

if __name__ == "__main__":
    main()
