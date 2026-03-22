import { useQueries, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  workspaceRequestJson,
  submitCheckpointReview,
  type WorkspaceCheckpoint,
} from '@/lib/workspace-checkpoints'
import { cn } from '@/lib/utils'
import {
  extractRunEvents,
  extractTaskRuns,
  type WorkspaceRunEvent,
  type WorkspaceTaskRun,
} from '@/screens/projects/lib/workspace-types'
import { formatRelativeTime, formatStatus } from '@/screens/projects/lib/workspace-utils'
import {
  WORKSPACE_SSE_EVENT_NAME,
  type WorkspaceSseEvent,
} from '@/hooks/use-workspace-sse'

type WorkspaceMissionMonitorProps = {
  missionId: string
}

type MissionLiveTask = {
  id: string
  name: string
  status: string
  agentId: string | null
  agentRole: string | null
  startedAt: string | null
  completedAt: string | null
  sortOrder: number
}

type MissionLiveRun = {
  id: string
  taskId: string | null
  agentId: string | null
  agentName: string | null
  status: string
  attempt: number
  startedAt: string | null
  completedAt: string | null
  sessionStartedAt: string | null
  recentEvents: WorkspaceRunEvent[]
}

type MissionLiveData = {
  mission: {
    id: string
    name: string
    status: string
    progress: number
  }
  tasks: MissionLiveTask[]
  activeRuns: MissionLiveRun[]
  completedCount: number
  totalCount: number
}

type CheckpointQaResult = {
  verdict: string | null
  confidence: number | null
}

type CheckpointMonitorDetail = {
  checkpoint: WorkspaceCheckpoint
  qaResult: CheckpointQaResult
  diffFiles: Array<{
    path: string
    additions: number | null
    deletions: number | null
    patch: string
  }>
}

type ActivityEntry = {
  id: string
  timestamp: string
  agent: string
  action: string
}

type CheckpointListItem = WorkspaceCheckpoint & {
  task_run_id: string
}

const ACTIVE_MISSION_STATUSES = new Set(['running', 'reviewing', 'revising'])
const RUNNING_TASK_STATUSES = new Set(['running', 'reviewing', 'revising'])

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseMissionLiveTask(value: unknown, index: number): MissionLiveTask {
  const record = asRecord(value)
  return {
    id: asString(record?.id) ?? `task-${index}`,
    name: asString(record?.name) ?? 'Untitled task',
    status: asString(record?.status) ?? 'pending',
    agentId: asString(record?.agent_id),
    agentRole:
      asString(record?.agent_type) ??
      asString(record?.suggested_agent_type) ??
      null,
    startedAt: asString(record?.started_at),
    completedAt: asString(record?.completed_at),
    sortOrder: asNumber(record?.sort_order) ?? index,
  }
}

function parseMissionLiveRun(value: unknown): MissionLiveRun {
  const record = asRecord(value)
  const session = asRecord(record?.session)
  return {
    id: asString(record?.id) ?? crypto.randomUUID(),
    taskId: asString(record?.task_id),
    agentId: asString(record?.agent_id),
    agentName: asString(record?.agent_name),
    status: asString(record?.status) ?? 'pending',
    attempt: asNumber(record?.attempt) ?? 1,
    startedAt: asString(record?.started_at),
    completedAt: asString(record?.completed_at),
    sessionStartedAt: asString(session?.started_at),
    recentEvents: extractRunEvents(record?.recent_events),
  }
}

function parseMissionLivePayload(value: unknown): MissionLiveData {
  const record = asRecord(value)
  const missionRecord = asRecord(record?.mission)
  const tasks = asArray(record?.tasks).map(parseMissionLiveTask)
  const taskBreakdown = asArray(record?.task_breakdown).map((entry, index) => {
    const parsed = parseMissionLiveTask(entry, index)
    const matchingTask = tasks.find((task) => task.id === parsed.id)
    return matchingTask ?? parsed
  })

  const completedCount =
    asNumber(record?.completed_count) ??
    taskBreakdown.filter((task) => task.status === 'completed').length
  const totalCount = asNumber(record?.total_count) ?? taskBreakdown.length

  return {
    mission: {
      id: asString(missionRecord?.id) ?? crypto.randomUUID(),
      name: asString(missionRecord?.name) ?? 'Untitled mission',
      status: asString(missionRecord?.status) ?? 'pending',
      progress: asNumber(missionRecord?.progress) ?? 0,
    },
    tasks: taskBreakdown.sort((left, right) => left.sortOrder - right.sortOrder),
    activeRuns: asArray(record?.active_runs).map(parseMissionLiveRun),
    completedCount,
    totalCount,
  }
}

