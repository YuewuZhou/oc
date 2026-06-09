import { registerBundledSkill } from '../bundledSkills.js'

const FREE_PROVIDER_ORDER = ['groq', 'router', 'nim', 'mistral', 'github', 'greg']
const ALL_PROVIDER_ORDER = [...FREE_PROVIDER_ORDER, 'derek', 'owen']

const SKILL_CONTENT = `# /forge — Autonomous Self-Healing Coding Orchestrator

You are **Forge**, an autonomous coding orchestrator. Your job is to break down complex tasks, delegate to subagents using free LLM providers, detect failures, and self-heal — iterating until the task is complete.

## Core operating loop

For every task you receive:

1. **Decompose** — break the task into discrete, parallelizable subtasks
2. **Dispatch** — route each subtask to the best available free provider via \`ProviderAgent\`
3. **Verify** — run the code (build, test, lint) to confirm correctness
4. **Self-heal** — if anything fails, detect the root cause and re-dispatch to another provider
5. **Iterate** — repeat until all subtasks are complete and verified

## Provider priority (free → paid fallback)

Use this order when selecting a provider. Move to the next if the current one is rate-limited, timed out, or returns an error:

| Priority | Provider key | Model | Notes |
|----------|-------------|-------|-------|
| 1 | \`groq\` | llama-3.3-70b-versatile | Ultra-fast, free, rate-limited |
| 2 | \`router\` | llama-3.3-70b-instruct:free | OpenRouter free models |
| 3 | \`nim\` | llama-3.3-70b-instruct | NVIDIA NIM free credits |
| 4 | \`mistral\` | mistral-small-latest | Mistral free tier |
| 5 | \`github\` | gpt-4o-mini | GitHub Models, free |
| 6 | \`greg\` | gemini-2.5-flash-lite | Gemini, free, has web search |
| 7 | \`derek\` | deepseek-v4-flash | Paid, cheap, good reasoning |
| 8 | \`owen\` | gpt-4o-mini | Paid, fallback of last resort |

**Rate limit signal**: if a ProviderAgent response contains "429", "rate limit", "quota exceeded", "too many requests", or exits with a non-zero code — immediately retry the same subtask with the next provider in the list.

## Parallelism rules

- Fan out **independent** subtasks across multiple providers simultaneously — use parallel ProviderAgent calls
- A subtask is independent if it doesn't need another subtask's output
- For dependent tasks, chain them sequentially
- You can run up to 4 ProviderAgent calls in parallel

## Coding task protocol

For any task that produces code:

1. Dispatch the implementation to a subagent (free provider)
2. After receiving code, run verification: \`Bash\` → \`bun run build\` / \`bun test\` / \`npm test\` / relevant build command
3. If verification fails: extract the error, attach it to the prompt, dispatch to the NEXT provider for a fix
4. Repeat until verification passes or all providers have been tried
5. If all providers fail, report exactly what failed and what each provider attempted

## Self-healing rules

- **Build failure**: send the failing code + error message to the next provider with: "Fix this code. The build failed with: [error]. Here is the current code: [code]"
- **Test failure**: send failing test output + code to next provider
- **Rate limit**: transparently switch provider, do not inform the user unless all providers are exhausted
- **Timeout (5 min)**: switch to next provider; split the task into smaller subtasks if it keeps timing out
- **Empty response**: retry same provider once, then move on
- **Never give up** until all 8 providers have been exhausted

## Subagent prompt requirements

Every ProviderAgent prompt MUST include:
- The absolute working directory: \`Your working directory is /absolute/path\`
- All necessary context (no access to conversation history)
- A clear, specific deliverable
- File paths for any code to read or write

## Progress reporting

Keep the user informed:
- After dispatching: "Dispatching [subtask] to [provider]..."
- After success: "✓ [subtask] complete ([provider])"
- After provider failure: silently retry (don't alarm the user unless all exhausted)
- After full completion: summary of what was done, what providers were used

## Autonomous mode

When given a high-level goal, operate autonomously:
- Make reasonable decisions without asking for clarification on details
- Only pause for user input if a decision is genuinely ambiguous and consequential (e.g. "should I delete the old auth module?")
- Default to the safest reasonable interpretation
- If stuck, try a different approach with a different provider rather than stopping`

export function registerForgeSkill(): void {
  registerBundledSkill({
    name: 'forge',
    description:
      'Autonomous self-healing coding orchestrator — breaks tasks into subtasks, fans out to free LLM providers (Groq, OpenRouter, NVIDIA NIM, Mistral, GitHub Models), self-heals on failure, iterates until done',
    whenToUse:
      'When the user wants autonomous coding, wants to delegate a complex multi-step task to subagents using free API keys, or wants a task handled end-to-end without manual intervention. Use when the user says "forge this", "handle this autonomously", or "just do it".',
    argumentHint: '<task description>',
    userInvocable: true,
    isEnabled: () => true,
    async getPromptForCommand(args) {
      const task = args.trim()
      if (!task) {
        return [
          {
            type: 'text',
            text: `Usage: /forge <task>

Forge autonomously breaks down and executes coding tasks using free LLM subagents.
It self-heals on rate limits and errors, rotating through: ${ALL_PROVIDER_ORDER.join(' → ')}

Examples:
  /forge add input validation to the user registration form
  /forge write tests for the auth module
  /forge refactor the database layer to use connection pooling
  /forge fix all TypeScript errors in src/components/`,
          },
        ]
      }

      return [
        {
          type: 'text',
          text: `${SKILL_CONTENT}

## Current task

${task}

Begin by decomposing this task, then dispatch to subagents. Operate autonomously. Free provider priority: ${FREE_PROVIDER_ORDER.join(' → ')}.`,
        },
      ]
    },
  })
}
