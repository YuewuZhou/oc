import * as React from 'react'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { Text } from '../../ink.js'
import { lazySchema } from '../../utils/lazySchema.js'

export const GEMINI_SEARCH_TOOL_NAME = 'GeminiSearch'

const inputSchema = lazySchema(() =>
  z.strictObject({
    query: z.string().min(1).describe('The search query'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    answer: z.string().describe('Synthesized answer from Gemini with web grounding'),
    sources: z
      .array(z.object({ title: z.string(), uri: z.string() }))
      .describe('Grounded source URLs cited in the answer'),
    durationMs: z.number().describe('Time taken for the search call'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

type GeminiPart = { text?: string }
type GeminiGroundingChunk = { web?: { uri: string; title: string } }
type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] }
    groundingMetadata?: {
      groundingChunks?: GeminiGroundingChunk[]
    }
  }>
  error?: { message: string; code: number }
}

async function callGeminiSearch(query: string, signal: AbortSignal): Promise<Output> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  // Prefer a model that supports grounded search; fall back to the configured one.
  const model = process.env.GEMINI_SEARCH_MODEL ?? process.env.GEMINI_MODEL ?? 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const start = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: query }] }],
      tools: [{ google_search: {} }],
    }),
    signal,
  })

  const body = (await res.json()) as GeminiResponse
  if (!res.ok || body.error) {
    throw new Error(`Gemini search error ${res.status}: ${body.error?.message ?? res.statusText}`)
  }

  const candidate = body.candidates?.[0]
  const answer = candidate?.content?.parts?.map(p => p.text ?? '').join('') ?? ''
  const sources = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .filter((c): c is { web: { uri: string; title: string } } => !!c.web?.uri)
    .map(c => ({ title: c.web.title || c.web.uri, uri: c.web.uri }))

  return { answer, sources, durationMs: Date.now() - start }
}

export const GeminiSearchTool = buildTool({
  name: GEMINI_SEARCH_TOOL_NAME,
  searchHint: 'search the web using Gemini grounded search',
  maxResultSizeChars: 50_000,

  isEnabled() {
    return !!process.env.GEMINI_API_KEY
  },

  async description(input) {
    return `Gemini web search: ${(input as { query?: string }).query ?? ''}`
  },

  async prompt() {
    return `Search the web using Gemini's native Google Search grounding.
- Returns a synthesized answer with real source citations
- Use for current events, recent docs, and factual queries
- Always include the Sources section in your response using markdown hyperlinks`
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
    const data = await callGeminiSearch(query, abortController.signal)
    return { data }
  },

  mapToolResultToToolResultBlockParam({ answer, sources }, toolUseID) {
    let content = answer
    if (sources.length > 0) {
      content +=
        '\n\nSources:\n' + sources.map(s => `- [${s.title}](${s.uri})`).join('\n')
    }
    content += '\n\nREMINDER: Include the sources above in your response as markdown hyperlinks.'
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content,
    }
  },

  renderToolUseMessage(input) {
    const { query } = input as Partial<{ query: string }>
    return React.createElement(Text, null, query ? `GeminiSearch: "${query}"` : 'Searching…')
  },

  renderToolResultMessage({ sources, durationMs }) {
    const t = durationMs >= 1000 ? `${Math.round(durationMs / 1000)}s` : `${durationMs}ms`
    return React.createElement(Text, null, `Found ${sources.length} source${sources.length !== 1 ? 's' : ''} in ${t}`)
  },
} satisfies ToolDef<InputSchema, Output>)
