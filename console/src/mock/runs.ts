// The run lifecycle, simulated. Static fixtures cannot stand in for this: the
// console's whole operational surface is progressive — counters climb, a run
// goes from queued to running to completed, issues appear mid-flight. So runs
// derive their state from elapsed time rather than being stored snapshots, and
// every reader (list, detail, SSE, observability) sees the same instant.
import type {
  CrawlEvent, Incident, ObservabilityOverview, ObservabilityRun, Run, RunDetail, RunIssue,
} from '../api'
import { tick } from './config'
import { sources } from './seed'

/** Wall-clock milliseconds a simulated page takes to fetch and interpret. */
const MS_PER_PAGE = 340

type StoredRun = {
  id: string
  source_id: string
  target_pages: number
  created_at: number
  started_at: number | null
  /** Set when the run reaches a terminal state ahead of its natural finish. */
  ended_at: number | null
  ended_status: Run['status'] | null
  cancel_requested: boolean
  retry_of_run_id: string | null
  /** Page indexes that fail, so issues are reproducible rather than random. */
  failing: number[]
}

let counter = 0
const store: StoredRun[] = []

function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${String(counter).padStart(4, '0')}`
}

function seedRun(sourceIndex: number, minutesAgo: number, pages: number, outcome: Run['status'], failing: number[] = []): void {
  const created = Date.now() - minutesAgo * 60_000
  store.push({
    id: nextId('run'),
    source_id: sources[sourceIndex].id,
    target_pages: pages,
    created_at: created,
    started_at: created + 1_500,
    ended_at: created + 1_500 + pages * MS_PER_PAGE,
    ended_status: outcome,
    cancel_requested: outcome === 'cancelled',
    retry_of_run_id: null,
    failing,
  })
}

seedRun(0, 46, 128, 'completed', [17, 62])
seedRun(1, 31, 74, 'completed')
seedRun(2, 18, 39, 'failed', [11, 12, 13])
seedRun(0, 9, 96, 'completed', [40])

/** Where a run has got to, computed rather than stored. */
function progress(run: StoredRun) {
  // A terminal status wins: a run cancelled while still queued is cancelled,
  // not queued.
  if (run.ended_at != null && Date.now() >= run.ended_at) {
    const ran = run.started_at == null ? 0 : run.ended_at - run.started_at
    const done = Math.max(0, Math.min(run.target_pages, Math.floor(ran / MS_PER_PAGE)))
    return {
      status: run.ended_status ?? 'completed',
      processed: done,
      discovered: run.ended_status === 'completed' ? run.target_pages : done,
      finished: run.ended_at,
    }
  }
  // Otherwise it sits in the queue until its start time arrives, so the console
  // gets a real queued state to render rather than jumping straight to running.
  if (run.started_at == null || Date.now() < run.started_at) {
    return { status: 'queued' as Run['status'], processed: 0, discovered: 0, finished: null as number | null }
  }
  const natural = Math.floor((Date.now() - run.started_at) / MS_PER_PAGE)

  const processed = Math.max(0, Math.min(run.target_pages, natural))
  if (processed >= run.target_pages) {
    const finished = run.started_at + run.target_pages * MS_PER_PAGE
    run.ended_at ??= finished
    run.ended_status ??= 'completed'
    return { status: run.ended_status, processed: run.target_pages, discovered: run.target_pages, finished }
  }
  // Discovery runs ahead of processing, the way a crawl frontier does.
  const discovered = Math.min(run.target_pages, Math.max(processed + 8, Math.floor(processed * 1.4) + 5))
  return { status: 'running' as Run['status'], processed, discovered, finished: null }
}

function issuesFor(run: StoredRun, processed: number): RunIssue[] {
  return run.failing
    .filter((index) => index <= processed)
    .map((index) => ({
      id: `${run.id}-issue-${index}`,
      url: `${sourceFor(run).url}/page-${index}`,
      stage: index % 2 === 0 ? 'fetch' : 'extract',
      code: index % 2 === 0 ? 'http_503' : 'schema_mismatch',
      message: index % 2 === 0
        ? 'The page returned 503 three times in a row.'
        : 'No course fields were found on a page the sitemap listed as a course.',
      retryable: index % 2 === 0,
      created_at: new Date(run.started_at! + index * MS_PER_PAGE).toISOString(),
    }))
}

function sourceFor(run: StoredRun) {
  return sources.find((source) => source.id === run.source_id) ?? sources[0]
}

function toRun(run: StoredRun): Run {
  const state = progress(run)
  const issues = issuesFor(run, state.processed)
  return {
    id: run.id,
    source_id: run.source_id,
    status: state.status,
    pages_discovered: state.discovered,
    pages_processed: state.processed,
    documents_created: Math.max(0, state.processed - issues.length),
    issues_count: issues.length,
    policy_skips_count: Math.floor(state.processed / 24),
    cancel_requested: run.cancel_requested,
    retry_of_run_id: run.retry_of_run_id,
    last_heartbeat_at: state.status === 'running' ? new Date().toISOString() : null,
    error: state.status === 'failed' ? 'The source stopped responding after repeated 503s.' : null,
    started_at: run.started_at ? new Date(run.started_at).toISOString() : null,
    finished_at: state.finished ? new Date(state.finished).toISOString() : null,
    created_at: new Date(run.created_at).toISOString(),
  }
}

export function toRunDetail(run: StoredRun): RunDetail {
  const state = progress(run)
  return { ...toRun(run), source_name: sourceFor(run).name, issues: issuesFor(run, state.processed) }
}

export function listRuns(): Run[] {
  return [...store].sort((a, b) => b.created_at - a.created_at).map(toRun)
}

export function findRun(id: string): StoredRun | undefined {
  return store.find((run) => run.id === id)
}

export function startRun(sourceId: string): Run {
  const now = Date.now()
  const run: StoredRun = {
    id: nextId('run'),
    source_id: sourceId,
    target_pages: 40 + Math.floor(Math.random() * 60),
    created_at: now,
    started_at: now + 900,
    ended_at: null,
    ended_status: null,
    cancel_requested: false,
    retry_of_run_id: null,
    failing: [9, 23],
  }
  store.push(run)
  return toRun(run)
}

export function endRun(run: StoredRun, status: Run['status']): Run {
  run.cancel_requested = status === 'cancelled'
  run.ended_at = Date.now()
  run.ended_status = status
  return toRun(run)
}

export function retryIssues(run: StoredRun): Run {
  const retry: StoredRun = {
    ...run,
    id: nextId('run'),
    created_at: Date.now(),
    started_at: Date.now() + 600,
    ended_at: null,
    ended_status: null,
    cancel_requested: false,
    retry_of_run_id: run.id,
    target_pages: Math.max(4, run.failing.length * 3),
    failing: [],
  }
  store.push(retry)
  return toRun(retry)
}

const STAGES = ['discover', 'fetch', 'extract', 'save'] as const

export function timeline(run: StoredRun): CrawlEvent[] {
  const state = progress(run)
  const events: CrawlEvent[] = []
  const pages = Math.min(state.processed, 40)
  for (let index = 0; index < pages; index += 1) {
    const failed = run.failing.includes(index)
    STAGES.forEach((stage, stageIndex) => {
      if (failed && stageIndex > 1) return
      events.push({
        id: `${run.id}-ev-${index}-${stage}`,
        run_id: run.id,
        sequence: index * STAGES.length + stageIndex,
        stage,
        outcome: failed && stage === 'fetch' ? 'failed' : 'ok',
        url: `${sourceFor(run).url}/page-${index}`,
        attempt: failed && stage === 'fetch' ? 3 : 1,
        duration_ms: 90 + ((index * 37 + stageIndex * 11) % 420),
        status_code: failed && stage === 'fetch' ? 503 : 200,
        bytes_count: stage === 'fetch' ? 18_000 + ((index * 911) % 40_000) : null,
        records_count: stage === 'save' ? 1 : 0,
        chunks_count: stage === 'save' ? 3 + (index % 5) : 0,
        error_code: failed && stage === 'fetch' ? 'http_503' : null,
        error_message: failed && stage === 'fetch' ? 'Upstream returned 503.' : null,
        retryable: failed && stage === 'fetch',
        trace_id: `trace-${run.id}-${index}`,
        created_at: new Date(run.started_at! + index * MS_PER_PAGE + stageIndex * 40).toISOString(),
      })
    })
  }
  return events.reverse()
}

export function observabilityRuns(): ObservabilityRun[] {
  return store
    .sort((a, b) => b.created_at - a.created_at)
    .map((stored) => {
      const run = toRun(stored)
      return {
        id: run.id,
        organization_id: 'org-mock',
        source_id: run.source_id,
        source_name: sourceFor(stored).name,
        connector: sourceFor(stored).kind,
        status: run.status,
        pages_discovered: run.pages_discovered,
        pages_processed: run.pages_processed,
        issues_count: run.issues_count,
        policy_skips_count: run.policy_skips_count,
        last_heartbeat_at: run.last_heartbeat_at,
        started_at: run.started_at,
        finished_at: run.finished_at,
        created_at: run.created_at,
      }
    })
}

export function overview(): ObservabilityOverview {
  const runs = listRuns()
  return {
    runs_total: runs.length,
    active_runs: runs.filter((run) => run.status === 'running' || run.status === 'queued').length,
    failed_runs: runs.filter((run) => run.status === 'failed').length,
    pages_processed: runs.reduce((total, run) => total + run.pages_processed, 0),
    stage_failures: runs.reduce((total, run) => total + run.issues_count, 0),
    open_incidents: incidents().filter((incident) => incident.status === 'open').length,
    page_duration_p95_ms: 512,
  }
}

const incidentState = new Map<string, Incident['status']>()

export function incidents(): Incident[] {
  const failed = store.filter((run) => progress(run).status === 'failed')
  return failed.map((run) => {
    const id = `inc-${run.id}`
    return {
      id,
      run_id: run.id,
      severity: 'high',
      status: incidentState.get(id) ?? 'open',
      service: 'ingest',
      summary: `${sourceFor(run).name} returned 503 on three consecutive pages.`,
      remediation: 'Retry the failed pages once the source recovers, or lower the crawl rate for this domain.',
      occurrence_count: run.failing.length,
      trace_id: `trace-${run.id}`,
      first_seen_at: new Date(run.created_at).toISOString(),
      last_seen_at: new Date(run.ended_at ?? run.created_at).toISOString(),
    }
  })
}

export function setIncidentStatus(id: string, status: Incident['status']): Incident | undefined {
  incidentState.set(id, status)
  return incidents().find((incident) => incident.id === id)
}

/** Emits the run's detail until it reaches a terminal state, the way the API's
    SSE endpoint does, so the client's stream parsing stays on the tested path. */
export function runEvents(run: StoredRun, signal?: AbortSignal | null): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let timer: ReturnType<typeof setTimeout> | undefined
  return new ReadableStream({
    start(controller) {
      const push = () => {
        if (signal?.aborted) {
          controller.close()
          return
        }
        const detail = toRunDetail(run)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(detail)}\n\n`))
        if (['completed', 'failed', 'cancelled'].includes(detail.status)) {
          controller.close()
          return
        }
        timer = setTimeout(push, tick(600))
      }
      push()
    },
    cancel() {
      if (timer != null) clearTimeout(timer)
    },
  })
}
