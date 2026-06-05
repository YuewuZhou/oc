#!/usr/bin/env python3
"""
Capability test suite for all openclaude subagent tiers.
Runs all agents × all tests in parallel; reports results as markdown.
"""

import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field

_HERE = os.path.dirname(os.path.realpath(__file__))
CLI = os.path.join(_HERE, "../../dist/cli.mjs")
SEARCH = os.path.join(_HERE, "../search/search")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai"

# ── Agent definitions ───────────────────────────────────────────────────────

@dataclass
class Agent:
    name: str
    tier: str
    env: dict = field(default_factory=dict)

def greg(model_id: str, short: str) -> Agent:
    return Agent(
        name=f"Greg/{short}",
        tier="greg",
        env={
            "CLAUDE_CODE_USE_GEMINI": "1",
            "GEMINI_MODEL": model_id,
            "OPENAI_API_KEY": GEMINI_KEY,
            "OPENAI_BASE_URL": GEMINI_BASE,
        },
    )

def tom(model_id: str, short: str) -> Agent:
    return Agent(
        name=f"Tom/{short}",
        tier="tom",
        env={
            "OPENAI_BASE_URL": "http://localhost:11434/v1",
            "OPENAI_MODEL": model_id,
            "CLAUDE_CODE_USE_OPENAI": "1",
            "OPENAI_SEARCH_MODEL": "",
        },
    )

AGENTS = [
    # Gregs — each model has its own rate-limit bucket
    greg("gemini-3.1-flash-lite",  "3.1-flash-lite"),
    greg("gemma-4-26b-a4b-it",     "gemma-4-26b"),
    greg("gemma-4-31b-it",         "gemma-4-31b"),
    greg("gemini-2.5-flash-lite",  "2.5-flash-lite"),
    # Kevin — GPT via OpenAI
    Agent("Kevin/gpt-5.4-mini", "kevin"),
    # Toms — Ollama models on Mac Mini
    tom("qwen2.5-coder:latest", "qwen2.5-coder"),
    tom("qwen3:8b",             "qwen3-8b"),
]

# ── Test definitions ─────────────────────────────────────────────────────────

@dataclass
class Test:
    name: str
    prompt: str
    needs_tools: bool
    check: str  # substring that should appear in a good response

TESTS = [
    Test(
        name="coding",
        prompt=(
            "Write a Python function `is_palindrome(s)` that returns True if s is a "
            "palindrome ignoring spaces, punctuation, and case. Include 5 assert statements "
            "that pass. Output only code, no explanation."
        ),
        needs_tools=False,
        check="def is_palindrome",
    ),
    Test(
        name="synthesis",
        prompt=(
            "Read this text and respond with exactly two things: "
            "(1) a one-sentence summary, (2) three key technical terms as a comma-separated list.\n\n"
            "Text: 'Transformers are a deep learning architecture introduced in the paper "
            "Attention Is All You Need. They rely on self-attention mechanisms to process "
            "sequences in parallel, unlike RNNs which process tokens sequentially. "
            "This parallelism makes them highly scalable on GPUs. Modern large language "
            "models like GPT and BERT are built on transformer architectures.'"
        ),
        needs_tools=False,
        check="transformer",
    ),
    Test(
        name="bash_tool",
        prompt=(
            f"Your working directory is {_HERE}. "
            "Use the Bash tool to run: echo 'capability_ok' && uname -s\n"
            "Report the exact output of both commands."
        ),
        needs_tools=True,
        check="capability_ok",
    ),
    Test(
        name="file_read",
        prompt=(
            f"Your working directory is {_HERE}. "
            "Read the file gemini.py and answer: "
            "(1) What is the value of the MODEL constant? "
            "(2) What are the names of the 3 public functions (ask, ask_json, stream)? "
            "Answer in two short lines."
        ),
        needs_tools=True,
        check="gemini",
    ),
    Test(
        name="web_search",
        prompt=(
            f"Your working directory is {_HERE}. "
            "Use the Bash tool to run this command exactly: "
            f"{SEARCH} 'Python latest stable version 2026' --limit 2\n"
            "Report the Python version number you find."
        ),
        needs_tools=True,
        check="3.",
    ),
    Test(
        name="multi_step",
        prompt=(
            f"Your working directory is {_HERE}. "
            "Do these three steps using the Bash tool, in order:\n"
            "1. Create a file /tmp/greg_test_$$.txt containing the text 'step_ok'\n"
            "2. Read that file back and confirm its content\n"
            "3. Delete the file\n"
            "Report pass/fail for each step."
        ),
        needs_tools=True,
        check="step_ok",
    ),
]

