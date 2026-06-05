#!/usr/bin/env python3
"""
Reusable Google Gemini/Gemma client.

Usage (CLI):
    python gemini.py "Your prompt here"
    python gemini.py "Your prompt" --system "You are a helpful assistant"
    python gemini.py "Your prompt" --stream
    python gemini.py "Your prompt" --json
    python gemini.py "Your prompt" --model gemma-4-31b-it

Usage (library):
    from gemini import ask, stream, ask_json

    response = ask("Explain quantum computing in one sentence")
    for chunk in stream("Tell me a story"):
        print(chunk, end="", flush=True)

Requires: GEMINI_API_KEY environment variable
"""

import argparse
import os
import sys
from pathlib import Path
from typing import Generator

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

from google import genai
from google.genai import types

# Default: most generous free-tier text model (15 RPM / 250K TPM / 500 RPD)
MODEL = "gemini-3.1-flash-lite"

# All confirmed-working free-tier models (current / limit per day)
MODELS = {
    # Text generation — ordered by RPD (most generous first)
    "gemma-4-31b-it":        "Gemma 4 31B dense        | 15 RPM / unlimited TPM / 1.5K RPD",
    "gemma-4-26b-a4b-it":    "Gemma 4 26B MoE (4B act) | 15 RPM / unlimited TPM / 1.5K RPD",
    "gemini-3.1-flash-lite": "Gemini 3.1 Flash Lite    | 15 RPM / 250K TPM / 500 RPD  ← default",
    "gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite    | 10 RPM / 250K TPM / 20 RPD",
    "gemini-3.5-flash":      "Gemini 3.5 Flash         |  5 RPM / 250K TPM / 20 RPD",
    "gemini-3-flash-preview":"Gemini 3 Flash (preview) |  5 RPM / 250K TPM / 20 RPD",
    "gemini-2.5-flash":      "Gemini 2.5 Flash         |  5 RPM / 250K TPM / 20 RPD",
}


def _client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable not set")
    return genai.Client(api_key=api_key)


def ask(
    prompt: str,
    system: str | None = None,
    model: str = MODEL,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> str:
    """Send a single prompt and return the text response."""
    client = _client()
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=_build_config(system=system, temperature=temperature, max_tokens=max_tokens),
    )
    return response.text


def ask_json(
    prompt: str,
    system: str | None = None,
    model: str = MODEL,
) -> str:
    """Request a JSON-formatted response."""
    client = _client()
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=_build_config(system=system, response_mime_type="application/json"),
    )
    return response.text


def stream(
    prompt: str,
    system: str | None = None,
    model: str = MODEL,
    temperature: float | None = None,
) -> Generator[str, None, None]:
    """Stream a response chunk by chunk."""
    client = _client()
    for chunk in client.models.generate_content_stream(
        model=model,
        contents=prompt,
        config=_build_config(system=system, temperature=temperature),
    ):
        if chunk.text:
            yield chunk.text


def _build_config(
    system: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    response_mime_type: str | None = None,
) -> types.GenerateContentConfig | None:
    kwargs: dict = {}
    if system:
        kwargs["system_instruction"] = system
    if temperature is not None:
        kwargs["temperature"] = temperature
    if max_tokens is not None:
        kwargs["max_output_tokens"] = max_tokens
    if response_mime_type:
        kwargs["response_mime_type"] = response_mime_type
    return types.GenerateContentConfig(**kwargs) if kwargs else None


def main():
    parser = argparse.ArgumentParser(
        description="Google Gemini/Gemma CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Available models:\n" + "\n".join(f"  {k:<26} {v}" for k, v in MODELS.items()),
    )
    parser.add_argument("prompt", help="The prompt to send")
    parser.add_argument("--system", help="System instruction")
    parser.add_argument("--stream", action="store_true", help="Stream the response")
    parser.add_argument("--json", action="store_true", help="Request JSON output")
    parser.add_argument("--model", default=MODEL, help=f"Model ID (default: {MODEL})")
    parser.add_argument("--temperature", type=float, help="Sampling temperature (0.0–2.0)")
    parser.add_argument("--max-tokens", type=int, help="Max output tokens")
    args = parser.parse_args()

    try:
        if args.stream:
            for chunk in stream(args.prompt, system=args.system, model=args.model, temperature=args.temperature):
                print(chunk, end="", flush=True)
            print()
        elif args.json:
            print(ask_json(args.prompt, system=args.system, model=args.model))
        else:
            print(ask(
                args.prompt,
                system=args.system,
                model=args.model,
                temperature=args.temperature,
                max_tokens=args.max_tokens,
            ))
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
