import { spawn } from 'child_process'
import * as React from 'react'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { Text } from '../../ink.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { getSessionBypassPermissionsMode } from '../../bootstrap/state.js'

export const PROVIDER_AGENT_TOOL_NAME = 'ProviderAgent'

const TIMEOUT_MS = 5 * 60 * 1000

// All OpenAI-compatible providers. `useGemini` sets CLAUDE_CODE_USE_GEMINI=1
// instead of CLAUDE_CODE_USE_OPENAI=1 (Gemini needs its own flag for the shim).
type ProviderName =
  | 'greg'
  | 'derek'
  | 'owen'
  | 'groq'
  | 'router'
  | 'nim'
  | 'mistral'
  | 'github'

type ProviderConfig = {
  label: string
  apiKeyEnv: string
  baseUrl: string
  modelEnv: string
  defaultModel: string
  useGemini?: true
}

const PROVIDERS: Record<ProviderName, ProviderConfig> = {
  greg: {
    label: 'Gemini (Google AI Studio)',
    apiKeyEnv: 'GEMINI_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelEnv: 'GEMINI_MODEL',
    defaultModel: 'gemini-2.5-flash-lite',
    useGemini: true,
  },
  derek: {
    label: 'DeepSeek',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
    modelEnv: 'DEEPSEEK_MODEL',
    defaultModel: 'deepseek-v4-flash',
  },
  owen: {
    label: 'OpenAI',
    apiKeyEnv: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    modelEnv: 'OPENAI_MODEL',
    defaultModel: 'gpt-4o-mini',
  },
  groq: {
    label: 'Groq (free)',
    apiKeyEnv: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelEnv: 'GROQ_MODEL',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  router: {
    label: 'OpenRouter (free models)',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelEnv: 'OPENROUTER_MODEL',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
  },
  nim: {
    label: 'NVIDIA NIM (free)',
    apiKeyEnv: 'NVIDIA_API_KEY',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    modelEnv: 'NVIDIA_MODEL',
    defaultModel: 'meta/llama-3.3-70b-instruct',
  },
  mistral: {
    label: 'Mistral AI (free tier)',
    apiKeyEnv: 'MISTRAL_API_KEY',
    baseUrl: 'https://api.mistral.ai/v1',
    modelEnv: 'MISTRAL_MODEL',
    defaultModel: 'mistral-small-latest',
  },
  github: {
    label: 'GitHub Models (free)',
    apiKeyEnv: 'GITHUB_TOKEN',
    baseUrl: 'https://models.inference.ai.azure.com',
    modelEnv: 'GITHUB_MODEL',
    defaultModel: 'gpt-4o-mini',
  },
}

const MAX_BUFFER_CHARS = 8 * 1024 * 1024

const inputSchema = lazySchema(() =>
  z.strictObject({
    description: z
      .string()
      .describe('A short (3-5 word) description of the task'),
    prompt: z.string().describe('The task prompt to send to the subagent'),
    provider: z
      .enum([
        'greg',
        'derek',
        'owen',
        'groq',
        'router',
        'nim',
        'mistral',
        'github',
      ])
      .describe(
        'Which provider to use: greg=Gemini, derek=DeepSeek, owen=OpenAI, groq=Groq, router=OpenRouter, nim=NVIDIA NIM, mistral=Mistral, github=GitHub Models',
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    response: z.string().describe('The subagent response text'),
    exitCode: z.number().describe('Exit code from the subagent process'),
    provider: z.string().describe('Provider that handled this request'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

function buildProviderEnv(name: ProviderName): NodeJS.ProcessEnv {
  const config = PROVIDERS[name]
  const apiKey = process.env[config.apiKeyEnv]
  const model = process.env[config.modelEnv] ?? config.defaultModel

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OPENAI_BASE_URL: config.baseUrl,
    OPENAI_MODEL: model,
    OPENAI_API_KEY: apiKey ?? '',
    // Clear the other provider flag so there's no ambiguity
    CLAUDE_CODE_USE_GEMINI: config.useGemini ? '1' : '',
    CLAUDE_CODE_USE_OPENAI: config.useGemini ? '' : '1',
  }

  if (config.useGemini) {
    env.GEMINI_MODEL = model
  }

  return env
}

function runProviderAgent(
  prompt: string,
  provider: ProviderName,
  signal: AbortSignal,
): Promise<Output> {
  const config = PROVIDERS[provider]
  const apiKey = process.env[config.apiKeyEnv]

  if (!apiKey) {
    return Promise.reject(
      new Error(
        `Provider "${provider}" (${config.label}) requires ${config.apiKeyEnv} to be set in .env`,
      ),
    )
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const cliPath = process.argv[1]!
    const args = [cliPath, '-p']
    const env = buildProviderEnv(provider)

    if (getSessionBypassPermissionsMode()) {
      args.push('--dangerously-skip-permissions')
      env.IS_SANDBOX = '1'
    }

    const existingNodeOptions = env.NODE_OPTIONS ?? ''
    if (!existingNodeOptions.includes('--max-old-space-size')) {
      env.NODE_OPTIONS = `--max-old-space-size=1024 ${existingNodeOptions}`.trim()
    }

    const child = spawn(process.execPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      cwd: process.cwd(),
    })

    let stdout = ''
    let stderr = ''
    let stdoutTruncated = false
    let stderrTruncated = false

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdoutTruncated) return
      stdout += chunk.toString()
      if (stdout.length > MAX_BUFFER_CHARS) {
        stdout = stdout.slice(0, MAX_BUFFER_CHARS) + '\n[output truncated at 8 MB]'
        stdoutTruncated = true
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrTruncated) return
      stderr += chunk.toString()
      if (stderr.length > MAX_BUFFER_CHARS) {
        stderr = stderr.slice(0, MAX_BUFFER_CHARS) + '\n[stderr truncated at 8 MB]'
        stderrTruncated = true
      }
    })

    const timeoutId = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      setTimeout(() => { if (!child.killed) child.kill('SIGKILL') }, 5000)
      reject(new Error(`ProviderAgent(${provider}) timed out after ${TIMEOUT_MS / 1000}s`))
    }, TIMEOUT_MS)

    const onAbort = () => {
      clearTimeout(timeoutId)
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      setTimeout(() => { if (!child.killed) child.kill('SIGKILL') }, 5000)
      reject(new Error(`ProviderAgent(${provider}) aborted`))
    }
    signal.addEventListener('abort', onAbort, { once: true })

    child.on('close', (code) => {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', onAbort)
      if (settled) return
      settled = true
      resolve({
        response: stdout.trim() || stderr.trim(),
        exitCode: code ?? 1,
        provider: config.label,
      })
    })

    child.on('error', (err) => {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', onAbort)
      if (settled) return
      settled = true
      reject(err)
    })

    child.stdin.end(prompt)
  })
}

