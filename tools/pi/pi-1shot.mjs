#!/usr/bin/env node
// Bounded one-shot runner for pi's RPC mode.
//
// pi has no built-in max-turns or iteration cap (confirmed against the
// installed package's docs/settings — retry/timeout settings exist, turn
// limits don't). This wraps `pi --mode rpc` and enforces two independent
// caps: a turn count and a wall-clock timeout. Either one fires an `abort`
// RPC command, then SIGTERM, then SIGKILL after a grace period if the
// process doesn't exit — same settled-guard shape as openclaude's SubAgent
// tool (src/tools/OpenClaudeTool/OpenClaudeTool.ts).

import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}

const maxTurns = parseInt(flag("max-turns", "40"), 10);
const timeoutMs = parseInt(flag("timeout-ms", "900000"), 10); // 15 min default
const killGraceMs = 5000;
const provider = flag("provider", "deepseek");
const model = flag("model", "deepseek-v4-pro");
const cwd = flag("cwd", process.cwd());
const prompt = flag("prompt", null);

if (!prompt) {
  console.error("usage: pi-1shot.mjs --prompt \"...\" [--max-turns 40] [--timeout-ms 900000] [--provider deepseek] [--model deepseek-v4-pro] [--cwd /path]");
  process.exit(3);
}

const child = spawn(
  "pi",
  ["--mode", "rpc", "--no-session", "--provider", provider, "--model", model],
  { cwd, stdio: ["pipe", "pipe", "inherit"] },
);

let settled = false;
let turnCount = 0;
let killTimer = null;

function send(cmd) {
  child.stdin.write(JSON.stringify(cmd) + "\n");
}

function finish(code, reason) {
  if (settled) return;
  settled = true;
  clearTimeout(wallClockTimer);
  if (reason) console.error(`[pi-1shot] ${reason}`);
  send({ type: "abort" });
  child.kill("SIGTERM");
  killTimer = setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, killGraceMs);
  child.once("exit", () => {
    clearTimeout(killTimer);
    process.exit(code);
  });
}

const wallClockTimer = setTimeout(() => finish(2, `timeout after ${timeoutMs}ms`), timeoutMs);

const decoder = new StringDecoder("utf8");
let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += decoder.write(chunk);
  while (true) {
    const idx = buffer.indexOf("\n");
    if (idx === -1) break;
    let line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (!line) continue;

    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    switch (event.type) {
      case "turn_start":
        turnCount++;
        if (turnCount > maxTurns) {
          finish(1, `turn cap hit (${turnCount} > ${maxTurns})`);
        }
        break;
      case "message_update": {
        const delta = event.assistantMessageEvent;
        if (delta?.type === "text_delta") process.stdout.write(delta.delta);
        break;
      }
      case "agent_end":
        process.stdout.write("\n");
        finish(0, null);
        break;
      case "extension_error":
        console.error(`[pi-1shot] extension error in ${event.extensionPath}: ${event.error}`);
        break;
    }
  }
});

child.once("spawn", () => send({ type: "prompt", message: prompt }));
child.once("error", (err) => finish(3, `spawn error: ${err.message}`));
child.once("exit", (code) => {
  if (!settled) {
    settled = true;
    clearTimeout(wallClockTimer);
    process.exit(code ?? 3);
  }
});
