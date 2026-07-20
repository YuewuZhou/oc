import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

// ---------------------------------------------------------------------------
// Spawns a one-shot pi subagent (pi --mode rpc) via pi-1shot.mjs, the same
// bounded runner used by openclaude's SubAgent tool. Enforces a turn cap +
// wall-clock timeout with a settled-guard kill chain (abort → SIGTERM →
// SIGKILL after grace period).
//
// Usage from the model:
//   subagent({ prompt: "Verify the build passes after my changes", ... })
// ---------------------------------------------------------------------------

const RUNNER = "/home/zack/openclaude/tools/pi/pi-1shot.mjs";
const DEFAULT_MAX_TURNS = 40;
const DEFAULT_TIMEOUT_MS = 900_000; // 15 min
const KILL_GRACE_MS = 5_000;

const PARAMS = Type.Object({
  prompt: Type.String({
    description:
      "The full task prompt for the subagent. Include working directory, " +
      "context, and any instructions. The subagent has no access to the " +
      "parent conversation — be explicit.",
  }),
  maxTurns: Type.Optional(
    Type.Number({
      description: `Maximum LLM turns before forced termination (default ${DEFAULT_MAX_TURNS})`,
    }),
  ),
  timeoutMs: Type.Optional(
    Type.Number({
      description: `Wall-clock timeout in milliseconds (default ${DEFAULT_TIMEOUT_MS}, 15 min)`,
    }),
  ),
  cwd: Type.Optional(
    Type.String({
      description: "Working directory for the subagent (default: current project root)",
    }),
  ),
  model: Type.Optional(
    Type.String({
      description:
        "Model override for the subagent (e.g., deepseek-v4-flash). " +
        "By default inherits nothing — pi-1shot.sh uses deepseek-v4-pro.",
    }),
  ),
});

interface SubagentResult {
  stdout: string;
  stderr: string;
  turnsUsed: number;
  exitCode: number;
  terminated: boolean;
  terminationReason?: string;
}

function runSubagent(
  prompt: string,
  maxTurns: number,
  timeoutMs: number,
  cwd: string,
  model?: string,
): Promise<SubagentResult> {
  return new Promise((resolve) => {
    const args = [
      RUNNER,
      "--prompt", prompt,
      "--max-turns", String(maxTurns),
      "--timeout-ms", String(timeoutMs),
      "--cwd", cwd,
    ];
    if (model) args.push("--model", model);

    const child = spawn("node", args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    let settled = false;
    let stdout = "";
    let stderr = "";
    let turnsUsed = 0;
    let killTimer: NodeJS.Timeout | null = null;
    let exitCode = 0;
    let terminated = false;
    let terminationReason: string | undefined;

    const finish = (code: number, reason?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(wallClockTimer);
      exitCode = code;
      if (reason) {
        terminated = true;
        terminationReason = reason;
      }
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, KILL_GRACE_MS);
    };

    const wallClockTimer = setTimeout(
      () => finish(2, `timeout after ${timeoutMs}ms`),
      timeoutMs + 10_000, // pad for pi-1shot's own timeout
    );

    const stdoutDecoder = new StringDecoder("utf8");
    child.stdout.on("data", (chunk: Buffer) => {
      const text = stdoutDecoder.write(chunk);
      stdout += text;

      // Count turns from stderr (pi-1shot logs turn info there)
    });

    const stderrDecoder = new StringDecoder("utf8");
    child.stderr.on("data", (chunk: Buffer) => {
      const text = stderrDecoder.write(chunk);
      stderr += text;

      // Count "[pi-1shot] turn cap hit" or similar
      if (text.includes("turn cap hit")) {
        turnsUsed = maxTurns + 1; // exceeded
      }
    });

    child.on("error", (err: Error) => {
      finish(3, `spawn error: ${err.message}`);
    });

    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(wallClockTimer);
        clearTimeout(killTimer!);
      }
      // Estimate turns from output length heuristically
      const turnMatches = stderr.match(/turn_start/g);
      if (turnMatches) turnsUsed = turnMatches.length;

      resolve({
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        turnsUsed,
        exitCode: code ?? (terminated ? -1 : 0),
        terminated,
        terminationReason,
      });
    });
  });
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "subagent",
    label: "SubAgent",
    description:
      "Spawn a one-shot pi subagent for parallel or offline tasks. " +
      "The subagent runs in a fresh, isolated session (--no-session) with its own " +
      "turn cap and wall-clock timeout. Use this for: parallel work on independent " +
      "tasks, verification/QA runs, long-running analysis that should not block the " +
      "main conversation, or tasks where you want an isolated context.",
    promptSnippet:
      "Spawn a one-shot pi subagent for parallel or isolated tasks",
    promptGuidelines: [
      "The subagent prompt must include the working directory, context, and explicit instructions — it has NO access to the parent conversation",
      "Use subagents for parallel independent tasks, verification, and long-running analysis",
      "Subagents are bounded — max 40 turns and 15 min timeout by default",
    ],
    parameters: PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const prompt = params.prompt;
      const maxTurns = params.maxTurns ?? DEFAULT_MAX_TURNS;
      const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const cwd = params.cwd ?? process.cwd();

      ctx.ui.notify(
        `SubAgent: dispatching (max ${maxTurns} turns, ${(timeoutMs / 1000).toFixed(0)}s timeout)…`,
        "info",
      );

      const result = await runSubagent(prompt, maxTurns, timeoutMs, cwd, params.model);

      const header = [
        `Exit code: ${result.exitCode}`,
        `Turns: ${result.turnsUsed}/${maxTurns}`,
        result.terminated ? `Terminated: ${result.terminationReason}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      const body = result.stdout || "(no output)";
      const err = result.stderr ? `\n\n[stderr]\n${result.stderr}` : "";

      return {
        content: [
          {
            type: "text",
            text: `[SubAgent] ${header}\n\n${body}${err}`,
          },
        ],
        details: {
          exitCode: result.exitCode,
          turnsUsed: result.turnsUsed,
          terminated: result.terminated,
          terminationReason: result.terminationReason,
        },
      };
    },
  });
}