function parseCheckpointListItem(value: unknown): CheckpointListItem | null {
  const record = asRecord(value)
  const id = asString(record?.id)
  const taskRunId = asString(record?.task_run_id)
  if (!id || !taskRunId) return null

  return {
    id,
    task_run_id: taskRunId,
    summary: typeof record?.summary === 'string' ? record.summary : null,
    diff_stat: typeof record?.diff_stat === 'string' ? record.diff_stat : null,
    verification_raw:
      typeof record?.verification === 'string' ? record.verification : null,
    status: asString(record?.status) ?? 'pending',
    reviewer_notes:
      typeof record?.reviewer_notes === 'string' ? record.reviewer_notes : null,
    commit_hash: typeof record?.commit_hash === 'string' ? record.commit_hash : null,
    created_at: asString(record?.created_at) ?? new Date().toISOString(),
    task_name: asString(record?.task_name),
    mission_name: asString(record?.mission_name),
    project_name: asString(record?.project_name),
    agent_name: asString(record?.agent_name),
  }
}

function extractCheckpointList(value: unknown): CheckpointListItem[] {
  const record = asRecord(value)
  const candidates = [value, record?.checkpoints, record?.data, record?.items]
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue
    return candidate.flatMap((item) => {
      const parsed = parseCheckpointListItem(item)
      return parsed ? [parsed] : []
    })
  }
  return []
}

function parseCheckpointMonitorDetail(value: unknown): CheckpointMonitorDetail {
  const record = asRecord(value)
  const checkpointRecord = asRecord(record?.checkpoint) ?? record
  const qaRecord = asRecord(checkpointRecord?.qa_result)
  const diffFilesSource = Array.isArray(record?.file_diffs)
    ? record.file_diffs
    : asArray(checkpointRecord?.diff_files)

  const checkpoint = parseCheckpointListItem(checkpointRecord)
  if (!checkpoint) {
    throw new Error('Checkpoint detail response was empty')
  }

  return {
    checkpoint,
    qaResult: {
      verdict: asString(qaRecord?.verdict),
      confidence: asNumber(qaRecord?.confidence),
    },
    diffFiles: diffFilesSource.map((entry) => {
      const item = asRecord(entry)
      return {
        path: asString(item?.path) ?? 'unknown',
        additions: asNumber(item?.additions),
        deletions: asNumber(item?.deletions),
        patch:
          typeof item?.diff === 'string'
            ? item.diff
            : asString(item?.patch) ?? '',
      }
    }),
  }
}

