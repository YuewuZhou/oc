# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

- Build: `bun run build`
- Run locally from source: `bun run dev`
- Start built CLI: `bun run start`
- Typecheck: `bun run typecheck`
- Smoke test build/startup: `bun run smoke`
- Runtime checks: `bun run doctor:runtime`
- Runtime checks as JSON: `bun run doctor:runtime:json`
- Full hardening check: `bun run hardening:check`
- Strict hardening: `bun run hardening:strict`
- Provider recommendation tests: `bun run test:provider-recommendation`
- Provider/context tests: `bun run test:provider`

Single-test examples:
- Node test file directly: `node --test --experimental-strip-types src/utils/providerRecommendation.test.ts`
- Bun test file directly: `bun test src/services/api/<file>.test.ts`

Provider launch helpers:
- Bootstrap a profile: `bun run profile:init`
- Recommend a profile: `bun run profile:recommend -- --goal coding --benchmark`
- Auto-apply a profile: `bun run profile:auto -- --goal latency`
- Launch with persisted profile: `bun run dev:profile`
- Launch OpenAI profile: `bun run dev:openai`
- Launch Ollama profile: `bun run dev:ollama`
- Launch Codex profile: `bun run dev:codex`

## High-level architecture

- The app is a Bun-built TypeScript CLI. `scripts/build.ts` bundles `src/entrypoints/cli.tsx` into `dist/cli.mjs` and stubs out internal-only feature flags for the open build.
- `src/main.tsx` is the command registry and capability filter. It composes built-in slash commands with skills, plugins, workflows, and dynamically discovered skills, then filters them by auth/provider availability and feature flags.
- `src/services/api/` contains the model-provider integration layer. The OpenAI-compatible shim sits here and translates Claude Code’s internal message/tool stream into OpenAI-style requests and responses.
- `scripts/provider-*.ts` manage provider profiling and launch flow. They resolve persisted `.openclaude-profile.json`, choose a provider/model, run runtime checks, and then start the bundled CLI.
- `scripts/system-check.ts` is the local runtime doctor. It validates Node/Bun/build artifacts, provider env, endpoint reachability, and local Ollama state.
- `src/commands/` contains the slash commands exposed to users and the model. Some commands are always available, while others are gated by feature flags, auth state, or remote-safety rules.
- `src/skills/`, plugin loaders, and workflow loaders feed extra prompt commands into the same command pipeline as built-ins.

## SubAgent tool ("Gregs")

The `SubAgent` tool (`src/tools/OpenClaudeTool/OpenClaudeTool.ts`) lets the running model delegate self-contained tasks to a child openclaude process. The child is spawned via `node process.argv[1] -p` with the prompt piped to stdin.

Key implementation details:
- Tool name: `SubAgent`, registered in `getAllBaseTools()` in `src/tools.ts`
- Input: `{ description: string, prompt: string }` — description is shown in UI, prompt goes to the child
- The child inherits `process.env` and `process.cwd()` from the parent
- A `settled` guard prevents double-resolution if abort/timeout races with `close`
- SIGTERM is sent on timeout/abort, followed by SIGKILL after 5s if the child is still alive
- Timeout: 5 minutes (`TIMEOUT_MS` constant at top of file)

Running a greg from the shell (for debugging):
```bash
echo "your prompt" | bash bin/greg.sh
```

To give a greg file-write access (required for code fixes):
```bash
echo "your prompt" | bash bin/greg.sh --dangerously-skip-permissions
```

The child has no access to the parent's conversation history — every greg prompt must be self-contained with all necessary context included.

## Web Search

Greg handles web search natively — delegate search tasks to Greg via `greg.sh`. In-process search backends (DDG, Brave, SearXNG) have been removed.

Remaining files: `src/tools/WebSearchTool/` (kept, Anthropic-first-party mode only), `src/services/search/` (stub that returns []).
- index.ts: picks backend by priority
- searxng.ts, brave.ts, ddg.ts: individual clients

## Important repo notes

- The build assumes Bun and Node 20+.
- `dist/cli.mjs` is generated; rebuild after changing source files that affect the bundle.
- `README.md` contains the supported provider setup, environment variables, and runtime hardening commands; keep this file aligned with it when behavior changes.

---

## New Machine Setup

Everything needed to reproduce this environment is self-contained in `~/openclaude/`. The `tools/` subdirectory holds the standalone utilities; `bin/` holds shell launchers.

### Directory layout

```
openclaude/
  bin/
    greg.sh            # Greg launcher (Gemini)
    derek.sh           # Derek launcher (DeepSeek)
    owen.sh            # Owen launcher (OpenAI)
  tools/
    gemini/            # Gemini/Gemma Python client + capability test suite
    email/             # Jarvan email service (SMTP/IMAP, FastAPI)
  .env                 # API keys — fill this in (gitignored)
  .env.example         # Template showing all required keys
  setup-new-machine.sh # One-shot bootstrap script
  dist/cli.mjs         # Built CLI (run bun run build to regenerate)
```

### Step 1 — clone, build, and fill in keys

```bash
git clone <repo-url> ~/openclaude
cd ~/openclaude
bash setup-new-machine.sh   # installs deps, builds, creates venvs, copies .env.example → .env
```

Then edit `~/openclaude/.env` and fill in your API keys — that's the only config needed. All tools (greg.sh, email, gemini) load from this single file automatically.

### Step 2 — fill in .env

Edit `~/openclaude/.env` and fill in your API keys. That's it — `~/CLAUDE.md` is generated automatically by `setup-new-machine.sh` from `PARENT_CLAUDE.md`.

### Subagent quick reference

| Name | Model | Invoke |
|------|-------|--------|
| Greg | gemini-3.1-flash-lite (Gemini) | `echo "prompt" \| bash ~/openclaude/bin/greg.sh [--dangerously-skip-permissions]` |
| Derek | deepseek-v4-flash (DeepSeek) | `echo "prompt" \| bash ~/openclaude/bin/derek.sh` |
| Owen | gpt-4o (OpenAI) | `echo "prompt" \| bash ~/openclaude/bin/owen.sh [--dangerously-skip-permissions]` |
| Kevin | Claude Sonnet/Opus (native) | `Agent` tool in Claude Code session |

**Rules for all subagent prompts:**
- Include `Your working directory is /absolute/path` explicitly — subagents don't inherit cwd from conversation.
- Include all context — subagents have no access to the current conversation history.
- Use `--dangerously-skip-permissions` for any task that runs bash commands or writes files; without it the child stalls waiting for interactive approval.
- **Root environment:** The CLI blocks `--dangerously-skip-permissions` when `uid == 0` unless `IS_SANDBOX=1` is set. `greg.sh` handles this automatically. Do not invoke `node dist/cli.mjs` directly with `--dangerously-skip-permissions` as root.
- 5-minute timeout per call.