export const ProviderAgentTool = buildTool({
  name: PROVIDER_AGENT_TOOL_NAME,
  searchHint:
    'delegate a task to a specific LLM provider: Gemini, Groq, OpenRouter, NVIDIA NIM, Mistral, GitHub Models, DeepSeek, or OpenAI',
  maxResultSizeChars: 100_000,

  async description(input) {
    const { description, provider } = input as {
      description: string
      provider: ProviderName
    }
    const config = PROVIDERS[provider]
    return `ProviderAgent(${config?.label ?? provider}): ${description}`
  },

  async prompt() {
    const providerList = Object.entries(PROVIDERS)
      .map(([k, v]) => `  - ${k}: ${v.label} — default model: ${v.defaultModel}`)
      .join('\n')

    return `Routes a focused task to a specific LLM provider and returns the result.

Available providers (set key in .env to enable):
${providerList}

Usage guidelines:
- Use "groq", "router", "nim", "mistral", or "github" for tasks that benefit from free-tier providers
- Use "greg" (Gemini) for tasks needing native Google Search grounding
- Use "derek" (DeepSeek) for cost-efficient reasoning tasks
- Parallel calls with different providers let you compare outputs or fan out work
- The subagent has no access to the current conversation — include all needed context in the prompt
- Best for: isolated lookups, code generation, research, parallel subtasks`
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
    return (input as { prompt?: string }).prompt ?? ''
  },

  async call({ prompt, provider }, { abortController }) {
    const output = await runProviderAgent(
      prompt,
      provider as ProviderName,
      abortController.signal,
    )
    return { data: output }
  },

  mapToolResultToToolResultBlockParam({ response, exitCode, provider }, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content:
        exitCode !== 0
          ? `ProviderAgent(${provider}) exited with code ${exitCode}:\n${response}`
          : `[${provider}]\n${response}`,
    }
  },

  renderToolUseMessage(input) {
    const { description, provider } = input as Partial<{
      description: string
      provider: ProviderName
    }>
    const config = provider ? PROVIDERS[provider] : undefined
    return React.createElement(
      Text,
      null,
      `ProviderAgent(${config?.label ?? provider ?? '?'}): ${description ?? '…'}`,
    )
  },

  renderToolResultMessage(output) {
    const { response, exitCode, provider } = output
    if (exitCode !== 0) {
      return React.createElement(
        Text,
        null,
        `ProviderAgent(${provider}) failed (exit ${exitCode}): ${response.slice(0, 200)}`,
      )
    }
    return React.createElement(
      Text,
      null,
      `[${provider}] ${response.slice(0, 200)}`,
    )
  },
} satisfies ToolDef<InputSchema, Output>)
