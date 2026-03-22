import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { isAuthenticated } from '../../../server/auth-middleware'
import { WORKSPACE_DAEMON_ORIGIN } from '../../../server/workspace-config'

const MAX_DEPTH = 3
const MAX_TEXT_FILE_SIZE = 30 * 1024
const SKIP_DIRS = new Set(['node_modules', '.git'])
const TEXT_FILE_EXTENSIONS = new Set([
  '.css',
  '.csv',
  '.env',
  '.gitignore',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.sql',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
])

type ProjectFileEntry = {
  relativePath: string
  size: number
  isText: boolean
  content?: string
}

function getDirentParent(entry: unknown): string | undefined {
  if (!entry || typeof entry !== 'object') return undefined
  const record = entry as { parentPath?: unknown; path?: unknown }
  if (typeof record.parentPath === 'string') return record.parentPath
  if (typeof record.path === 'string') return record.path
  return undefined
}

function isTextFile(filePath: string): boolean {
  return TEXT_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function getPathDepth(relativePath: string): number {
  const normalized = relativePath.split(path.sep).filter(Boolean)
  return normalized.length
}

async function readProjectFiles(projectPath: string): Promise<ProjectFileEntry[]> {
  const entries = await readdir(projectPath, { recursive: true, withFileTypes: true })
  const files: ProjectFileEntry[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue

    const parentPath = getDirentParent(entry) ?? projectPath
    const absolutePath = path.join(parentPath, entry.name)
    const relativePath = path.relative(projectPath, absolutePath)
    if (!relativePath || relativePath.startsWith('..')) continue

    const segments = relativePath.split(path.sep)
    if (segments.some((segment) => SKIP_DIRS.has(segment))) continue
    if (getPathDepth(relativePath) > MAX_DEPTH) continue

    const stat = await readFile(absolutePath, { encoding: null }).then((buffer) => ({
      buffer,
      size: buffer.byteLength,
    }))

    const text =
      isTextFile(relativePath) && stat.size <= MAX_TEXT_FILE_SIZE
        ? stat.buffer.toString('utf8')
        : undefined

    files.push({
      relativePath,
      size: stat.size,
      isText: Boolean(text !== undefined),
      content: text,
    })
  }

  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  return files
}

export const Route = createFileRoute('/api/workspace/projects/$id/files')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const daemonResponse = await fetch(
            `${WORKSPACE_DAEMON_ORIGIN}/api/workspace/projects/${encodeURIComponent(params.id)}`,
            {
              headers: { accept: 'application/json' },
              signal: AbortSignal.timeout(30_000),
            },
          )

          if (!daemonResponse.ok) {
            const text = await daemonResponse.text()
            let errorMessage = `Request failed (${daemonResponse.status})`
            try {
              const parsed = text ? (JSON.parse(text) as { error?: unknown }) : null
              if (typeof parsed?.error === 'string' && parsed.error.trim().length > 0) {
                errorMessage = parsed.error
              }
            } catch {
              if (text.trim().length > 0) errorMessage = text.trim()
            }
            return json({ ok: false, error: errorMessage }, { status: daemonResponse.status })
          }

          const payload = (await daemonResponse.json()) as { path?: unknown }
          const projectPath =
            typeof payload?.path === 'string' && payload.path.trim().length > 0
              ? payload.path
              : null

          if (!projectPath) {
            return json({ ok: false, error: 'Project path not configured' }, { status: 400 })
          }

          let files = await readProjectFiles(projectPath)
          if (files.length === 0) {
            const topLevelEntries = await readdir(projectPath)
            if (topLevelEntries.includes('.git')) {
              try {
                execFileSync('git', ['checkout', 'HEAD', '--', '.'], { cwd: projectPath })
                files = await readProjectFiles(projectPath)
              } catch {
                // Leave the response empty if the repository cannot be restored.
              }
            }
          }

          return json({
            projectPath,
            files,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to load project files'
          return json({ ok: false, error: message }, { status: 500 })
        }
      },
    },
  },
})
