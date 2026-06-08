import { spawn } from 'child_process'
import * as React from 'react'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { Text } from '../../ink.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { getSessionBypassPermissionsMode } from '../../bootstrap/state.js'

export const OPEN_CLAUDE_TOOL_NAME = 'SubAgent'

const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

const inputSchema = lazySchema(() =>
  z.strictObject({
    description: z
      .string()
      .describe('A short (3-5 word) description of the task'),
    prompt: z.string().describe('The task prompt to send to the subagent'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    response: z.string().describe('The subagent response text'),
    exitCode: z.number().describe('Exit code from the subagent process'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

function runSubAgent(prompt: string, signal: AbortSignal): Promise<Output> {
  return new Promise((resolve, reject) => {
    let settled = false
    const cliPath = process.argv[1]!
    const args = [cliPath, '-p']
    const env = { ...process.env }

    if (getSessionBypassPermissionsMode()) {
      args.push('--dangerously-skip-permissions')
      env.IS_SANDBOX = '1'
    }

    const child = spawn(process.execPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      cwd: process.cwd(),
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    const timeoutId = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL')
        }
      }, 5000)
      reject(new Error(`SubAgent timed out after ${TIMEOUT_MS / 1000}s`))
    }, TIMEOUT_MS)

    const onAbort = () => {
      clearTimeout(timeoutId)
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL')
        }
      }, 5000)
      reject(new Error('SubAgent aborted'))
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

export const OpenClaudeTool = buildTool({
  name: OPEN_CLAUDE_TOOL_NAME,
  searchHint: 'delegate a focused task to a subagent instance of openclaude',
  maxResultSizeChars: 100_000,

  async description(input) {
    const { description } = input as { description: string }
    return `Delegate to subagent: ${description}`
  },

  async prompt() {
    return `Runs a focused task in a separate openclaude subprocess and returns the result.

- Use this to delegate smaller, self-contained tasks that don't require shared context
- The subagent has no access to the current conversation history
- Provide all necessary context in the prompt
- The subagent runs with the same tools and permissions as the parent
- Best for: isolated code generation, one-shot lookups, parallel subtasks`
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
    return input.prompt ?? ''
  },

  async call({ prompt }, { abortController }) {
    const output = await runSubAgent(prompt, abortController.signal)
    return { data: output }
  },

  mapToolResultToToolResultBlockParam({ response, exitCode }, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content:
        exitCode !== 0
          ? `SubAgent exited with code ${exitCode}:\n${response}`
          : response,
    }
  },

  renderToolUseMessage(input) {
    const { description, prompt } = input as Partial<{
      description: string
      prompt: string
    }>
    return React.createElement(
      Text,
      null,
      description
        ? `SubAgent: ${description}`
        : prompt
          ? prompt.slice(0, 80)
          : 'Running subagent…',
    )
  },

  renderToolResultMessage(output) {
    const { response, exitCode } = output
    if (exitCode !== 0) {
      return React.createElement(
        Text,
        null,
        `SubAgent failed (exit ${exitCode}): ${response.slice(0, 200)}`,
      )
    }
    return React.createElement(Text, null, response.slice(0, 200))
  },
} satisfies ToolDef<InputSchema, Output>)
