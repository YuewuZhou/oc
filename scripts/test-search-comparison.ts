#!/usr/bin/env bun
// Multi-model search comparison: OpenAI Responses API vs Gemini grounded search
// Usage: bun run scripts/test-search-comparison.ts "your query here"

import { readFileSync } from 'fs'
import { join } from 'path'

// Load .env (??= so shell env takes precedence)
const envPath = join(import.meta.dir, '..', '.env')
try {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?\s*$/)
    if (m) process.env[m[1]] ??= m[2]
  }
} catch { /* no .env */ }

const query = process.argv[2] ?? 'What are the latest AI model releases in 2025?'
const ANSWER_CHARS = 500

console.log(`\nQuery: "${query}"\n${'─'.repeat(70)}\n`)

// ── OpenAI Responses API ──────────────────────────────────────────────────────
async function testOpenAI(model: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) { console.error(`[openai/${model}] OPENAI_API_KEY not set`); return }

  const tag = `openai/${model}`
  const start = Date.now()

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, tools: [{ type: 'web_search_preview' }], input: query }),
  })

  if (!res.ok) {
    const txt = await res.text()
    console.log(`[${tag}] HTTP ${res.status}: ${txt.slice(0, 200)}\n`)
    return
  }

  const body = await res.json() as any
  const ms = Date.now() - start

  let answer = ''
  const sources: string[] = []
  for (const item of body.output ?? []) {
    if (item.type === 'message') {
      for (const block of item.content ?? []) {
        if (block.type === 'output_text') {
          answer += block.text
          for (const ann of block.annotations ?? []) {
            if (ann.type === 'url_citation' && ann.url) {
              const exists = sources.some(s => s.includes(ann.url))
              if (!exists) sources.push(`  - [${ann.title || ann.url}](${ann.url})`)
            }
          }
        }
      }
    }
  }

  const lines = [
    `[${tag}] ${ms}ms | ${sources.length} sources`,
    answer.slice(0, ANSWER_CHARS) + (answer.length > ANSWER_CHARS ? '…' : ''),
    sources.length ? '\nSources:\n' + sources.join('\n') : '',
    '',
  ]
  console.log(lines.filter(Boolean).join('\n'))
}

// ── Gemini grounded search ────────────────────────────────────────────────────
async function testGemini(model: string): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) { console.error(`[gemini/${model}] GEMINI_API_KEY not set`); return }

  const tag = `gemini/${model}`
  const start = Date.now()

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: query }] }],
        tools: [{ google_search: {} }],
      }),
    },
  )

  if (!res.ok) {
    const txt = await res.text()
    console.log(`[${tag}] HTTP ${res.status}: ${txt.slice(0, 200)}\n`)
    return
  }

  const body = await res.json() as any
  const ms = Date.now() - start

  const candidate = body.candidates?.[0]
  const answer = candidate?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? ''
  const sources: string[] = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .filter((c: any) => c.web?.uri)
    .map((c: any) => `  - [${c.web.title || c.web.uri}](${c.web.uri})`)

  const lines = [
    `[${tag}] ${ms}ms | ${sources.length} sources`,
    answer.slice(0, ANSWER_CHARS) + (answer.length > ANSWER_CHARS ? '…' : ''),
    sources.length ? '\nSources:\n' + sources.join('\n') : '',
    '',
  ]
  console.log(lines.filter(Boolean).join('\n'))
}

await Promise.all([
  testOpenAI('gpt-4o-mini'),
  testOpenAI('gpt-5-nano'),
  testOpenAI('gpt-5.4-nano'),
  testGemini('gemini-2.5-flash-lite'),
  testGemini('gemini-3.1-flash-lite'),
])
