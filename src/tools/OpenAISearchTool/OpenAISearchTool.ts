import * as React from 'react'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { Text } from '../../ink.js'
import { lazySchema } from '../../utils/lazySchema.js'

export const OPENAI_SEARCH_TOOL_NAME = 'OpenAISearch'

const inputSchema = lazySchema(() =>
  z.strictObject({
    query: z.string().min(1).describe('The search query'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    answer: z.string().describe('Synthesized answer from OpenAI with web grounding'),
    sources: z
      .array(z.object({ title: z.string(), uri: z.string() }))
      .describe('Source URLs cited in the answer'),
    durationMs: z.number().describe('Time taken for the search call'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

// OpenAI Responses API types
type UrlCitationAnnotation = {
  type: 'url_citation'
  url: string
  title?: string
  start_index?: number
  end_index?: number
}

type OutputTextContent = {
  type: 'output_text'
  text: string
  annotations?: UrlCitationAnnotation[]
}

type ResponsesOutput =
  | { type: 'web_search_call'; id: string; status: string }
  | { type: 'message'; role: string; content: OutputTextContent[] }

type ResponsesAPIResponse = {
  output?: ResponsesOutput[]
  error?: { message: string; code?: string | number }
}

// Chat completions fallback types
type ChatAnnotation = {
  type: 'url_citation'
  url_citation?: { url: string; title?: string }
  url?: string
  title?: string
}

type ChatCompletionsResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type: string; text?: string; annotations?: ChatAnnotation[] }>
      annotations?: ChatAnnotation[]
    }
  }>
  error?: { message: string }
}

async function callOpenAISearch(query: string, signal: AbortSignal): Promise<Output> {
  // OPENAI_SEARCH_API_KEY lets Derek (or any provider that overrides OPENAI_API_KEY
  // for its main model) still reach the real OpenAI search endpoint.
  const apiKey = process.env.OPENAI_SEARCH_API_KEY ?? process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY (or OPENAI_SEARCH_API_KEY) not set')

  const model = process.env.OPENAI_SEARCH_MODEL ?? 'gpt-4o-mini'
  const baseUrl = (process.env.OPENAI_SEARCH_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')

  const start = Date.now()

  // Try the Responses API first (OpenAI's new unified search endpoint)
  const responsesUrl = `${baseUrl}/responses`
  const res = await fetch(responsesUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      tools: [{ type: 'web_search_preview' }],
      input: query,
    }),
    signal,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    // If Responses API not available, fall back to Chat Completions with web_search tool
    if (res.status === 404 || res.status === 400) {
      return callOpenAISearchViaChat(query, model, baseUrl, apiKey, start, signal)
    }
    throw new Error(`OpenAI search error ${res.status}: ${errText}`)
  }

  const body = (await res.json()) as ResponsesAPIResponse
  if (body.error) {
    throw new Error(`OpenAI search error: ${body.error.message}`)
  }

  // Parse the Responses API output
  let answer = ''
  const sources: { title: string; uri: string }[] = []

  for (const item of body.output ?? []) {
    if (item.type === 'message') {
      for (const block of item.content ?? []) {
        if (block.type === 'output_text') {
          answer += block.text
          for (const ann of block.annotations ?? []) {
            if (ann.type === 'url_citation' && ann.url) {
              const existing = sources.find(s => s.uri === ann.url)
              if (!existing) {
                sources.push({ title: ann.title || ann.url, uri: ann.url })
              }
            }
          }
        }
      }
    }
  }

  return { answer, sources, durationMs: Date.now() - start }
}

// Fallback: Chat Completions with web_search tool type
async function callOpenAISearchViaChat(
  query: string,
  model: string,
  baseUrl: string,
  apiKey: string,
  start: number,
  signal: AbortSignal,
): Promise<Output> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      tools: [{ type: 'web_search_preview' }],
      messages: [{ role: 'user', content: query }],
    }),
    signal,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`OpenAI search error ${res.status}: ${errText}`)
  }

  const body = (await res.json()) as ChatCompletionsResponse
  if (body.error) throw new Error(`OpenAI search error: ${body.error.message}`)

  const msg = body.choices?.[0]?.message
  let answer = ''
  const sources: { title: string; uri: string }[] = []

  // Content can be a string or an array of content blocks
  if (typeof msg?.content === 'string') {
    answer = msg.content
  } else if (Array.isArray(msg?.content)) {
    for (const block of msg.content) {
      if (block.text) answer += block.text
      for (const ann of block.annotations ?? []) {
        const url = ann.url_citation?.url ?? ann.url
        const title = ann.url_citation?.title ?? ann.title ?? url
        if (url) {
          const existing = sources.find(s => s.uri === url)
          if (!existing) sources.push({ title: title ?? url, uri: url })
        }
      }
    }
  }

  // Top-level annotations fallback (some response formats)
  for (const ann of msg?.annotations ?? []) {
    const url = ann.url_citation?.url ?? ann.url
    const title = ann.url_citation?.title ?? ann.title ?? url
    if (url && !sources.find(s => s.uri === url)) {
      sources.push({ title: title ?? url, uri: url })
    }
  }

  return { answer, sources, durationMs: Date.now() - start }
}

export const OpenAISearchTool = buildTool({
  name: OPENAI_SEARCH_TOOL_NAME,
  searchHint: 'search the web using OpenAI unified web search',
  maxResultSizeChars: 50_000,

  isEnabled() {
    const key = process.env.OPENAI_SEARCH_API_KEY ?? process.env.OPENAI_API_KEY
    return !!(key && process.env.OPENAI_SEARCH_MODEL)
  },

  async description(input) {
    return `OpenAI web search: ${(input as { query?: string }).query ?? ''}`
  },

  async prompt() {
    return `Search the web using OpenAI's unified web search (web_search_preview).
- Returns a synthesized answer
- Use for current events, recent docs, and factual queries
- Only cite sources when the user asks you to — otherwise just the answer saves tokens`
  },

  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },

  isConcurrencySafe() {
    return true
  },

  isReadOnly() {
    return true
  },

  toAutoClassifierInput(input) {
    return (input as { query?: string }).query ?? ''
  },

  async call({ query }, { abortController }) {
    const data = await callOpenAISearch(query, abortController.signal)
    return { data }
  },

  mapToolResultToToolResultBlockParam({ answer, sources }, toolUseID) {
    // Terse: just answer text. Only cite sources when the user asks.
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: sources.length
        ? answer + '\n\n' + sources.map(s => s.uri).join('\n')
        : answer,
    }
  },

  renderToolUseMessage(input) {
    const { query } = input as Partial<{ query: string }>
    return React.createElement(Text, null, query ? `OpenAISearch: "${query}"` : 'Searching…')
  },

  renderToolResultMessage({ sources, durationMs }) {
    const t = durationMs >= 1000 ? `${Math.round(durationMs / 1000)}s` : `${durationMs}ms`
    return React.createElement(
      Text,
      null,
      `Found ${sources.length} source${sources.length !== 1 ? 's' : ''} in ${t}`,
    )
  },
} satisfies ToolDef<InputSchema, Output>)
