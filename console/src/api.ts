// Keep browser requests on the console origin. Nginx proxies /api to FastAPI,
// so the same build works on localhost, LAN addresses, and stable hostnames.
import { http } from './mock/http'

const baseUrl = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')
const apiKey = import.meta.env.VITE_API_KEY ?? 'scrapal-local-dev-key'

export type Collection = { id: string; name: string; description: string }
export type Institution = {
  id: string
  name: string
  slug: string
  domain: string
  country_code: string | null
  city: string | null
  website_url: string | null
  logo_url: string | null
  banner_url: string | null
  brand_color: string | null
}
export type Source = {
  id: string
  collection_id: string
  name: string
  kind: 'website' | 'sitemap' | 'url_list' | 'document' | 'greenwich'
  url: string | null
  enabled: boolean
  last_run_at: string | null
}
export type CrawlBlueprint = {
  id: string
  collection_id: string
  source_id: string | null
  name: string
  start_url: string
  objective: string
  domain_pack: 'generic' | 'university'
  required_fields: string[]
  suggested_config: {
    start_url?: string
    include_patterns?: string[]
    exclude_patterns?: string[]
    max_pages?: number
    max_depth?: number
  }
  discovery_json: {
    title?: string
    sampled_pages?: number
    links_observed?: number
    page_type_counts?: Record<string, number>
    candidate_pages?: { url: string; page_type: string; reason: string }[]
    sample_results?: { url: string; title?: string; page_type: string; status: string; fields: string[]; coverage?: number; error?: string }[]
    coverage_projection?: { overall: number; field_rates: Record<string, number>; basis: string; pages: number; confidence: string }
    sitemaps?: string[]
    robots_status?: number | null
    robots_accessible?: boolean
    warnings?: string[]
  }
  status: 'draft' | 'approved'
  version: number
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
  by_institution: {
    institution_id: string | null
    name: string
    country_code: string | null
    total: number
    published: number
    review: number
    rejected: number
    average_coverage: number
  }[]
  missing_fields: { field: string; count: number }[]
}
export type GalleryInstitution = {
  id: string
  name: string
  country_code: string | null
  city: string | null
  logo_url: string | null
  banner_url: string | null
  brand_color: string | null
  published_courses?: number
}
export type GalleryCourse = {
  id: string
  institution_id: string
  institution: GalleryInstitution
  title: string
  award: string | null
  level: string | null
  campuses: string[]
  study_modes: string[]
  durations: string[]
  intake_months: string[]
  fees: { residency?: string; label?: string; amount?: number; currency?: string; study_mode?: string }[]
  entry_requirements: string | null
  english_requirements: string | null
  modules: string[]
  scholarships: string[]
  course_content: string | null
  careers: string | null
  source_url: string
  coverage: number
  evidence: CourseRecord['evidence']
  updated_at: string
}
export type GalleryFacets = {
  institution: { value: string; count: number }[]
  country: { value: string; count: number }[]
  level: { value: string; count: number }[]
  study_mode: { value: string; count: number }[]
  campus: { value: string; count: number }[]
  intake_month: { value: string; count: number }[]
  duration: { value: string; count: number }[]
  fee: { min: number | null; max: number | null }
}
export type GalleryFilterParams = {
  q?: string
  collectionId?: string
  level?: string
  institutionIds?: string[]
  countries?: string[]
  intakeMonths?: string[]
  studyModes?: string[]
  durations?: string[]
  feeMax?: number
  sort?: 'updated' | 'title' | 'coverage'
}
export type GalleryInterpretation = {
  source: 'model' | 'fallback'
  filters: {
    q: string | null
    level: string | null
    countries: string[]
    institution_ids: string[]
    study_modes: string[]
    intake_months: string[]
    durations: string[]
    fee_max: number | null
    explanation: string
  }
}
export type ShortlistEntry = {
  id: string
  record_id: string
  note: string | null
  course: GalleryCourse
}

