import { afterEach, expect, test } from 'bun:test'

import { resolveProviderRequest } from './providerConfig.ts'

const originalEnv = {
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_LARGE_MODEL: process.env.OPENAI_LARGE_MODEL,
  OPENAI_SMALL_MODEL: process.env.OPENAI_SMALL_MODEL,
  OPENAI_MODEL_HEURISTICS: process.env.OPENAI_MODEL_HEURISTICS,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
}

afterEach(() => {
  process.env.OPENAI_MODEL = originalEnv.OPENAI_MODEL
  process.env.OPENAI_LARGE_MODEL = originalEnv.OPENAI_LARGE_MODEL
  process.env.OPENAI_SMALL_MODEL = originalEnv.OPENAI_SMALL_MODEL
  process.env.OPENAI_MODEL_HEURISTICS = originalEnv.OPENAI_MODEL_HEURISTICS
  process.env.OPENAI_BASE_URL = originalEnv.OPENAI_BASE_URL
})

test('uses small model for light OpenAI requests by default', () => {
  delete process.env.OPENAI_MODEL
  delete process.env.OPENAI_LARGE_MODEL
  delete process.env.OPENAI_SMALL_MODEL
  delete process.env.OPENAI_MODEL_HEURISTICS

  const result = resolveProviderRequest()

  expect(result.requestedModel).toBe('gpt-5.4-mini')
  expect(result.resolvedModel).toBe('gpt-5.4-mini')
})

test('uses large model for high-effort requests', () => {
  delete process.env.OPENAI_MODEL

  const result = resolveProviderRequest({
    routingContext: { effortValue: 'high' },
  })

  expect(result.requestedModel).toBe('gpt-5.4')
  expect(result.resolvedModel).toBe('gpt-5.4')
})

test('preserves explicit model override', () => {
  const result = resolveProviderRequest({
    model: 'gpt-5.4',
    routingContext: { effortValue: 'low' },
  })

  expect(result.requestedModel).toBe('gpt-5.4')
  expect(result.resolvedModel).toBe('gpt-5.4')
})

test('preserves codex alias behavior', () => {
  const result = resolveProviderRequest({ model: 'codexplan' })

  expect(result.transport).toBe('codex_responses')
  expect(result.resolvedModel).toBe('gpt-5.4')
  expect(result.reasoning).toEqual({ effort: 'high' })
})
