import React from 'react'
import { Text } from '../../ink.js'
import type { ToolProgressData } from '../../Tool.js'
import { truncate } from '../../utils/format.js'
import { TOOL_SUMMARY_MAX_LENGTH } from '../../constants/toolLimits.js'
import type { Output } from './PuppeteerTool.js'

export function renderToolUseMessage(
  input: Partial<{ action: string; url: string; selector: string; script: string }>,
  { verbose }: { theme?: string; verbose: boolean },
): React.ReactNode {
  const { action, url, selector, script } = input
  if (!action) return null
  if (verbose) {
    if (url) return `${action}: ${url}`
    if (selector) return `${action}: ${selector}`
    if (script) return `${action}: ${truncate(script, 60)}`
    return action
  }
  if (url) {
    try {
      return `${action} → ${new URL(url).hostname}`
    } catch {
      return action
    }
  }
  return selector ? `${action} → ${selector}` : action
}

export function renderToolUseProgressMessage(): React.ReactNode {
  return <Text dimColor>Browser…</Text>
}

export function renderToolResultMessage(
  output: Output,
  _progress: { type: string; data: ToolProgressData }[],
  { verbose }: { verbose: boolean },
): React.ReactNode {
  const { action, result, width, height } = output
  if (action === 'screenshot' && width && height) {
    return (
      <Text>
        Screenshot{' '}
        <Text bold>
          {width}×{height}
        </Text>
      </Text>
    )
  }
  if (verbose) {
    return <Text>{truncate(result, 200)}</Text>
  }
  return <Text dimColor>{truncate(result, 80)}</Text>
}

export function getToolUseSummary(
  input: Partial<{ action: string; url: string; selector: string }> | undefined,
): string | null {
  if (!input?.action) return null
  const detail = input.url ?? input.selector ?? ''
  const summary = detail ? `${input.action} ${detail}` : input.action
  return truncate(summary, TOOL_SUMMARY_MAX_LENGTH)
}
