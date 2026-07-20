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

- **`SubAgent`** — spawns a child openclaude process using the **same provider as the parent**. Dereks (DeepSeek) are the default choice for all tasks.
- **`ProviderAgent`** — spawns a child using a **named provider**. Use this to fan out across providers in parallel.

### Named subagents

| Name | Provider key | Model | Tier | Shell launcher |
|------|-------------|-------|------|----------------|
| **Derek** ⭐ | `derek` | deepseek-v4-flash | Paid | `derek.sh` |
| **Peter** | `peter` | deepseek-v4-pro | Paid | `peter.sh` |
| Greg | `greg` | gemini-3.1-flash-lite | Paid | `greg.sh` — use only when web search is required |
| Owen | `owen` | gpt-4o-mini | Paid | `owen.sh` |
| Kevin | — | Claude Sonnet/Opus | Paid | `Agent` tool |

### Shell invocation

```bash
# Derek (DeepSeek v4 Flash) — default choice; has OpenAISearch built in
echo "your prompt" | bash <OPENCLAUDE_PATH>/bin/derek.sh --dangerously-skip-permissions

# Peter (DeepSeek v4 Pro) — higher capability, same API
echo "your prompt" | bash <OPENCLAUDE_PATH>/bin/peter.sh --dangerously-skip-permissions

# Greg (Gemini) — use only when web search is required; Gemini tokens are expensive. Prefer Derek.
echo "your prompt" | bash <OPENCLAUDE_PATH>/bin/greg.sh --dangerously-skip-permissions

```

**Default to `--dangerously-skip-permissions` unless the task is purely text-in/text-out.** Without it, any bash call stalls waiting for interactive approval.

> **Root environment note:** The openclaude CLI blocks `--dangerously-skip-permissions` when `uid == 0` unless `IS_SANDBOX=1` is set. All `.sh` launchers handle this automatically.


### Kevin invocation

From within a Claude Code session, use the `Agent` tool — it spawns a fresh Claude instance with full tool access.


### Shared rules for all subagent prompts
- Include the working directory explicitly (e.g. `Your working directory is /absolute/path.`)
- Include all context needed — subagents have no access to the current conversation
- Tell the subagent to verify its work (e.g. `run bun run build to confirm`)

**Constraints:** 5-minute timeout per call. File writes require `--dangerously-skip-permissions`.

### If you are currently running as a subagent

If you were spawned by the `SubAgent` or `ProviderAgent` tool (running non-interactively via `-p`):
- Do NOT use `SubAgent` or `ProviderAgent` — recursive spawning creates infinite loops
- Use your built-in tools directly: `Bash`, `Read`, `Edit`, `Write`
- Derek has `OpenAISearch` built in — use it directly for web lookups (cheap, no Gemini cost)
- Greg has `GeminiSearch` built in — use only when web search is required; Gemini tokens are expensive

Source: `<OPENCLAUDE_PATH>/src/tools/OpenClaudeTool/OpenClaudeTool.ts`, `<OPENCLAUDE_PATH>/src/tools/ProviderAgentTool/ProviderAgentTool.ts`

## Web Search

Two search tools are available depending on which provider is active:

- **`OpenAISearch`** — calls OpenAI's Responses API (`/v1/responses`) with `web_search_preview` on `gpt-5.4-nano`. Enabled when `OPENAI_SEARCH_API_KEY` (or `OPENAI_API_KEY`) and `OPENAI_SEARCH_MODEL` are set. **Use this in Derek sessions.** $10/1000 searches; retrieved web tokens are free.
- **`GeminiSearch`** — calls Gemini with Google Search grounding. Enabled when `GEMINI_API_KEY` is set. Faster and more sources, but Gemini processing tokens are not free — avoid for large reports.

Do **not** use Greg just for a web search — prefer Derek with `OpenAISearch` to keep processing costs on DeepSeek.

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
