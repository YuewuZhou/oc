import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Headless Chromium browser tool for pi. Ported from openclaude's
// PuppeteerTool (src/tools/PuppeteerTool/PuppeteerTool.ts).
//
// Maintains a single browser + page across calls in the same session so you
// can navigate once, then interact. Screenshots are returned as base64 PNGs
// embedded in the text output.
// ---------------------------------------------------------------------------

// Lazy imports to avoid paying the startup cost when browser isn't used.
let puppeteerMod: typeof import("puppeteer") | null = null;
let browser: import("puppeteer").Browser | null = null;
let page: import("puppeteer").Page | null = null;

async function getPuppeteer(): Promise<typeof import("puppeteer")> {
  if (!puppeteerMod) {
    puppeteerMod = await import("puppeteer");
  }
  return puppeteerMod;
}

async function getPage(): Promise<import("puppeteer").Page> {
  const pt = await getPuppeteer();
  if (!browser || !browser.connected) {
    browser = await pt.default.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
    page = null;
  }
  if (!page || page.isClosed()) {
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
  }
  return page;
}

async function closeBrowser(): Promise<void> {
  if (page && !page.isClosed()) {
    await page.close().catch(() => {});
  }
  if (browser && browser.connected) {
    await browser.close().catch(() => {});
  }
  browser = null;
  page = null;
}

// ---------------------------------------------------------------------------
// Parameter schema — mirrors the openclaude PuppeteerTool actions
// ---------------------------------------------------------------------------
const PARAMS = Type.Object({
  action: Type.Union(
    [
      Type.Literal("navigate"),
      Type.Literal("screenshot"),
      Type.Literal("content"),
      Type.Literal("evaluate"),
      Type.Literal("click"),
      Type.Literal("type"),
      Type.Literal("wait_for"),
      Type.Literal("scroll"),
      Type.Literal("close"),
    ],
    { description: "Browser action to perform" },
  ),
  url: Type.Optional(
    Type.String({ description: "URL to navigate to (navigate action)" }),
  ),
  selector: Type.Optional(
    Type.String({ description: "CSS selector (click, type, wait_for actions)" }),
  ),
  script: Type.Optional(
    Type.String({
      description: "JavaScript expression to evaluate in page context (evaluate action)",
    }),
  ),
  text: Type.Optional(
    Type.String({ description: "Text to type into element (type action)" }),
  ),
  fullPage: Type.Optional(
    Type.Boolean({
      description: "Capture full scrollable page (screenshot action, default: false)",
    }),
  ),
  format: Type.Optional(
    Type.Union([Type.Literal("text"), Type.Literal("html")], {
      description: 'Content format (content action, default: "text")',
    }),
  ),
  x: Type.Optional(
    Type.Number({ description: "Horizontal scroll pixels (scroll action, default: 0)" }),
  ),
  y: Type.Optional(
    Type.Number({ description: "Vertical scroll pixels (scroll action, default: 500)" }),
  ),
});

// ---------------------------------------------------------------------------
// Prompt displayed to the model describing available actions
// ---------------------------------------------------------------------------
const PROMPT_SNIPPET =
  "Control a headless browser: navigate, screenshot, click, evaluate JS on web pages";

