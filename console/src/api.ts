const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const apiKey = import.meta.env.VITE_API_KEY ?? 'scrapal-local-dev-key'

export type Collection = { id: string; name: string; description: string }
export type Source = {
  id: string
  collection_id: string
  name: string
  kind: 'website' | 'sitemap' | 'url_list' | 'document' | 'greenwich'
  url: string | null
  enabled: boolean
  last_run_at: string | null
}
export type Run = {
  id: string
  source_id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting_for_ai'
  pages_discovered: number
  pages_processed: number
  documents_created: number
  issues_count: number
  policy_skips_count: number
  cancel_requested: boolean
  retry_of_run_id: string | null
  last_heartbeat_at: string | null
  error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}
export type RunIssue = {
  id: string
  url: string
  stage: string
  code: string | null
  message: string
  retryable: boolean
  created_at: string
}
export type RunDetail = Run & { source_name: string; issues: RunIssue[] }
export type Document = {
  id: string
  title: string
  canonical_url: string
  media_type: string
  updated_at: string
}
export type SearchHit = {
  chunk_id: string
  document_id: string
  title: string
  url: string
  heading: string
  excerpt: string
  score: number
  document_version_id: string | null
  section_path: string[]
  anchor: string | null
  lexical_score: number
  vector_score: number
  structured_score: number
  fused_score: number
}
export type RetrievalRun = {
  id: string
  query: string
  mode: string
  include_drafts: boolean
  query_plan: Record<string, unknown>
  structured_matches: Record<string, unknown>[]
  lexical_candidates: Record<string, unknown>[]
  vector_candidates: Record<string, unknown>[]
  fused_candidates: SearchHit[]
  context_json: SearchHit[]
  generated_answer: string | null
  citation_results: { sentence: string; supported: boolean; citations: number[]; reason: string | null }[]
  abstention_reason: string | null
  answer_model: string | null
  exclusions_json: Record<string, unknown>[]
  timings_json: Record<string, number>
  created_at: string
}
export type EmbeddingProfile = {
  id: string
  provider: string
  model: string
  dimensions: number
  normalization: string
  version: string
  active: boolean
  healthy: boolean
}
export type Generation = {
  id: string
  conversation_id: string
  status: 'queued' | 'retrieving' | 'generating' | 'completed' | 'abstained' | 'failed'
  created_at: string
}
export type GenerationEvent = { type: string; data: Record<string, unknown>; id?: string }
export type SystemStatus = {
  ollama: { status: string; version?: string; models?: string[]; detail?: string }
}
export type Proposal = {
  id: string
  title: string
  action_type: string
  rationale: string
  risk: string
  status: string
}
export type CrawlEvent = {
  id: string
  run_id: string
  sequence: number
  stage: string
  outcome: string
  url: string | null
  attempt: number
  duration_ms: number | null
  status_code: number | null
  bytes_count: number | null
  records_count: number
  chunks_count: number
  error_code: string | null
  error_message: string | null
  retryable: boolean
  trace_id: string | null
  created_at: string
}
export type Incident = {
  id: string
  run_id: string | null
  severity: string
  status: string
  service: string
  summary: string
  remediation: string
  occurrence_count: number
  trace_id: string | null
  first_seen_at: string
  last_seen_at: string
}
export type ObservabilityOverview = {
  runs_total: number
  active_runs: number
  failed_runs: number
  pages_processed: number
  stage_failures: number
  open_incidents: number
  page_duration_p95_ms: number
}
export type ObservabilityRun = {
  id: string
  organization_id: string
  source_id: string
  source_name: string
  connector: string
  status: Run['status']
  pages_discovered: number
  pages_processed: number
  issues_count: number
  policy_skips_count: number
  last_heartbeat_at: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}
export type CourseRecord = {
  id: string
  schema_name: string
  external_id: string
  data: Record<string, unknown>
  evidence: {
    source_url?: string
    method?: string
    fields?: Record<string, { source_url: string; field: string; method: string; excerpt: string; section?: string; selector?: string; confidence: number }[]>
  }
  confidence: number
  published: boolean
  status: 'review' | 'published' | 'rejected'
  validation_json: {
    coverage?: number
    required_fields?: number
    missing_fields?: string[]
    contradictions?: string[]
    review_reasons?: string[]
  }
  extractor_version: string
  revision: number
  reviewed_at: string | null
  reviewed_by: string | null
  published_at: string | null
  updated_at: string
}
export type CourseIntelligenceOverview = {
  total: number
  published: number
  review: number
  rejected: number
  average_coverage: number
  missing_fields: { field: string; count: number }[]
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      ...options?.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }))
    const detail = body.detail
    throw new Error(typeof detail === 'string' ? detail : detail?.message ?? 'Request failed')
  }
  return response.json()
}