function formatElapsed(value: string | null, now: number): string {
  if (!value) return 'Waiting'
  const startedAt = new Date(value).getTime()
  if (!Number.isFinite(startedAt)) return 'Waiting'
  const diffMs = Math.max(0, now - startedAt)
  const totalSeconds = Math.floor(diffMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function getMissionStatusBadgeClass(status: string): string {
  if (status === 'running' || status === 'reviewing' || status === 'revising') {
    return 'border-accent-500 bg-primary-100 text-primary-900'
  }
  if (status === 'paused') {
    return 'border-primary-300 bg-primary-50 text-primary-900'
  }
  return 'border-primary-200 bg-white text-primary-600'
}

function getTaskStatusIcon(status: string): string {
  if (status === 'running') return '🔄'
  if (status === 'completed') return '✅'
  if (status === 'failed' || status === 'stopped') return '❌'
  if (status === 'reviewing') return '👀'
  if (status === 'revising') return '🔧'
  return '⏳'
}

function getRoleLabel(task: MissionLiveTask, run?: MissionLiveRun | WorkspaceTaskRun): string {
  const runAgentName =
    run && 'agent_name' in run
      ? run.agent_name
      : run && 'agentName' in run
        ? run.agentName
        : null
  const raw =
    task.agentRole ??
    (typeof runAgentName === 'string' && runAgentName.trim().length > 0
      ? runAgentName
      : null) ??
    task.agentId
  if (!raw) return 'coder'
  const normalized = raw.toLowerCase()
  if (normalized.includes('planner')) return 'planner'
  if (normalized.includes('critic') || normalized.includes('qa') || normalized.includes('review')) {
    return 'critic'
  }
  return 'coder'
}

function getEventText(event: WorkspaceRunEvent): string {
  const data = event.data
  if (typeof data?.message === 'string' && data.message.trim()) return data.message.trim()
  if (typeof data?.summary === 'string' && data.summary.trim()) return data.summary.trim()
  if (typeof data?.detail === 'string' && data.detail.trim()) return data.detail.trim()
  if (event.type === 'completed') {
    const status = asString(data?.status)
    const qaVerdict = asString(data?.qa_verdict)
    if (qaVerdict) return `Completed with QA verdict ${qaVerdict}`
    if (status) return `Run ${status}`
  }
  if (typeof data?.critic_error === 'string' && data.critic_error.trim()) {
    return data.critic_error.trim()
  }
  if (typeof data?.type === 'string' && data.type === 'user_message' && typeof data.message === 'string') {
    return `Reviewer note: ${data.message}`
  }
  if (!data) return event.type.replace(/_/g, ' ')
  return JSON.stringify(data)
}

function getTaskSnippet(events: WorkspaceRunEvent[]): string {
  const lines = events
    .map((event) => getEventText(event))
    .filter((line) => line.trim().length > 0)
    .slice(-2)
  return lines.join('\n')
}

function getCheckpointSummary(detail: CheckpointMonitorDetail): string {
  const filesChanged = detail.diffFiles.length
  if (filesChanged > 0) {
    return `${filesChanged} file${filesChanged === 1 ? '' : 's'} changed`
  }
  return detail.checkpoint.summary?.trim() || 'Checkpoint ready for review'
}

function getInlineDiffLineTone(line: string): string {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'bg-primary-100 text-primary-900'
  if (line.startsWith('-') && !line.startsWith('---')) return 'bg-primary-50 text-primary-600'
  if (line.startsWith('@@')) return 'bg-primary-50 text-primary-900'
  return 'text-primary-600'
}

function getActivityEntryFromRunEvent(
  event: WorkspaceRunEvent,
  run: MissionLiveRun | WorkspaceTaskRun | undefined,
): ActivityEntry {
  const agentName = run
    ? 'agent_name' in run
      ? run.agent_name
      : 'agentName' in run
        ? run.agentName
        : null
    : null
  return {
    id: `run:${run?.id ?? event.task_run_id}:${event.id}`,
    timestamp: event.created_at,
    agent: agentName?.trim() || 'agent',
    action: getEventText(event),
  }
}

function getActivityEntryFromSse(detail: WorkspaceSseEvent): ActivityEntry | null {
  const payload = detail.payload
  const missionId = asString(payload?.mission_id)
  if (!missionId) return null
  const timestamp = asString(payload?.created_at) ?? new Date().toISOString()
  const agent =
    asString(payload?.agent_name) ??
    asString(payload?.agent_id) ??
    'agent'
  const action =
    asString(payload?.message) ??
    asString(payload?.summary) ??
    (detail.type === 'task_run.completed'
      ? `Run ${asString(payload?.status) ?? 'updated'}`
      : detail.type.replace(/\./g, ' '))

  return {
    id: `sse:${detail.type}:${asString(payload?.id) ?? timestamp}`,
    timestamp,
    agent,
    action,
  }
}

export function WorkspaceMissionMonitor({ missionId }: WorkspaceMissionMonitorProps) {
  const queryClient = useQueryClient()
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({})
  const [expandedCheckpoints, setExpandedCheckpoints] = useState<Record<string, boolean>>({})
  const [liveEvents, setLiveEvents] = useState<ActivityEntry[]>([])
  const [autoScrollFeed, setAutoScrollFeed] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const feedRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now())
    }, 1_000)
    return () => window.clearInterval(interval)
  }, [])

  const liveQuery = useQuery({
    queryKey: ['workspace', 'mission-monitor', missionId, 'live'],
    queryFn: async () =>
      parseMissionLivePayload(
        await workspaceRequestJson(`/api/workspace/missions/${encodeURIComponent(missionId)}/live`),
      ),
    refetchInterval: 3_000,
  })

  const taskRunsQuery = useQuery({
    queryKey: ['workspace', 'mission-monitor', missionId, 'task-runs'],
    queryFn: async () =>
      extractTaskRuns(
        await workspaceRequestJson(`/api/workspace/task-runs?mission_id=${encodeURIComponent(missionId)}`),
      ),
    refetchInterval: 3_000,
  })

  const checkpointsQuery = useQuery({
    queryKey: ['workspace', 'mission-monitor', missionId, 'checkpoints'],
    queryFn: async () =>
      extractCheckpointList(
        await workspaceRequestJson(`/api/workspace/checkpoints?mission_id=${encodeURIComponent(missionId)}`),
      ),
    refetchInterval: 3_000,
  })

  const latestRunByTask = useMemo(() => {
    const map = new Map<string, WorkspaceTaskRun>()
    for (const run of taskRunsQuery.data ?? []) {
      if (!run.task_id) continue
      const current = map.get(run.task_id)
      if (!current || run.attempt >= current.attempt) {
        map.set(run.task_id, run)
      }
    }
    return map
  }, [taskRunsQuery.data])

  const runEventsQueries = useQueries({
    queries: Array.from(latestRunByTask.values()).map((run) => ({
      queryKey: ['workspace', 'mission-monitor', 'run-events', run.id],
      queryFn: async () =>
        extractRunEvents(
          await workspaceRequestJson(`/api/workspace/task-runs/${encodeURIComponent(run.id)}/events`),
        ),
      refetchInterval: 3_000,
    })),
  })

  const checkpointDetailQueries = useQueries({
    queries: (checkpointsQuery.data ?? []).map((checkpoint) => ({
      queryKey: ['workspace', 'mission-monitor', 'checkpoint-detail', checkpoint.id],
      queryFn: async () =>
        parseCheckpointMonitorDetail(
          await workspaceRequestJson(`/api/workspace/checkpoints/${encodeURIComponent(checkpoint.id)}`),
        ),
      refetchInterval: 3_000,
    })),
  })

  const runEventsByRunId = useMemo(() => {
    const map = new Map<string, WorkspaceRunEvent[]>()
    Array.from(latestRunByTask.values()).forEach((run, index) => {
      map.set(run.id, runEventsQueries[index]?.data ?? [])
    })
    return map
  }, [latestRunByTask, runEventsQueries])

  const checkpointDetailById = useMemo(() => {
    const map = new Map<string, CheckpointMonitorDetail>()
    ;(checkpointsQuery.data ?? []).forEach((checkpoint, index) => {
      const detail = checkpointDetailQueries[index]?.data
      if (detail) {
        map.set(checkpoint.id, detail)
      }
    })
    return map
  }, [checkpointDetailQueries, checkpointsQuery.data])

  useEffect(() => {
    function handleWorkspaceSse(event: Event) {
      const customEvent = event as CustomEvent<WorkspaceSseEvent>
      const detail = customEvent.detail
      if (!detail) return
      const payloadMissionId = asString(detail.payload?.mission_id)
      if (payloadMissionId !== missionId) return
      const nextEntry = getActivityEntryFromSse(detail)
      if (!nextEntry) return
      setLiveEvents((current) =>
        [nextEntry, ...current.filter((entry) => entry.id !== nextEntry.id)].slice(0, 20),
      )
    }

    window.addEventListener(WORKSPACE_SSE_EVENT_NAME, handleWorkspaceSse as EventListener)
    return () => {
      window.removeEventListener(WORKSPACE_SSE_EVENT_NAME, handleWorkspaceSse as EventListener)
    }
  }, [missionId])

  const missionStartedAt = useMemo(() => {
    const candidates = [
      ...(liveQuery.data?.tasks.map((task) => task.startedAt).filter(Boolean) ?? []),
      ...(liveQuery.data?.activeRuns.map((run) => run.startedAt ?? run.sessionStartedAt).filter(Boolean) ?? []),
      ...(Array.from(latestRunByTask.values())
        .map((run) => run.started_at)
        .filter(Boolean) as string[]),
    ]
    if (candidates.length === 0) return null
    return [...candidates].sort()[0] ?? null
  }, [latestRunByTask, liveQuery.data])

  const checkpointsByRunId = useMemo(() => {
    const map = new Map<string, CheckpointListItem[]>()
    for (const checkpoint of checkpointsQuery.data ?? []) {
      const current = map.get(checkpoint.task_run_id) ?? []
      current.push(checkpoint)
      map.set(checkpoint.task_run_id, current)
    }
    return map
  }, [checkpointsQuery.data])

  const activityFeed = useMemo(() => {
    const queryEntries = Array.from(latestRunByTask.values()).flatMap((run) =>
      (runEventsByRunId.get(run.id) ?? []).map((event) => getActivityEntryFromRunEvent(event, run)),
    )

    const merged = [...liveEvents, ...queryEntries]
    const deduped = new Map<string, ActivityEntry>()
    for (const entry of merged) {
      if (!deduped.has(entry.id)) {
        deduped.set(entry.id, entry)
      }
    }

    return Array.from(deduped.values())
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, 20)
  }, [latestRunByTask, liveEvents, runEventsByRunId])

  useEffect(() => {
    if (!autoScrollFeed) return
    const node = feedRef.current
    if (!node) return
    node.scrollTo({ top: 0 })
  }, [activityFeed, autoScrollFeed])

  const missionControlMutation = useMutation({
    mutationFn: async (action: 'pause' | 'resume' | 'stop') =>
      workspaceRequestJson(`/api/workspace/missions/${encodeURIComponent(missionId)}/${action}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace', 'mission-monitor', missionId] }),
        queryClient.invalidateQueries({ queryKey: ['workspace', 'missions'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace', 'layout', 'mission-status', missionId] }),
      ])
    },
  })

  const checkpointActionMutation = useMutation({
    mutationFn: async (payload: { checkpointId: string; action: 'approve' | 'reject' }) =>
      submitCheckpointReview(payload.checkpointId, payload.action),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace', 'mission-monitor', missionId, 'checkpoints'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace', 'checkpoints'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace', 'layout', 'project-detail'] }),
      ])
    },
  })

  if (liveQuery.isPending && !liveQuery.data) {
    return (
      <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">
        <section className="mx-auto w-full max-w-[1480px] space-y-5">
          <div className="rounded-xl border border-primary-200 bg-white px-5 py-8 text-sm text-primary-600 shadow-sm">
            Loading live mission monitor...
          </div>
        </section>
      </main>
    )
  }

  if (liveQuery.isError || !liveQuery.data) {
    return (
      <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">
        <section className="mx-auto w-full max-w-[1480px] space-y-5">
          <div className="rounded-xl border border-primary-200 bg-white px-5 py-8 text-sm text-primary-600 shadow-sm">
            {liveQuery.error instanceof Error ? liveQuery.error.message : 'Failed to load live mission'}
          </div>
        </section>
      </main>
    )
  }

  const mission = liveQuery.data.mission
  const tasks = liveQuery.data.tasks
  const canPause = mission.status === 'running' || mission.status === 'reviewing' || mission.status === 'revising'
  const canResume = mission.status === 'paused'
  const missionIsLive = ACTIVE_MISSION_STATUSES.has(mission.status)

  return (
    <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">
      <section className="mx-auto w-full max-w-[1480px] space-y-5">
        <header className="flex flex-col gap-4 rounded-xl border border-primary-200 bg-primary-50/80 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold text-primary-900">{mission.name}</h1>
              <span
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium',
                  getMissionStatusBadgeClass(mission.status),
                )}
              >
                {formatStatus(mission.status)}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-primary-600">
              <span>Elapsed {formatElapsed(missionStartedAt, now)}</span>
              <span>
                Progress {liveQuery.data.completedCount}/{liveQuery.data.totalCount}
              </span>
              <span>{missionIsLive ? 'Watching active execution' : 'Mission is not currently active'}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-accent-500 transition-[width]"
                style={{ width: `${liveQuery.data.totalCount > 0 ? (liveQuery.data.completedCount / liveQuery.data.totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button
              variant="outline"
              disabled={!canPause || missionControlMutation.isPending}
              onClick={() => void missionControlMutation.mutate('pause')}
              className="w-full sm:w-auto"
            >
              Pause
            </Button>
            <Button
              variant="outline"
              disabled={!canResume || missionControlMutation.isPending}
              onClick={() => void missionControlMutation.mutate('resume')}
              className="w-full sm:w-auto"
            >
              Resume
            </Button>
            <Button
              disabled={mission.status === 'completed' || mission.status === 'failed' || mission.status === 'stopped' || missionControlMutation.isPending}
              onClick={() => void missionControlMutation.mutate('stop')}
              className="w-full bg-accent-500 text-white hover:bg-accent-500/90 sm:w-auto"
            >
              Stop
            </Button>
          </div>
        </header>

        <div className="flex flex-col gap-5 md:flex-row md:gap-6">
          <section className="min-w-0 flex-1 space-y-4">
            <div className="rounded-xl border border-primary-200 bg-white px-5 py-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-primary-900">Task Checklist</h2>
                  <p className="text-sm text-primary-600">Live task state, checkpoints, and run history.</p>
                </div>
                <span className="text-xs text-primary-500">{tasks.length} tasks</span>
              </div>
            </div>

            {tasks.map((task) => {
              const latestRun = latestRunByTask.get(task.id)
              const activeRun = liveQuery.data.activeRuns.find((run) => run.taskId === task.id)
              const runEvents = latestRun ? runEventsByRunId.get(latestRun.id) ?? [] : activeRun?.recentEvents ?? []
              const taskCheckpoints = latestRun ? checkpointsByRunId.get(latestRun.id) ?? [] : []
              const expanded = expandedTasks[task.id] ?? false
              const running = RUNNING_TASK_STATUSES.has(task.status)
              const roleLabel = getRoleLabel(task, latestRun ?? activeRun)
              const taskStartedAt =
                activeRun?.startedAt ??
                activeRun?.sessionStartedAt ??
                latestRun?.started_at ??
                task.startedAt

              return (
                <div key={task.id} className="space-y-3">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTasks((current) => ({
                        ...current,
                        [task.id]: !current[task.id],
                      }))
                    }
                    className={cn(
                      'w-full rounded-xl border bg-white px-5 py-4 text-left shadow-sm transition-colors',
                      running
                        ? 'border-accent-500 bg-primary-50 shadow-[0_0_0_1px_rgba(243,115,53,0.15)]'
                        : task.status === 'completed'
                          ? 'border-primary-200 opacity-75'
                          : 'border-primary-200',
                    )}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base">{getTaskStatusIcon(task.status)}</span>
                          <span className="text-sm font-medium text-primary-900">{task.name}</span>
                          <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-primary-600">
                            {roleLabel}
                          </span>
                        </div>
                        <p className="whitespace-pre-line text-sm text-primary-600 [display:-webkit-box] [-webkit-box-orient:vertical] overflow-hidden [-webkit-line-clamp:2]">
                          {getTaskSnippet(runEvents) || 'Waiting for activity...'}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs text-primary-500">
                        {running ? <span>Active {formatElapsed(taskStartedAt, now)}</span> : null}
                        {latestRun ? <span>Attempt {latestRun.attempt}</span> : null}
                        <span>{formatStatus(task.status)}</span>
                      </div>
                    </div>
                  </button>

                  {expanded ? (
                    <div className="rounded-xl border border-primary-200 bg-white px-5 py-4 shadow-sm">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-500">
                        Run History
                      </h3>
                      <div className="mt-3 space-y-2">
                        {runEvents.length > 0 ? (
                          runEvents
                            .slice()
                            .reverse()
                            .map((event) => (
                              <div
                                key={`${task.id}:${event.id}`}
                                className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-primary-500">
                                  <span>{formatRelativeTime(event.created_at)}</span>
                                  <span>{event.type.replace(/_/g, ' ')}</span>
                                </div>
                                <p className="mt-1 text-sm text-primary-900">{getEventText(event)}</p>
                              </div>
                            ))
                        ) : (
                          <div className="rounded-lg border border-dashed border-primary-200 bg-primary-50 px-3 py-4 text-sm text-primary-600">
                            No run events recorded yet.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {taskCheckpoints.map((checkpoint) => {
                    const detail = checkpointDetailById.get(checkpoint.id)
                    const expandedCheckpoint = expandedCheckpoints[checkpoint.id] ?? false
                    const latestCompletedEvent = [...runEvents]
                      .reverse()
                      .find((event) => event.type === 'completed')
                    const criticScore =
                      asNumber(latestCompletedEvent?.data?.critic_score) ??
                      null

                    return (
                      <div
                        key={checkpoint.id}
                        className="rounded-xl border border-primary-200 bg-primary-50/70 px-5 py-4 shadow-sm"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-primary-200 bg-white px-2 py-0.5 text-[11px] font-medium text-primary-600">
                                Checkpoint
                              </span>
                              <span className="text-xs text-primary-500">{formatRelativeTime(checkpoint.created_at)}</span>
                            </div>
                            <p className="text-sm font-medium text-primary-900">
                              {detail ? getCheckpointSummary(detail) : checkpoint.summary || 'Checkpoint ready'}
                            </p>
                            <div className="flex flex-wrap gap-3 text-xs text-primary-600">
                              <span>
                                Files changed {detail?.diffFiles.length ?? '...'}
                              </span>
                              <span>
                                QA {detail?.qaResult.verdict ?? 'Pending'}
                                {detail?.qaResult.confidence !== null
                                  ? ` • ${((detail?.qaResult.confidence ?? 0) * 100).toFixed(0)}% confidence`
                                  : ''}
                              </span>
                              {criticScore !== null ? <span>Critic {criticScore.toFixed(1)}/10</span> : null}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                            <Button
                              variant="outline"
                              disabled={checkpointActionMutation.isPending || checkpoint.status !== 'pending'}
                              onClick={() =>
                                void checkpointActionMutation.mutate({
                                  checkpointId: checkpoint.id,
                                  action: 'reject',
                                })
                              }
                              className="w-full sm:w-auto"
                            >
                              Reject
                            </Button>
                            <Button
                              disabled={checkpointActionMutation.isPending || checkpoint.status !== 'pending'}
                              onClick={() =>
                                void checkpointActionMutation.mutate({
                                  checkpointId: checkpoint.id,
                                  action: 'approve',
                                })
                              }
                              className="w-full bg-accent-500 text-white hover:bg-accent-500/90 sm:w-auto"
                            >
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() =>
                                setExpandedCheckpoints((current) => ({
                                  ...current,
                                  [checkpoint.id]: !current[checkpoint.id],
                                }))
                              }
                              className="w-full sm:w-auto"
                            >
                              {expandedCheckpoint ? 'Hide Diff' : 'Show Diff'}
                            </Button>
                          </div>
                        </div>

                        {expandedCheckpoint ? (
                          <div className="mt-4 space-y-3">
                            {detail?.diffFiles.length ? (
                              detail.diffFiles.map((file) => (
                                <div key={file.path} className="rounded-lg border border-primary-200 bg-white">
                                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary-200 px-4 py-3">
                                    <div className="min-w-0">
                                      <p className="truncate font-mono text-sm text-primary-900">{file.path}</p>
                                      <p className="text-xs text-primary-500">
                                        +{file.additions ?? 0} / -{file.deletions ?? 0}
                                      </p>
                                    </div>
                                  </div>
                                  <pre className="overflow-x-auto px-4 py-3 font-mono text-xs leading-5">
                                    {file.patch ? (
                                      file.patch.split('\n').map((line, index) => (
                                        <div key={`${file.path}:${index}`} className={cn('whitespace-pre', getInlineDiffLineTone(line))}>
                                          {line || ' '}
                                        </div>
                                      ))
                                    ) : (
                                      <div className="text-primary-500">No diff content was available for this file.</div>
                                    )}
                                  </pre>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-lg border border-dashed border-primary-200 bg-white px-4 py-6 text-sm text-primary-600">
                                Diff details are still loading.
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </section>

          <section className="rounded-xl border border-primary-200 bg-white shadow-sm md:w-[360px] md:flex-none lg:w-[420px]">
            <div className="border-b border-primary-200 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-primary-900">Live Activity Feed</h2>
                <p className="text-sm text-primary-600">Newest events stay pinned unless you scroll down.</p>
              </div>
            </div>
            <div
              ref={feedRef}
              onScroll={(event) => {
                setAutoScrollFeed(event.currentTarget.scrollTop < 24)
              }}
              className="px-5 py-4 md:max-h-[420px] md:overflow-y-auto"
            >
              <div className="space-y-2">
                {activityFeed.length > 0 ? (
                  activityFeed.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm"
                    >
                      <span className="text-primary-500">
                        {new Intl.DateTimeFormat(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                        }).format(new Date(entry.timestamp))}
                      </span>
                      <span className="px-2 text-primary-500">|</span>
                      <span className="font-medium text-primary-900">{entry.agent}</span>
                      <span className="px-2 text-primary-500">|</span>
                      <span className="text-primary-600">{entry.action}</span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-primary-200 bg-primary-50 px-4 py-6 text-sm text-primary-600">
                    Waiting for live activity...
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