const PROMPT_GUIDELINES = [
  "Always call navigate before any other browser action",
  "Use screenshot after interactions to confirm the result visually",
  "Images from screenshot are returned as base64 PNG data in the output",
  "evaluate can return any JSON-serializable value from the page",
  "selector uses standard CSS syntax (#id, .class, [attr], etc.)",
  'Use wait_for to pause until a specific element appears (up to 10s timeout)',
  "The browser persists across calls — navigate once, then interact multiple times",
  'Call close when done to free memory and the browser process',
];

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------
export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "puppeteer",
    label: "Browser",
    description:
      "Control a headless Chromium browser to interact with web pages. " +
      "Supports: navigate, screenshot (PNG), content (text/HTML), evaluate " +
      "(arbitrary JavaScript), click, type, wait_for, scroll, and close. " +
      "Browser state persists between calls in the same session.",
    promptSnippet: PROMPT_SNIPPET,
    promptGuidelines: PROMPT_GUIDELINES,
    parameters: PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { action } = params;

      // ── close ──────────────────────────────────────────────
      if (action === "close") {
        await closeBrowser();
        return {
          content: [{ type: "text", text: "Browser closed." }],
          details: { action },
        };
      }

      // ── all other actions need a page ──────────────────────
      let p: import("puppeteer").Page;
      try {
        p = await getPage();
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to launch browser: ${(err as Error).message}`,
            },
          ],
          isError: true,
          details: { action, error: (err as Error).message },
        };
      }

      switch (action) {
        // ── navigate ─────────────────────────────────────────
        case "navigate": {
          if (!params.url) {
            return {
              content: [{ type: "text", text: "navigate requires a url parameter." }],
              isError: true,
              details: { action },
            };
          }
          // Validate protocol
          let url: string;
          try {
            const parsed = new URL(params.url);
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
              return {
                content: [
                  { type: "text", text: "Only http and https URLs are supported." },
                ],
                isError: true,
                details: { action },
              };
            }
            url = params.url;
          } catch {
            return {
              content: [
                { type: "text", text: `Invalid URL: "${params.url}"` },
              ],
              isError: true,
              details: { action },
            };
          }

          ctx.ui.notify(`Browser: navigating to ${new URL(url).hostname}…`, "info");
          await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
          const title = await p.title();
          return {
            content: [
              {
                type: "text",
                text: `Navigated to: ${url}\nTitle: "${title}"`,
              },
            ],
            details: { action, url, title },
          };
        }

        // ── screenshot ───────────────────────────────────────
        case "screenshot": {
          const buf = Buffer.from(
            await p.screenshot({
              fullPage: params.fullPage ?? false,
              type: "png",
            }),
          );
          const viewport = p.viewport();
          return {
            content: [
              {
                type: "text",
                text:
                  `Screenshot captured (${viewport?.width ?? "?"}×${viewport?.height ?? "?"}${params.fullPage ? ", full page" : ""})\n\n` +
                  `[base64 PNG — ${(buf.length / 1024).toFixed(1)} KB]\n${buf.toString("base64")}`,
              },
            ],
            details: {
              action,
              width: viewport?.width,
              height: viewport?.height,
              fullPage: params.fullPage ?? false,
              sizeBytes: buf.length,
            },
          };
        }

        // ── content ──────────────────────────────────────────
        case "content": {
          const fmt = params.format ?? "text";
          let result: string;
          if (fmt === "html") {
            result = await p.content();
          } else {
            result = await p.evaluate(
              () =>
                document.body?.innerText ??
                document.documentElement.innerText ??
                "",
            );
          }
          const truncated =
            result.length > 50_000 ? result.slice(0, 50_000) + "\n\n[... truncated ...]" : result;
          return {
            content: [{ type: "text", text: truncated }],
            details: { action, format: fmt, length: result.length, truncated: result.length > 50_000 },
          };
        }

        // ── evaluate ─────────────────────────────────────────
        case "evaluate": {
          if (!params.script) {
            return {
              content: [
                { type: "text", text: "evaluate requires a script parameter." },
              ],
              isError: true,
              details: { action },
            };
          }
          const raw: unknown = await p.evaluate(params.script);
          const result =
            typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
          return {
            content: [
              {
                type: "text",
                text: result.length > 10_000
                  ? result.slice(0, 10_000) + "\n\n[... truncated ...]"
                  : result,
              },
            ],
            details: { action, script: params.script },
          };
        }

        // ── click ────────────────────────────────────────────
        case "click": {
          if (!params.selector) {
            return {
              content: [
                { type: "text", text: "click requires a selector parameter." },
              ],
              isError: true,
              details: { action },
            };
          }
          await p.click(params.selector, { timeout: 10_000 });
          return {
            content: [
              { type: "text", text: `Clicked: ${params.selector}` },
            ],
            details: { action, selector: params.selector },
          };
        }

        // ── type ─────────────────────────────────────────────
        case "type": {
          if (!params.selector || !params.text) {
            return {
              content: [
                {
                  type: "text",
                  text: "type requires both selector and text parameters.",
                },
              ],
              isError: true,
              details: { action },
            };
          }
          await p.click(params.selector, { timeout: 10_000 });
          // Small delay for focus
          await new Promise((r) => setTimeout(r, 100));
          await p.type(params.selector, params.text);
          return {
            content: [
              {
                type: "text",
                text: `Typed "${params.text}" into: ${params.selector}`,
              },
            ],
            details: { action, selector: params.selector, text: params.text },
          };
        }

        // ── wait_for ─────────────────────────────────────────
        case "wait_for": {
          if (!params.selector) {
            return {
              content: [
                {
                  type: "text",
                  text: "wait_for requires a selector parameter.",
                },
              ],
              isError: true,
              details: { action },
            };
          }
          try {
            await p.waitForSelector(params.selector, { timeout: 10_000 });
            return {
              content: [
                {
                  type: "text",
                  text: `Element ready: ${params.selector}`,
                },
              ],
              details: { action, selector: params.selector },
            };
          } catch {
            return {
              content: [
                {
                  type: "text",
                  text: `Timed out waiting for: ${params.selector} (10s)`,
                },
              ],
              isError: true,
              details: { action, selector: params.selector },
            };
          }
        }

        // ── scroll ───────────────────────────────────────────
        case "scroll": {
          const dx = params.x ?? 0;
          const dy = params.y ?? 500;
          await p.evaluate(
            ({ x, y }: { x: number; y: number }) => window.scrollBy(x, y),
            { x: dx, y: dy },
          );
          return {
            content: [
              {
                type: "text",
                text: `Scrolled by (${dx}, ${dy})`,
              },
            ],
            details: { action, x: dx, y: dy },
          };
        }

        default:
          return {
            content: [
              { type: "text", text: `Unknown action: ${action}` },
            ],
            isError: true,
            details: { action },
          };
      }
    },
  });
}
