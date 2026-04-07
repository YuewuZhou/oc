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

## Important repo notes

- The build assumes Bun and Node 20+.
- `dist/cli.mjs` is generated; rebuild after changing source files that affect the bundle.
- `README.md` contains the supported provider setup, environment variables, and runtime hardening commands; keep this file aligned with it when behavior changes.
