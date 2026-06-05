#!/usr/bin/env python3
"""
Standalone web search tool.
Usage:
  search "your query"
  echo "your query" | search
  search "query" --json          # raw JSON output
  search "query" --limit 5       # max results (default 5)
"""
import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

from openai import OpenAI


def search(query: str, limit: int = 5) -> list[dict]:
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    response = client.chat.completions.create(
        model="gpt-4o-search-preview",
        messages=[
            {
                "role": "user",
                "content": (
                    f"Search the web for: {query}\n\n"
                    f"Return up to {limit} results. "
                    "For each result include: title, one-sentence summary, and URL."
                ),
            }
        ],
        web_search_options={},
    )
    content = response.choices[0].message.content or ""
    annotations = getattr(response.choices[0].message, "annotations", []) or []
    results = []
    for ann in annotations:
        if getattr(ann, "type", "") == "url_citation":
            results.append(
                {
                    "title": getattr(ann, "title", ""),
                    "url": getattr(ann, "url", ""),
                    "snippet": "",
                }
            )
    return {"text": content, "sources": results[:limit]}


def main():
    parser = argparse.ArgumentParser(description="Web search via gpt-4o-search-preview")
    parser.add_argument("query", nargs="*", help="Search query (or pipe via stdin)")
    parser.add_argument("--json", action="store_true", dest="as_json", help="Output raw JSON")
    parser.add_argument("--limit", type=int, default=5, help="Max results (default 5)")
    args = parser.parse_args()

    if args.query:
        query = " ".join(args.query)
    elif not sys.stdin.isatty():
        query = sys.stdin.read().strip()
    else:
        parser.print_help()
        sys.exit(1)

    result = search(query, limit=args.limit)

    if args.as_json:
        print(json.dumps(result, indent=2))
    else:
        print(result["text"])


if __name__ == "__main__":
    main()
