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

## openclaude SubAgents ("Gregs", "Kevins")

`openclaude` has a `SubAgent` tool that spawns child openclaude processes to handle delegated tasks.

- **Gregs** — powered by Gemini (free tier, ~5s, full tool use, native web search). **Default choice for all tasks.**
- **Kevins** — native Claude subagent via the `Agent` tool within a Claude Code session. Reserve for high-precision tasks (complex reasoning, multi-file code changes).

### Greg shell invocation

```bash
# Read-only task
echo "your prompt" | bash <OPENCLAUDE_PATH>/bin/greg.sh

# Task that runs bash commands or edits files
echo "your prompt" | bash <OPENCLAUDE_PATH>/bin/greg.sh --dangerously-skip-permissions
```

Greg uses Gemini (`GEMINI_API_KEY` in `.env`) and can perform web searches natively — no external search tool needed.

**Default to `--dangerously-skip-permissions` unless the task is purely text-in/text-out.** Without it, any bash call stalls waiting for interactive approval.

> **Root environment note:** The openclaude CLI blocks `--dangerously-skip-permissions` when `uid == 0` unless `IS_SANDBOX=1` is set. `greg.sh` handles this automatically via `export IS_SANDBOX=1`. Do not invoke `node dist/cli.mjs` directly with `--dangerously-skip-permissions` as root — use the shell wrapper instead.

### Kevin invocation

From within a Claude Code session, use the `Agent` tool — it spawns a fresh Claude instance with full tool access.

### Shared rules for all subagent prompts
- Include the working directory explicitly (e.g. `Your working directory is /absolute/path.`)
- Include all context needed — subagents have no access to the current conversation
- Tell the subagent to verify its work (e.g. `run bun run build to confirm`)

**Constraints:** 5-minute timeout per call. File writes require `--dangerously-skip-permissions`.

Source: `<OPENCLAUDE_PATH>/src/tools/OpenClaudeTool/OpenClaudeTool.ts`

## Web Search

Greg handles web search natively — delegate any search task to Greg via `greg.sh`. No standalone search tool is needed.

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
