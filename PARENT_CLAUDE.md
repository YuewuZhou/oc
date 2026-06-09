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

## openclaude SubAgents

`openclaude` has two tools for delegating tasks to subagents:

- **`SubAgent`** — spawns a child openclaude process using the **same provider as the parent**. Gregs (Gemini) are the default choice for all tasks.
- **`ProviderAgent`** — spawns a child using a **named provider**. Use this to route work to free-tier providers or to fan out across multiple providers in parallel.

### Named subagents

| Name | Provider key | Model | Tier | Shell launcher |
|------|-------------|-------|------|----------------|
| Greg | `greg` | gemini-2.5-flash-lite | Free | `greg.sh` |
| Greta | `groq` | llama-3.3-70b-versatile | **Free** | `groq.sh` |
| Robin | `router` | llama-3.3-70b-instruct:free | **Free** | `router.sh` |
| Nina | `nim` | llama-3.3-70b-instruct | **Free** | `nim.sh` |
| Mira | `mistral` | mistral-small-latest | **Free** | `mistral.sh` |
| Gabby | `github` | gpt-4o-mini | **Free** | `github.sh` |
| Derek | `derek` | deepseek-v4-flash | Paid | `derek.sh` |
| Owen | `owen` | gpt-4o-mini | Paid | `owen.sh` |
| Kevin | — | Claude Sonnet/Opus | Paid | `Agent` tool |

### Shell invocation

```bash
# Greg (Gemini) — default, free, has web search
echo "your prompt" | bash <OPENCLAUDE_PATH>/bin/greg.sh --dangerously-skip-permissions

# Free provider alternatives
echo "your prompt" | bash <OPENCLAUDE_PATH>/bin/groq.sh --dangerously-skip-permissions
echo "your prompt" | bash <OPENCLAUDE_PATH>/bin/router.sh --dangerously-skip-permissions
echo "your prompt" | bash <OPENCLAUDE_PATH>/bin/nim.sh --dangerously-skip-permissions
echo "your prompt" | bash <OPENCLAUDE_PATH>/bin/mistral.sh --dangerously-skip-permissions
echo "your prompt" | bash <OPENCLAUDE_PATH>/bin/github.sh --dangerously-skip-permissions
```

**Default to `--dangerously-skip-permissions` unless the task is purely text-in/text-out.** Without it, any bash call stalls waiting for interactive approval.

> **Root environment note:** The openclaude CLI blocks `--dangerously-skip-permissions` when `uid == 0` unless `IS_SANDBOX=1` is set. All `.sh` launchers handle this automatically.

### ProviderAgent tool (use from inside OpenClaude)

```
Use the ProviderAgent tool with provider="groq" (or greg/derek/owen/router/nim/mistral/github)
to route a self-contained task to that provider without leaving the session.
```

Run multiple `ProviderAgent` calls in parallel to fan out work across free providers simultaneously.

### Kevin invocation

From within a Claude Code session, use the `Agent` tool — it spawns a fresh Claude instance with full tool access.

### Forge — autonomous orchestrator

```bash
bash <OPENCLAUDE_PATH>/bin/forge.sh   # start autonomous orchestrator session
```

Forge uses Greg as the orchestrator brain, dispatches coding subtasks to free providers via `ProviderAgent`, self-heals on rate limits (rotating groq → router → nim → mistral → github → greg), and iterates until tasks are complete. Use `/forge <task>` inside a Forge session.

### Shared rules for all subagent prompts
- Include the working directory explicitly (e.g. `Your working directory is /absolute/path.`)
- Include all context needed — subagents have no access to the current conversation
- Tell the subagent to verify its work (e.g. `run bun run build to confirm`)

**Constraints:** 5-minute timeout per call. File writes require `--dangerously-skip-permissions`.

### If you are currently running as a subagent

If you were spawned by the `SubAgent` or `ProviderAgent` tool (running non-interactively via `-p`):
- Do NOT use `SubAgent` or `ProviderAgent` — recursive spawning creates infinite loops
- Use your built-in tools directly: `Bash`, `Read`, `Edit`, `Write`
- Greg has native Gemini web search — use `GeminiSearch` directly, no delegation needed

Source: `<OPENCLAUDE_PATH>/src/tools/OpenClaudeTool/OpenClaudeTool.ts`, `<OPENCLAUDE_PATH>/src/tools/ProviderAgentTool/ProviderAgentTool.ts`

## Web Search

Use the `GeminiSearch` tool — it calls the Gemini API directly with Google Search grounding and returns a synthesized answer with source citations. It is enabled whenever `GEMINI_API_KEY` is set (i.e. always in this environment).

Do **not** spawn a Greg subagent just to do a web search — Greg itself uses `GeminiSearch` as a built-in tool.

## Markdown to PDF

Convert a Markdown file to PDF (copies to Windows Downloads if available):

```bash
pdf <file.md> [output.pdf]
# or equivalently:
md2pdf <file.md> [output.pdf]
```

Both `pdf` and `md2pdf` are aliases that invoke `<OPENCLAUDE_PATH>/tools/md2pdf/md2pdf.sh`. The primary backend is a local Python venv (weasyprint); it falls back to pandoc, wkhtmltopdf, or chromium headless automatically.

Source: `<OPENCLAUDE_PATH>/tools/md2pdf/`.

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
