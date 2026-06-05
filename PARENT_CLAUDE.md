# PARENT_CLAUDE.md
#
# Template for ~/CLAUDE.md on a new machine.
# Copy to ~ and replace <OPENCLAUDE_PATH> with the absolute path to this repo.
#
#   sed "s|<OPENCLAUDE_PATH>|$HOME/openclaude|g" PARENT_CLAUDE.md > ~/CLAUDE.md

---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working under `~`.

## General guidance

- Always look for a way to automatically do a task before suggesting anything else.
- Check a solution twice if necessary
- Prefer repo-local `CLAUDE.md` files when present; they add project-specific instructions on top of this parent file.
- Keep changes focused on the requested task.
- Use the appropriate dedicated tool for file search, reading, editing, and writing.

## Repositories

- `openclaude/`: see `<OPENCLAUDE_PATH>/CLAUDE.md` for build, test, and architecture guidance.

## openclaude SubAgents ("Gregs", "Kevins", "Chris")

`openclaude` has a `SubAgent` tool that spawns child openclaude processes to handle delegated tasks.

- **Gregs** — powered by `gemini-3.1-flash-lite` (free tier, ~5s, full tool use). **Start here.**
- **Kevins** — powered by GPT (gpt-5.4-mini). Most reliable. Greg auto-falls back to Kevin on rate limits.
- **Chris** — native Claude subagent. Invoke via `claude -p` in shell or the `Agent` tool within a Claude Code session. Reserve for high-precision tasks (complex reasoning, multi-file code changes).

### Greg shell invocation

```bash
# Read-only task
echo "your prompt" | bash <OPENCLAUDE_PATH>/bin/greg.sh

# Task that runs bash commands or edits files
echo "your prompt" | bash <OPENCLAUDE_PATH>/bin/greg.sh --dangerously-skip-permissions
```

Tries `gemini-3.1-flash-lite` first; falls back to Kevin automatically on 429 rate-limit errors.

### Kevin shell invocation

```bash
# Read-only task
echo "your prompt" | bash <OPENCLAUDE_PATH>/bin/kevin.sh

# Task that runs bash commands or edits files
echo "your prompt" | bash <OPENCLAUDE_PATH>/bin/kevin.sh --dangerously-skip-permissions
```

**Default to `--dangerously-skip-permissions` unless the task is purely text-in/text-out.** Without it, any bash call stalls waiting for interactive approval.

> **Root environment note:** The openclaude CLI blocks `--dangerously-skip-permissions` when `uid == 0` unless `IS_SANDBOX=1` is set. `kevin.sh` (and `greg.sh`) handle this automatically. Do not invoke `node dist/cli.mjs` directly with `--dangerously-skip-permissions` as root — use the shell wrappers instead.

### Chris shell invocation

```bash
# Requires Claude Code CLI installed and ANTHROPIC_API_KEY set in <OPENCLAUDE_PATH>/.env
echo "your prompt" | claude -p

# With full tool access
echo "your prompt" | claude -p --dangerously-skip-permissions
```

Or from within a Claude Code session, use the `Agent` tool — it spawns a fresh Claude instance with full tool access.

### Shared rules for all subagent prompts
- Include the working directory explicitly (e.g. `Your working directory is /absolute/path.`)
- Include all context needed — subagents have no access to the current conversation
- Tell the subagent to verify its work (e.g. `run bun run build to confirm`)

**Constraints:** 5-minute timeout per call. File writes require `--dangerously-skip-permissions`.

Source: `<OPENCLAUDE_PATH>/src/tools/OpenClaudeTool/OpenClaudeTool.ts`

## Web Search Tool

Standalone search tool at `<OPENCLAUDE_PATH>/tools/search/search`. Calls `gpt-4o-search-preview` directly and prints results to stdout. Use this for any web search need — do NOT rely on in-process Kevin search (DDG/Brave/SearXNG backends were removed; the WebSearch tool's Anthropic response format is incompatible with the OpenAI shim).

```bash
<OPENCLAUDE_PATH>/tools/search/search "query here"
<OPENCLAUDE_PATH>/tools/search/search "query" --json
<OPENCLAUDE_PATH>/tools/search/search "query" --limit 3
```

Requires `--dangerously-skip-permissions` when called from inside a Greg or Kevin. Source: `<OPENCLAUDE_PATH>/tools/search/search.py`.

## Email Reports

Send a search result (or any stdin text) as an email via the Jarvan email service:

```bash
<OPENCLAUDE_PATH>/tools/search/search "topic" | \
  <OPENCLAUDE_PATH>/tools/email/venv/bin/python \
  <OPENCLAUDE_PATH>/tools/email/send_report.py \
  recipient@email.com "JARVAN - Report Title"
```

Notes:
- Subject should include `JARVAN` so the IMAP poller tracks replies in the same thread.
- SMTP creds come from `<OPENCLAUDE_PATH>/.env` (loaded automatically).
- Source: `<OPENCLAUDE_PATH>/tools/email/send_report.py`.