function galleryParams(filters: GalleryFilterParams): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.collectionId) params.set('collection_id', filters.collectionId)
  if (filters.level) params.set('level', filters.level)
  filters.institutionIds?.forEach((value) => params.append('institution_id', value))
  filters.countries?.forEach((value) => params.append('country', value))
  filters.intakeMonths?.forEach((value) => params.append('intake_month', value))
  filters.studyModes?.forEach((value) => params.append('study_mode', value))
  filters.durations?.forEach((value) => params.append('duration', value))
  if (filters.feeMax != null) params.set('fee_max', String(filters.feeMax))
  if (filters.sort) params.set('sort', filters.sort)
  return params
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await http(`${baseUrl}${path}`, {
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
  if (response.status === 204) return undefined as T
  return response.json()
}

export const api = {
  collections: () => request<Collection[]>('/v1/collections'),
  institutions: () => request<Institution[]>('/v1/admin/course-intelligence/institutions'),
  galleryInstitutions: (collectionId?: string) => request<GalleryInstitution[]>(
    `/v1/admin/course-gallery/institutions${collectionId ? `?collection_id=${collectionId}` : ''}`,
  ),
  galleryCourses: (filters: GalleryFilterParams) => request<{ items: GalleryCourse[]; total: number; next_cursor: number | null }>(
    `/v1/admin/course-gallery/courses?${galleryParams(filters)}`,
  ),
  galleryFacets: (filters: GalleryFilterParams) => request<GalleryFacets>(
    `/v1/admin/course-gallery/facets?${galleryParams(filters)}`,
  ),
  galleryShortlist: () => request<ShortlistEntry[]>('/v1/admin/course-gallery/shortlist'),
  interpretGalleryQuery: (query: string) => request<GalleryInterpretation>(
    '/v1/admin/course-gallery/interpret',
    { method: 'POST', body: JSON.stringify({ query }) },
  ),
  addGalleryShortlist: (recordId: string) => request<{ id: string; record_id: string; note: null }>(
    '/v1/admin/course-gallery/shortlist',
    { method: 'POST', body: JSON.stringify({ record_id: recordId }) },
  ),
  removeGalleryShortlist: (recordId: string) => request<void>(
    `/v1/admin/course-gallery/shortlist/${recordId}`,
    { method: 'DELETE' },
  ),
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
  previewBlueprint: (data: Record<string, unknown>) =>
    request<CrawlBlueprint>('/v1/crawl-blueprints/preview', {
      method: 'POST', body: JSON.stringify(data),
    }),
  approveBlueprint: (id: string) =>
    request<CrawlBlueprint>(`/v1/crawl-blueprints/${id}/approve`, { method: 'POST' }),
  updateBlueprint: (id: string, data: Record<string, unknown>) =>
    request<CrawlBlueprint>(`/v1/crawl-blueprints/${id}`, {
      method: 'PATCH', body: JSON.stringify(data),
    }),
  runBlueprint: (id: string) =>
    request<Run>(`/v1/crawl-blueprints/${id}/run`, { method: 'POST' }),
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
  courseRecords: (
    collectionId?: string,
    status?: CourseRecord['status'],
    institutionId?: string,
    limit = 500,
  ) => {
    const params = new URLSearchParams()
    if (collectionId) params.set('collection_id', collectionId)
    if (status) params.set('status', status)
    if (institutionId) params.set('institution_id', institutionId)
    params.set('limit', String(limit))
    return request<CourseRecord[]>(`/v1/admin/course-intelligence/records?${params}`)
  },
  publishCourseRecord: (id: string, note: string) =>
    request<CourseRecord>(`/v1/admin/course-intelligence/records/${id}/publish`, {
      method: 'POST', body: JSON.stringify({ note }),
    }),
  reviewCourseRecord: (id: string, note: string) =>
    request<CourseRecord>(`/v1/admin/course-intelligence/records/${id}/review`, {
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
    const response = await http(`${baseUrl}/v1/runs/${id}/events`, {
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
    // A handler that throws is reporting the answer, not a broken connection.
    // Reconnecting on it would reopen a stream that has nothing left to send.
    let handlerError: unknown
    while (!terminal) {
      try {
        const response = await http(
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
              terminal = ['completed', 'failed'].includes(type)
              try {
                onEvent({ type, id, data: JSON.parse(raw) as Record<string, unknown> })
              } catch (error) {
                handlerError = error
                terminal = true
              }
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
    if (handlerError) throw handlerError
  },
}
