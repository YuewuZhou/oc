import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources.js'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { DESCRIPTION, PUPPETEER_TOOL_NAME } from './prompt.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
} from './UI.js'

// Lazy-loaded to avoid paying startup cost when tool isn't used.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let puppeteerModule: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browser: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let page: any = null

async function getPuppeteer() {
  if (!puppeteerModule) {
    puppeteerModule = await import('puppeteer')
  }
  return puppeteerModule
}

async function getPage() {
  const puppeteer = await getPuppeteer()
  if (!browser || !browser.connected) {
    browser = await puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    })
    page = null
  }
  if (!page || page.isClosed()) {
    page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    )
  }
  return page
}

async function closeBrowser() {
  if (page && !page.isClosed()) {
    await page.close().catch(() => {})
  }
  if (browser && browser.connected) {
    await browser.close().catch(() => {})
  }
  browser = null
  page = null
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z
      .enum([
        'navigate',
        'screenshot',
        'content',
        'evaluate',
        'click',
        'type',
        'wait_for',
        'scroll',
        'close',
      ])
      .describe('Browser action to perform'),
    url: z.string().optional().describe('URL to navigate to (navigate action)'),
    selector: z
      .string()
      .optional()
      .describe('CSS selector (click, type, wait_for)'),
    script: z
      .string()
      .optional()
      .describe('JavaScript expression to evaluate (evaluate action)'),
    text: z.string().optional().describe('Text to type (type action)'),
    full_page: z
      .boolean()
      .optional()
      .describe('Capture full scrollable page (screenshot action, default false)'),
    format: z
      .enum(['text', 'html'])
      .optional()
      .describe('Content format: "text" or "html" (content action, default "text")'),
    x: z.number().optional().describe('Horizontal scroll pixels (scroll action, default 0)'),
    y: z.number().optional().describe('Vertical scroll pixels (scroll action, default 500)'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

export type Output = {
  action: string
  result: string
  screenshot?: string // base64 PNG
  width?: number
  height?: number
}

const outputSchema = lazySchema(() =>
  z.object({
    action: z.string(),
    result: z.string(),
    screenshot: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export const PuppeteerTool = buildTool({
  name: PUPPETEER_TOOL_NAME,
  searchHint: 'control a browser: navigate, screenshot, click, evaluate JS on web pages',
  maxResultSizeChars: 50_000,
  shouldDefer: true,
  async description(input) {
    const { action, url } = input as { action?: string; url?: string }
    if (action === 'navigate' && url) {
      try {
        const hostname = new URL(url).hostname
        return `Claude wants to open ${hostname} in a browser`
      } catch {
        return `Claude wants to navigate to a URL`
      }
    }
    return `Claude wants to perform browser action: ${action ?? 'unknown'}`
  },
  userFacingName() {
    return 'Browser'
  },
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `Browser: ${summary}` : 'Browser action'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return false
  },
  isReadOnly() {
    return false
  },
  async prompt() {
    return DESCRIPTION
  },
  async validateInput(input) {
    if (input.action === 'navigate' && !input.url) {
      return {
        result: false,
        message: 'The navigate action requires a url parameter.',
        meta: { reason: 'missing_url' },
        errorCode: 1,
      }
    }
    if (input.action === 'navigate' && input.url) {
      try {
        const parsed = new URL(input.url)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return {
            result: false,
            message: 'Only http and https URLs are supported.',
            meta: { reason: 'invalid_protocol' },
            errorCode: 1,
          }
        }
      } catch {
        return {
          result: false,
          message: `Invalid URL: "${input.url}"`,
          meta: { reason: 'invalid_url' },
          errorCode: 1,
        }
      }
    }
    if (['click', 'type', 'wait_for'].includes(input.action) && !input.selector) {
      return {
        result: false,
        message: `The ${input.action} action requires a selector parameter.`,
        meta: { reason: 'missing_selector' },
        errorCode: 1,
      }
    }
    if (input.action === 'type' && !input.text) {
      return {
        result: false,
        message: 'The type action requires a text parameter.',
        meta: { reason: 'missing_text' },
        errorCode: 1,
      }
    }
    if (input.action === 'evaluate' && !input.script) {
      return {
        result: false,
        message: 'The evaluate action requires a script parameter.',
        meta: { reason: 'missing_script' },
        errorCode: 1,
      }
    }
    return { result: true }
  },
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolResultMessage,
  async call(input, { abortController }) {
    const { action } = input
    const signal = abortController.signal

    if (action === 'close') {
      await closeBrowser()
      return { data: { action, result: 'Browser closed.' } }
    }

    const p = await getPage()

    if (signal.aborted) {
      return { data: { action, result: 'Aborted.' } }
    }

    switch (action) {
      case 'navigate': {
        await p.goto(input.url!, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        const title = await p.title()
        return { data: { action, result: `Navigated to: ${input.url} — Title: "${title}"` } }
      }

      case 'screenshot': {
        const buf: Buffer = await p.screenshot({
          fullPage: input.full_page ?? false,
          type: 'png',
        })
        const viewport = p.viewport()
        const screenshot = buf.toString('base64')
        return {
          data: {
            action,
            result: `Screenshot captured (${viewport?.width ?? '?'}×${viewport?.height ?? '?'})`,
            screenshot,
            width: viewport?.width,
            height: viewport?.height,
          },
        }
      }

      case 'content': {
        let result: string
        if ((input.format ?? 'text') === 'html') {
          result = await p.content()
        } else {
          result = await p.evaluate(
            () => document.body?.innerText ?? document.documentElement.innerText ?? '',
          )
        }
        return { data: { action, result: result.slice(0, 50_000) } }
      }

      case 'evaluate': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = await p.evaluate(input.script!)
        const result =
          typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)
        return { data: { action, result: result?.slice(0, 10_000) ?? 'undefined' } }
      }

      case 'click': {
        await p.click(input.selector!, { timeout: 10_000 })
        return { data: { action, result: `Clicked: ${input.selector}` } }
      }

      case 'type': {
        await p.click(input.selector!, { timeout: 10_000 })
        await p.type(input.selector!, input.text!)
        return { data: { action, result: `Typed into: ${input.selector}` } }
      }

      case 'wait_for': {
        await p.waitForSelector(input.selector!, { timeout: 10_000 })
        return { data: { action, result: `Selector ready: ${input.selector}` } }
      }

      case 'scroll': {
        await p.evaluate(
          ({ x, y }: { x: number; y: number }) => window.scrollBy(x, y),
          { x: input.x ?? 0, y: input.y ?? 500 },
        )
        return { data: { action, result: `Scrolled by (${input.x ?? 0}, ${input.y ?? 500})` } }
      }

      default:
        return { data: { action, result: `Unknown action: ${action}` } }
    }
  },
  mapToolResultToToolResultBlockParam({ screenshot, result }, toolUseID): ToolResultBlockParam {
    if (screenshot) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: [
          { type: 'text', text: result },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png' as const,
              data: screenshot,
            },
          },
        ],
      }
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: result,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
