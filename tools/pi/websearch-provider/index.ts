import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Backed by the self-hosted SearXNG instance (docker-compose.searxng.yml) so
// agentic sessions don't burn paid-per-call search API budget (OpenAISearch is
// $10/1000 calls). Free, but results are meta-searched from public engines, so
// quality/reliability trades off against zero marginal cost.
const SEARCH_URL = process.env.SEARXNG_URL ?? "http://localhost:8080/search";
const COMPOSE_FILE = process.env.SEARXNG_COMPOSE_FILE ?? "/home/zack/openclaude/docker-compose.searxng.yml";
const STARTUP_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

const PARAMS = Type.Object({
  query: Type.String({ description: "Search query" }),
  limit: Type.Optional(Type.Number({ description: "Max results to return (default 10)" })),
});

interface SearxResult {
  title: string;
  url: string;
  content?: string;
}

async function pingSearxng(): Promise<boolean> {
  try {
    const res = await fetch(SEARCH_URL + "?q=ping&format=json", { signal: AbortSignal.timeout(3_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function dockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["info"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

// SearXNG being down (container stopped, or Docker itself not running — e.g.
// WSL without Docker Desktop's integration enabled) is a recoverable state,
// not a hard failure: try to bring the container up and retry once before
// giving up.
async function autoStartSearxng(): Promise<{ ok: boolean; message: string }> {
  if (!(await dockerAvailable())) {
    return {
      ok: false,
      message: "docker is not available (daemon not running, or not on PATH — e.g. Docker Desktop's WSL integration is off). Can't auto-start SearXNG.",
    };
  }
  try {
    await execFileAsync("docker", ["compose", "-f", COMPOSE_FILE, "up", "-d"], { timeout: 45_000 });
  } catch (err) {
    return { ok: false, message: `docker compose up failed: ${(err as Error).message}` };
  }
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await pingSearxng()) return { ok: true, message: "SearXNG auto-started successfully." };
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return { ok: false, message: `SearXNG container started but didn't respond within ${STARTUP_TIMEOUT_MS / 1000}s.` };
}

async function runSearch(query: string, limit: number): Promise<SearxResult[]> {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("safesearch", "1");

  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`SearXNG returned HTTP ${response.status}`);
  const data = (await response.json()) as { results?: SearxResult[] };
  return (data.results ?? []).slice(0, limit);
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web via a self-hosted SearXNG meta-search instance (free, no per-call API cost). " +
      "If the backend container is stopped, this tool auto-starts it before searching, which can add " +
      "up to ~60s of one-time latency on the first call of a session — that delay is normal, not a hang.",
    promptSnippet: "Search the web for current information",
    promptGuidelines: [
      "web_search may take up to ~60s on its first invocation if it needs to auto-start its local search backend; do not treat that delay as a failure or retry preemptively.",
    ],
    parameters: PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const limit = params.limit ?? 10;
      let autoStartAttempted = false;

      let results: SearxResult[];
      try {
        results = await runSearch(params.query, limit);
      } catch (firstErr) {
        autoStartAttempted = true;
        ctx.ui.notify("SearXNG unreachable, attempting to auto-start it via docker compose...", "info");
        const start = await autoStartSearxng();
        if (!start.ok) {
          return {
            content: [{
              type: "text",
              text: `web_search failed: SearXNG was offline and auto-start failed — ${start.message} ` +
                `Original error: ${(firstErr as Error).message}`,
            }],
            isError: true,
            details: { query: params.query, count: undefined as number | undefined, autoStartAttempted },
          };
        }
        try {
          results = await runSearch(params.query, limit);
        } catch (secondErr) {
          return {
            content: [{ type: "text", text: `web_search failed even after auto-starting SearXNG: ${(secondErr as Error).message}` }],
            isError: true,
            details: { query: params.query, count: undefined as number | undefined, autoStartAttempted },
          };
        }
      }

      const prefix = autoStartAttempted ? "[SearXNG was offline; auto-started it before searching]\n\n" : "";

      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `${prefix}No results for: ${params.query}` }],
          details: { query: params.query, count: 0, autoStartAttempted },
        };
      }

      const text = results
        .map((r) => `TITLE: ${r.title}\nURL: ${r.url}\nSNIPPET: ${r.content ?? ""}`)
        .join("\n\n");

      return {
        content: [{ type: "text", text: prefix + text }],
        details: { query: params.query, count: results.length, autoStartAttempted },
      };
    },
  });
}
