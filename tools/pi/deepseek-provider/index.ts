import type { ExtensionAPI, ProviderModelConfig } from "@mariozechner/pi-coding-agent";

// Pricing/context from api-docs.deepseek.com as of 2026-07. Update by hand if
// DeepSeek changes rates — deliberately no live-fetch/SWR machinery here.
const MODELS: ProviderModelConfig[] = [
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.14, output: 0.28, cacheRead: 0.003, cacheWrite: 0.14 },
    contextWindow: 1_000_000,
    maxTokens: 384_000,
    // pi's "xhigh" is the closest analog to DeepSeek's "max" reasoning_effort.
    thinkingLevelMap: { high: "high", xhigh: "max", medium: null, low: null, minimal: null },
    compat: {
      thinkingFormat: "deepseek",
      supportsReasoningEffort: true,
      requiresReasoningContentOnAssistantMessages: true,
    },
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.435, output: 0.87, cacheRead: 0.004, cacheWrite: 0.435 },
    contextWindow: 1_000_000,
    maxTokens: 384_000,
    thinkingLevelMap: { high: "high", xhigh: "max", medium: null, low: null, minimal: null },
    compat: {
      thinkingFormat: "deepseek",
      supportsReasoningEffort: true,
      requiresReasoningContentOnAssistantMessages: true,
    },
  },
];

// DeepSeek's automatic prefix cache charges the cached portion of the prompt
// at ~1/50th the input rate. Tool schemas are the largest byte-stable chunk of
// the prefix and the easiest thing to accidentally bust via re-ordering.
function canonicalize(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(canonicalize);
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (Array.isArray(obj.required)) obj.required = [...(obj.required as string[])].sort();
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) sorted[key] = canonicalize(obj[key]);
    return sorted;
  }
  return v;
}

const SOFT_COMPACT_RATIO = 0.5;
const HARD_COMPACT_RATIO = 0.8;
const MIN_COMPACT_MESSAGES = 4;
const KEEP_THINKING_TURNS = parseInt(process.env.DEEPSEEK_CACHE_KEEP_THINKING_TURNS ?? "2", 10);

function isDeepSeek(ctx: { model?: { provider?: string; id?: string } }): boolean {
  return ctx.model?.provider === "deepseek" || (ctx.model?.id ?? "").startsWith("deepseek-");
}

export default function (pi: ExtensionAPI) {
  pi.registerProvider("deepseek", {
    baseUrl: "https://api.deepseek.com",
    apiKey: "$DEEPSEEK_API_KEY",
    api: "openai-completions",
    models: MODELS,
  });

  // Optimization 1: keep tool-schema bytes stable across turns.
  pi.on("before_provider_request", (event, ctx) => {
    if (!isDeepSeek(ctx)) return;
    const payload = event.payload as Record<string, unknown>;
    if (!Array.isArray(payload?.tools)) return;
    payload.tools = (payload.tools as unknown[]).map((tool) => {
      if (!tool || typeof tool !== "object") return tool;
      const t = { ...(tool as Record<string, unknown>) };
      const fn = t.function as Record<string, unknown> | undefined;
      if (fn?.parameters) t.function = { ...fn, parameters: canonicalize(fn.parameters) };
      return t;
    });
    return payload;
  });

  // Optimization 2: compaction rewrites history and kills the whole cached
  // prefix, so it's the single biggest cost driver in long sessions. Defer it
  // below 50%, and bail out if we're stuck unable to get below 80%.
  let consecutiveStuckCompacts = 0;
  pi.on("session_before_compact", (event, ctx) => {
    if (!isDeepSeek(ctx)) return;
    const usage = ctx.getContextUsage();
    if (!usage || usage.tokens === null || usage.contextWindow <= 0) return;
    const ratio = usage.tokens / usage.contextWindow;

    const toSummarize = event.preparation.messagesToSummarize?.length ?? 0;
    if (toSummarize < MIN_COMPACT_MESSAGES) return { cancel: true };
    if (ratio < SOFT_COMPACT_RATIO) return { cancel: true };

    if (ratio >= HARD_COMPACT_RATIO) {
      consecutiveStuckCompacts++;
      if (consecutiveStuckCompacts >= 3) {
        ctx.ui.notify("DeepSeek: compaction stuck above 80%, pausing auto-compaction.", "warning");
        return { cancel: true };
      }
    } else {
      consecutiveStuckCompacts = 0;
    }
  });

  // Optimization 3: reasoning_content round-trips in full every turn as
  // uncached prompt. Strip all but the most recent N turns of it.
  pi.on("context", (event, ctx) => {
    if (!isDeepSeek(ctx)) return;
    const messages = event.messages;
    if (!messages?.length) return;

    let userTurns = 0;
    let boundary = messages.length;
    for (let i = messages.length - 1; i >= 0; i--) {
      if ((messages[i] as { role?: string }).role === "user") {
        userTurns++;
        if (userTurns >= KEEP_THINKING_TURNS) {
          boundary = i;
          break;
        }
      }
    }

    let modified = false;
    for (let i = 0; i < boundary; i++) {
      const msg = messages[i] as { role?: string; content?: unknown };
      if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
      const content = msg.content as Array<{ type?: string; thinking?: string }>;
      if (!content.some((c) => c.type === "thinking")) continue;
      msg.content = content.map((c) =>
        c.type === "thinking" ? { ...c, thinking: "[stripped for cache efficiency]" } : c,
      );
      modified = true;
    }
    if (modified) return { messages };
  });
}
