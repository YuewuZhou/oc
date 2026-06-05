#!/usr/bin/env python3
"""Test all free-tier Gemini/Gemma models and report which work."""

import os
import concurrent.futures
from google import genai
from google.genai import types

PROMPT = "Reply with exactly: 'OK [model_name]' where model_name is your actual model identifier."

MODELS = {
    # Text-out — by RPD generosity (descending)
    "gemma-4-31b-it":        "Gemma 4 31B        | 15 RPM / unlimited TPM / 1.5K RPD",
    "gemma-4-26b-a4b-it":    "Gemma 4 26B MoE    | 15 RPM / unlimited TPM / 1.5K RPD",
    "gemini-3.1-flash-lite": "Gemini 3.1 Fl Lite | 15 RPM / 250K TPM / 500 RPD",
    "gemini-2.5-flash-lite": "Gemini 2.5 Fl Lite | 10 RPM / 250K TPM / 20 RPD",
    "gemini-3.5-flash":      "Gemini 3.5 Flash   |  5 RPM / 250K TPM / 20 RPD",
    "gemini-3-flash-preview":"Gemini 3 Flash     |  5 RPM / 250K TPM / 20 RPD",
    "gemini-2.5-flash":      "Gemini 2.5 Flash   |  5 RPM / 250K TPM / 20 RPD",
}

def test_model(model_id: str, label: str) -> tuple[str, str, str]:
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    try:
        resp = client.models.generate_content(
            model=model_id,
            contents=PROMPT,
            config=types.GenerateContentConfig(max_output_tokens=32),
        )
        return (model_id, label, f"OK  → {resp.text.strip()}")
    except Exception as e:
        return (model_id, label, f"FAIL → {type(e).__name__}: {str(e)[:120]}")

def main():
    print(f"Testing {len(MODELS)} models...\n")
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(test_model, mid, lbl): mid for mid, lbl in MODELS.items()}
        results = []
        for f in concurrent.futures.as_completed(futures):
            results.append(f.result())

    results.sort(key=lambda r: list(MODELS.keys()).index(r[0]))
    print(f"{'Model ID':<26} {'Limits':<40} Result")
    print("-" * 120)
    for model_id, label, result in results:
        status = "✓" if result.startswith("OK") else "✗"
        print(f"{status} {model_id:<25} {label:<40} {result}")

if __name__ == "__main__":
    main()
