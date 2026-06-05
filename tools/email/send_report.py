#!/usr/bin/env python3
"""
CLI wrapper: pipe a report body into this to send it as an email.

Usage:
  echo "body text" | python3 send_report.py recipient@email.com "Subject line"
  /path/to/openclaude/tools/search/search "topic" | python3 send_report.py you@gmail.com "Weekly Report"
  cat report.txt | python3 send_report.py you@gmail.com "Report" --html
"""
import argparse
import asyncio
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

from sender import send_email


def text_to_html(text: str) -> str:
    lines = text.splitlines()
    html_lines = []
    for line in lines:
        if line.startswith("# "):
            html_lines.append(f"<h2>{line[2:]}</h2>")
        elif line.startswith("## "):
            html_lines.append(f"<h3>{line[3:]}</h3>")
        elif line.startswith("- ") or line.startswith("* "):
            html_lines.append(f"<li>{line[2:]}</li>")
        elif line.strip() == "":
            html_lines.append("<br>")
        else:
            html_lines.append(f"<p>{line}</p>")
    return "\n".join(html_lines)


async def main():
    parser = argparse.ArgumentParser(description="Send a report email from stdin")
    parser.add_argument("to", help="Recipient email address")
    parser.add_argument("subject", help="Email subject")
    parser.add_argument("--html", action="store_true", help="Treat input as raw HTML")
    args = parser.parse_args()

    body_text = sys.stdin.read().strip()
    if not body_text:
        print("Error: no body text on stdin", file=sys.stderr)
        sys.exit(1)

    html_body = body_text if args.html else text_to_html(body_text)

    await send_email(
        to=args.to,
        subject=args.subject,
        html_body=html_body,
        text_body=body_text,
    )
    print(f"Sent '{args.subject}' to {args.to}")


if __name__ == "__main__":
    asyncio.run(main())