# ── Runner ───────────────────────────────────────────────────────────────────

def run_test(agent: Agent, test: Test, timeout: int = 180) -> dict:
    env = {**os.environ, **agent.env}
    args = ["node", CLI, "-p"]
    if test.needs_tools:
        args.append("--dangerously-skip-permissions")

    t0 = time.time()
    try:
        result = subprocess.run(
            args,
            input=test.prompt,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        elapsed = time.time() - t0
        stdout = result.stdout.strip()
        stderr = result.stderr.strip()
        combined = (stdout + " " + stderr).lower()

        # Detect explicit failures
        if result.returncode != 0 and not stdout:
            return {"status": "ERROR", "output": stderr[:300], "elapsed": elapsed}

        # Rate limit
        if any(k in combined for k in ["429", "resource_exhausted", "quota exceeded", "rate limit"]):
            return {"status": "RATE_LIMITED", "output": stderr[:200], "elapsed": elapsed}

        passed = test.check.lower() in combined
        snippet = stdout[:300].replace("\n", " ").strip()
        return {
            "status": "PASS" if passed else "WEAK",
            "output": snippet,
            "elapsed": elapsed,
        }

    except subprocess.TimeoutExpired:
        return {"status": "TIMEOUT", "output": f">{timeout}s", "elapsed": timeout}
    except Exception as e:
        return {"status": "ERROR", "output": str(e)[:200], "elapsed": time.time() - t0}


def main():
    jobs = [(agent, test) for agent in AGENTS for test in TESTS]
    results: dict[tuple, dict] = {}

    print(f"Running {len(jobs)} tests across {len(AGENTS)} agents × {len(TESTS)} capabilities...\n")

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(run_test, a, t): (a, t) for a, t in jobs}
        done = 0
        for f in as_completed(futures):
            a, t = futures[f]
            results[(a.name, t.name)] = f.result()
            done += 1
            r = results[(a.name, t.name)]
            icon = {"PASS": "✓", "WEAK": "~", "ERROR": "✗", "TIMEOUT": "⏱", "RATE_LIMITED": "⚡"}.get(r["status"], "?")
            print(f"  [{done:2d}/{len(jobs)}] {icon} {a.name:<26} {t.name:<12} ({r['elapsed']:.0f}s)")

    # ── Print markdown report ─────────────────────────────────────────────

    test_names = [t.name for t in TESTS]
    agent_names = [a.name for a in AGENTS]

    print("\n\n" + "=" * 80)
    print("CAPABILITY MATRIX")
    print("=" * 80)

    icon_map = {"PASS": "✓", "WEAK": "~", "ERROR": "✗", "TIMEOUT": "⏱", "RATE_LIMITED": "⚡"}
    header = f"{'Agent':<26}" + "".join(f"{n:<14}" for n in test_names)
    print(header)
    print("-" * len(header))

    for tier in ["greg", "kevin", "tom"]:
        for agent in [a for a in AGENTS if a.tier == tier]:
            row = f"{agent.name:<26}"
            for test in TESTS:
                r = results.get((agent.name, test.name), {})
                icon = icon_map.get(r.get("status", "?"), "?")
                row += f"{icon:<14}"
            print(row)
        print()

    print("\n" + "=" * 80)
    print("DETAILED RESULTS")
    print("=" * 80)

    for tier in ["greg", "kevin", "tom"]:
        tier_label = {"greg": "GREGS (Gemini/Gemma)", "kevin": "KEVIN", "tom": "TOMS (Ollama)"}[tier]
        print(f"\n## {tier_label}\n")
        for agent in [a for a in AGENTS if a.tier == tier]:
            print(f"### {agent.name}")
            for test in TESTS:
                r = results.get((agent.name, test.name), {})
                icon = icon_map.get(r.get("status", "?"), "?")
                print(f"  {icon} {test.name:<12} [{r.get('elapsed', 0):.0f}s] {r.get('output', '')[:120]}")
            print()


if __name__ == "__main__":
    main()