export const api = {
  collections: () => request<Collection[]>('/v1/collections'),
  sources: () => request<Source[]>('/v1/sources'),
  runs: () => request<Run[]>('/v1/runs'),
  run: (id: string) => request<RunDetail>(`/v1/runs/${id}`),
  documents: () => request<Document[]>('/v1/documents'),
  system: () => request<SystemStatus>('/v1/system'),
  proposals: () => request<Proposal[]>('/v1/action-proposals'),
  observabilityOverview: () => request<ObservabilityOverview>('/v1/admin/observability/overview'),
  observabilityRuns: () => request<ObservabilityRun[]>('/v1/admin/observability/runs'),
  incidents: () => request<Incident[]>('/v1/admin/observability/incidents'),
  workers: () => request<{ status: string; workers: { id: string; hostname: string; pid: number; last_seen_at: string }[] }>('/v1/admin/observability/workers'),
  dependencies: () => request<Record<string, { status: string; detail?: string }>>('/v1/admin/observability/dependencies'),
  timeline: (id: string) => request<CrawlEvent[]>(`/v1/admin/observability/runs/${id}/timeline`),
  acknowledgeIncident: (id: string) => request<Incident>(`/v1/admin/observability/incidents/${id}/acknowledge`, { method: 'POST' }),
  resolveIncident: (id: string) => request<Incident>(`/v1/admin/observability/incidents/${id}/resolve`, { method: 'POST' }),
  grafanaLink: (runId?: string, traceId?: string) => request<{ url: string }>(`/v1/admin/observability/grafana-link?${traceId ? `trace_id=${traceId}` : runId ? `run_id=${runId}` : ''}`),
  createSource: (data: Record<string, unknown>) =>
    request<Source>('/v1/sources', { method: 'POST', body: JSON.stringify(data) }),
  startRun: (sourceId: string) =>
    request<Run>('/v1/runs', {
      method: 'POST',
      body: JSON.stringify({ source_id: sourceId, mode: 'incremental' }),
    }),
  cancelRun: (id: string) => request<Run>(`/v1/runs/${id}/cancel`, { method: 'POST' }),
  retryRunIssues: (id: string) => request<Run>(`/v1/runs/${id}/retry-issues`, { method: 'POST' }),
  search: (query: string, collectionId?: string) =>
    request<{ hits: SearchHit[] }>(
      `/v1/search?q=${encodeURIComponent(query)}&mode=hybrid${collectionId ? `&collection_id=${collectionId}` : ''}`,
    ),
  createConversation: (collectionId?: string) =>
    request<{ id: string }>('/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({ collection_id: collectionId ?? null, title: 'Workspace conversation' }),
    }),
  sendMessage: (conversationId: string, content: string, requestId: string) =>
    request<Generation>(
      `/v1/conversations/${conversationId}/messages`,
      { method: 'POST', body: JSON.stringify({ content, request_id: requestId }) },
    ),
  retrievalProfiles: () => request<EmbeddingProfile[]>('/v1/admin/retrieval-lab/profiles'),
  runRetrieval: (data: Record<string, unknown>) =>
    request<RetrievalRun>('/v1/admin/retrieval-lab/runs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  courseIntelligenceOverview: (collectionId?: string) =>
    request<CourseIntelligenceOverview>(`/v1/admin/course-intelligence/overview${collectionId ? `?collection_id=${collectionId}` : ''}`),
  courseRecords: (collectionId?: string, status?: CourseRecord['status']) => {
    const params = new URLSearchParams()
    if (collectionId) params.set('collection_id', collectionId)
    if (status) params.set('status', status)
    return request<CourseRecord[]>(`/v1/admin/course-intelligence/records?${params}`)
  },
  publishCourseRecord: (id: string, note: string) =>
    request<CourseRecord>(`/v1/admin/course-intelligence/records/${id}/publish`, {
      method: 'POST', body: JSON.stringify({ note }),
    }),
  rejectCourseRecord: (id: string, note: string) =>
    request<CourseRecord>(`/v1/admin/course-intelligence/records/${id}/reject`, {
      method: 'POST', body: JSON.stringify({ note }),
    }),
  approveProposal: (id: string) =>
    request<Proposal>(`/v1/action-proposals/${id}/approve`, { method: 'POST' }),
  rejectProposal: (id: string) =>
    request<Proposal>(`/v1/action-proposals/${id}/reject`, { method: 'POST' }),
  watchRun: async (id: string, onProgress: (run: RunDetail) => void, signal: AbortSignal) => {
    const response = await fetch(`${baseUrl}/v1/runs/${id}/events`, {
      headers: { 'X-API-Key': apiKey },
      signal,
    })
    if (!response.ok || !response.body) throw new Error(`Live updates unavailable (${response.status})`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const data = frame.split('\n').find((line) => line.startsWith('data: '))?.slice(6)
        if (data) onProgress(JSON.parse(data) as RunDetail)
      }
      if (done) break
    }
  },
  watchGeneration: async (
    conversationId: string,
    generationId: string,
    onEvent: (event: GenerationEvent) => void,
    signal?: AbortSignal,
  ) => {
    let lastEventId: string | undefined
    let terminal = false
    let reconnects = 0
    while (!terminal) {
      try {
        const response = await fetch(
          `${baseUrl}/v1/conversations/${conversationId}/events?generation_id=${generationId}`,
          { headers: { 'X-API-Key': apiKey, ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}) }, signal },
        )
        if (!response.ok || !response.body) throw new Error(`Answer stream unavailable (${response.status})`)
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { value, done } = await reader.read()
          buffer += decoder.decode(value, { stream: !done })
          const frames = buffer.split('\n\n')
          buffer = frames.pop() ?? ''
          for (const frame of frames) {
            if (frame.startsWith(':')) continue
            const lines = frame.split('\n')
            const type = lines.find((line) => line.startsWith('event:'))?.slice(6).trim()
            const id = lines.find((line) => line.startsWith('id:'))?.slice(3).trim()
            const raw = lines.find((line) => line.startsWith('data:'))?.slice(5).trim()
            if (id) lastEventId = id
            if (type && raw) {
              onEvent({ type, id, data: JSON.parse(raw) as Record<string, unknown> })
              terminal = ['completed', 'failed'].includes(type)
            }
          }
          if (done || terminal) break
        }
        reconnects = 0
      } catch (error) {
        if (signal?.aborted || reconnects >= 4) throw error
        reconnects += 1
        await new Promise((resolve) => window.setTimeout(resolve, reconnects * 500))
      }
    }
  },
}
