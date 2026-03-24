import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../server/gateway'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'

type SpawnResponse = {
  ok?: boolean
  sessionKey?: string
  childSessionKey?: string
  error?: string
}

let cachedSkill: string | null = null

function loadDispatchSkill(): string {
  if (cachedSkill) return cachedSkill
  try {
    // Try ClawSuite repo first, then workspace
    const candidates = [
      resolve(process.cwd(), 'skills/workspace-dispatch/SKILL.md'),
      resolve(process.env.HOME ?? '~', '.openclaw/workspace/skills/workspace-dispatch/SKILL.md'),
    ]
    for (const path of candidates) {
      try {
        cachedSkill = readFileSync(path, 'utf-8')
        return cachedSkill
      } catch {
        continue
      }
    }
  } catch {
    // ignore
  }
  // Inline fallback if file not found
  return ''
}

function buildOrchestratorPrompt(goal: string, skill: string): string {
  const lines = [
    'You are a mission orchestrator. Execute this mission autonomously.',
    '',
    '## Dispatch Skill Instructions',
    '',
    skill,
    '',
    '## Mission',
    '',
    `Goal: ${goal}`,
    '',
    '## Critical Rules',
    '- Use sessions_spawn to create worker agents for each task',
    '- Do NOT do the work yourself — spawn workers',
    '- Do NOT ask for confirmation — start immediately',
    '- Label workers as "worker-<task-slug>" so the UI can track them',
    '- Each worker gets a self-contained prompt with the task + exit criteria',
    '- Verify exit criteria after each worker completes',
    '- Report a summary when all tasks are done',
  ]
  return lines.join('\n')
}

export const Route = createFileRoute('/api/conductor-spawn')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
          const goal = typeof body.goal === 'string' ? body.goal.trim() : ''

          if (!goal) {
            return json({ ok: false, error: 'goal required' }, { status: 400 })
          }

          const skill = loadDispatchSkill()
          const prompt = buildOrchestratorPrompt(goal, skill)

          // Spawn a dedicated orchestrator session via gateway
          const result = await gatewayRpc<SpawnResponse>('sessions.spawn', {
            task: prompt,
            label: `conductor-${Date.now()}`,
            mode: 'run',
            runTimeoutSeconds: 900,
          })

          const sessionKey = result.childSessionKey ?? result.sessionKey ?? null

          return json({
            ok: true,
            sessionKey,
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
