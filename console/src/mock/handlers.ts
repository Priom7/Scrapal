// Route table for the mock transport. Each handler receives the parsed URL and
// returns plain data; status codes and latency are the transport's job.
import type {
  CourseRecord,
  RadarQuery,
  GalleryCourse,
  GalleryFacets,
  GalleryInterpretation,
  ShortlistEntry,
} from '../api'
import { collections, courses, galleryInstitutions, institutions, sources } from './seed'
import {
  endRun, findRun, incidents, listRuns, observabilityRuns, overview, retryIssues,
  runEvents, setIncidentStatus, startRun, timeline, toRunDetail,
} from './runs'
import { createConversation, generationEvents, hasGeneration, startGeneration } from './answers'
import {
  approveBlueprint, createSource, getBlueprint, previewBlueprint, runBlueprint, updateBlueprint,
} from './blueprints'
import { listProposals, setProposalStatus } from './proposals'
import { listRecords, publishedIds, recordRevisions, recordsOverview, setRecordStatus } from './records'
import { profiles, runRetrieval } from './lab'
import { documents, search } from './search'
import { listFunding, listResearchers, researcherDetail, runRadar } from './radar'

export class MockHttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const SHORTLIST_KEY = 'scrapal.mock.shortlist'

function loadShortlist(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(SHORTLIST_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function saveShortlist(ids: string[]): void {
  try {
    globalThis.localStorage?.setItem(SHORTLIST_KEY, JSON.stringify(ids))
  } catch {
    // A blocked storage API must not break the console.
  }
}

let shortlist = loadShortlist()

function matchesAll(selected: string[], values: string[]): boolean {
  return selected.length === 0 || selected.some((value) => values.includes(value))
}

function lowestFee(course: GalleryCourse): number | null {
  const amounts = course.fees.map((fee) => fee.amount).filter((a): a is number => a != null)
  return amounts.length ? Math.min(...amounts) : null
}

function filterCourses(params: URLSearchParams): GalleryCourse[] {
  const q = params.get('q')?.trim().toLowerCase() ?? ''
  const level = params.get('level')
  const institutionIds = params.getAll('institution_id')
  const countries = params.getAll('country')
  const intakes = params.getAll('intake_month')
  const modes = params.getAll('study_mode')
  const durations = params.getAll('duration')
  const feeMax = params.get('fee_max') ? Number(params.get('fee_max')) : null

  const published = publishedIds()
  const filtered = courses.filter((course) => {
    if (!published.has(course.id)) return false
    if (q) {
      const haystack = `${course.title} ${course.award ?? ''} ${course.institution.name} ${course.modules.join(' ')}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (level && course.level !== level) return false
    if (institutionIds.length && !institutionIds.includes(course.institution_id)) return false
    if (countries.length && !countries.includes(course.institution.country_code ?? '')) return false
    if (!matchesAll(intakes, course.intake_months)) return false
    if (!matchesAll(modes, course.study_modes)) return false
    if (!matchesAll(durations, course.durations)) return false
    if (feeMax != null) {
      const fee = lowestFee(course)
      if (fee == null || fee > feeMax) return false
    }
    return true
  })

  const sort = params.get('sort') ?? 'updated'
  return [...filtered].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title)
    if (sort === 'coverage') return b.coverage - a.coverage
    return b.updated_at.localeCompare(a.updated_at)
  })
}

function countBy(values: string[]): { value: string; count: number }[] {
  const counts = new Map<string, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

function facets(params: URLSearchParams): GalleryFacets {
  const scoped = filterCourses(params)
  const fees = scoped.map(lowestFee).filter((fee): fee is number => fee != null)
  return {
    institution: countBy(scoped.map((c) => c.institution_id)),
    country: countBy(scoped.map((c) => c.institution.country_code ?? 'unknown')),
    level: countBy(scoped.map((c) => c.level ?? 'unknown')),
    study_mode: countBy(scoped.flatMap((c) => c.study_modes)),
    campus: countBy(scoped.flatMap((c) => c.campuses)),
    intake_month: countBy(scoped.flatMap((c) => c.intake_months)),
    duration: countBy(scoped.flatMap((c) => c.durations)),
    fee: { min: fees.length ? Math.min(...fees) : null, max: fees.length ? Math.max(...fees) : null },
  }
}

function shortlistEntries(): ShortlistEntry[] {
  return shortlist
    .map((recordId): ShortlistEntry | null => {
      const course = courses.find((c) => c.id === recordId)
      return course ? { id: `sl-${recordId}`, record_id: recordId, note: null, course } : null
    })
    .filter((entry): entry is ShortlistEntry => entry != null)
}

// Keyword interpretation stands in for the model-backed endpoint. It reports
// source: 'fallback' so the UI shows the same degraded state the real API does
// when the model is unavailable — a state worth designing against.
function interpret(query: string): GalleryInterpretation {
  const text = query.toLowerCase()
  const has = (needle: string) => text.includes(needle)
  const countries = [
    ...(has('uk') || has('england') || has('london') ? ['GB'] : []),
    ...(has('ireland') || has('dublin') ? ['IE'] : []),
    ...(has('new zealand') || has('auckland') ? ['NZ'] : []),
  ]
  const level = has('master') || has('msc') || has('postgrad') ? 'Postgraduate'
    : has('bachelor') || has('undergrad') || has('bsc') ? 'Undergraduate'
      : null
  const studyModes = [
    ...(has('part-time') || has('part time') ? ['Part-time'] : []),
    ...(has('full-time') || has('full time') ? ['Full-time'] : []),
    ...(has('online') || has('distance') ? ['Distance learning'] : []),
  ]
  const intakeMonths = ['January', 'May', 'September'].filter((month) => has(month.toLowerCase()))
  const feeMatch = text.match(/(?:under|below|less than|max)\s*[£$]?\s*([\d,]+)/)
  const feeMax = feeMatch ? Number(feeMatch[1].replace(/,/g, '')) : null
  // What is left after the recognised parts are removed is only a search term
  // if it still contains real words. Stripping "One-year master's in London
  // under £15,000" left "One-year 's in", and feeding that to the text filter
  // matched nothing — the search appeared to lose every result.
  const LEFTOVER_NOISE = new Set([
    'in', 'at', 'the', 'for', 'with', 'and', 'or', 'of', 'to', 'on',
    'want', 'looking', 'course', 'courses', 'degree', 'degrees',
    'year', 'years', 'one', 'two', 'three', 'starting', 'start', 'study', 'studying',
    'intake', 'intakes', 'available', 'options', 'programme', 'programmes', 'program',
  ])
  const stripped = query
    .replace(/\b(uk|england|london|ireland|dublin|new zealand|auckland|masters?|msc|postgraduate|bachelors?|bsc|undergraduate|part[- ]time|full[- ]time|online|distance|january|may|september)\b/gi, '')
    .replace(/(?:under|below|less than|max)\s*[£$]?\s*[\d,]+/gi, '')
    .replace(/[\u2019']s\b/g, '')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !LEFTOVER_NOISE.has(word.toLowerCase()))
    .join(' ')
    .trim()

  const applied = [
    level && `level ${level}`,
    countries.length && `countries ${countries.join(', ')}`,
    studyModes.length && `study modes ${studyModes.join(', ')}`,
    intakeMonths.length && `intakes ${intakeMonths.join(', ')}`,
    feeMax != null && `fees under ${feeMax}`,
  ].filter(Boolean)

  return {
    source: 'fallback',
    filters: {
      q: stripped || null,
      level,
      countries,
      institution_ids: [],
      study_modes: studyModes,
      intake_months: intakeMonths,
      durations: [],
      fee_max: feeMax,
      explanation: applied.length
        ? `Matched keywords: ${applied.join('; ')}.`
        : 'No filters detected — searching across the full catalogue.',
    },
  }
}

export type Handler = (url: URL, init?: RequestInit) => unknown

type Route = { method: string; pattern: RegExp; handler: (url: URL, init: RequestInit | undefined, params: string[]) => unknown }

function body<T>(init?: RequestInit): T {
  return JSON.parse(String(init?.body ?? '{}')) as T
}

/** Reads one request header whether api.ts passed a Headers or a plain object. */
function header(init: RequestInit | undefined, name: string): string | null {
  const raw = init?.headers
  if (!raw) return null
  if (raw instanceof Headers) return raw.get(name)
  if (Array.isArray(raw)) return raw.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? null
  const match = Object.entries(raw).find(([key]) => key.toLowerCase() === name.toLowerCase())
  return match ? String(match[1]) : null
}

const routes: Route[] = [
  { method: 'GET', pattern: /^\/v1\/collections$/, handler: () => collections },
  { method: 'GET', pattern: /^\/v1\/runs$/, handler: () => listRuns() },
  {
    method: 'GET',
    pattern: /^\/v1\/runs\/([^/]+)$/,
    handler: (_url, _init, params) => {
      const run = findRun(params[0])
      if (!run) throw new MockHttpError(404, 'Run not found')
      return toRunDetail(run)
    },
  },
  {
    method: 'GET',
    pattern: /^\/v1\/runs\/([^/]+)\/events$/,
    handler: (_url, init, params) => {
      const run = findRun(params[0])
      if (!run) throw new MockHttpError(404, 'Run not found')
      return runEvents(run, init?.signal)
    },
  },
  {
    method: 'POST',
    pattern: /^\/v1\/runs$/,
    handler: (_url, init) => {
      const { source_id: sourceId } = body<{ source_id: string }>(init)
      if (!sources.some((source) => source.id === sourceId)) {
        throw new MockHttpError(404, 'Source not found')
      }
      return startRun(sourceId)
    },
  },
  {
    method: 'POST',
    pattern: /^\/v1\/runs\/([^/]+)\/cancel$/,
    handler: (_url, _init, params) => {
      const run = findRun(params[0])
      if (!run) throw new MockHttpError(404, 'Run not found')
      return endRun(run, 'cancelled')
    },
  },
  {
    method: 'POST',
    pattern: /^\/v1\/runs\/([^/]+)\/retry-issues$/,
    handler: (_url, _init, params) => {
      const run = findRun(params[0])
      if (!run) throw new MockHttpError(404, 'Run not found')
      return retryIssues(run)
    },
  },
  { method: 'GET', pattern: /^\/v1\/admin\/observability\/overview$/, handler: () => overview() },
  { method: 'GET', pattern: /^\/v1\/admin\/observability\/runs$/, handler: () => observabilityRuns() },
  { method: 'GET', pattern: /^\/v1\/admin\/observability\/incidents$/, handler: () => incidents() },
  {
    method: 'GET',
    pattern: /^\/v1\/admin\/observability\/runs\/([^/]+)\/timeline$/,
    handler: (_url, _init, params) => {
      const run = findRun(params[0])
      if (!run) throw new MockHttpError(404, 'Run not found')
      return timeline(run)
    },
  },
  {
    method: 'POST',
    pattern: /^\/v1\/admin\/observability\/incidents\/([^/]+)\/(acknowledge|resolve)$/,
    handler: (_url, _init, params) => {
      const updated = setIncidentStatus(params[0], params[1] === 'resolve' ? 'resolved' : 'acknowledged')
      if (!updated) throw new MockHttpError(404, 'Incident not found')
      return updated
    },
  },
  {
    method: 'GET',
    pattern: /^\/v1\/admin\/observability\/workers$/,
    handler: () => ({
      status: 'ok',
      workers: [{ id: 'worker-1', hostname: 'scrapal-mock', pid: 4211, last_seen_at: new Date().toISOString() }],
    }),
  },
  {
    method: 'GET',
    pattern: /^\/v1\/admin\/observability\/dependencies$/,
    handler: () => ({
      postgres: { status: 'ok' },
      redis: { status: 'ok' },
      ollama: { status: 'ok', detail: 'llama3.1:8b loaded' },
    }),
  },
  {
    method: 'POST',
    pattern: /^\/v1\/sources$/,
    handler: (_url, init) => {
      const input = body<{ collection_id?: string; name?: string; kind?: 'website'; url?: string | null }>(init)
      if (!input.name?.trim()) throw new MockHttpError(422, 'A source name is required')
      return createSource({ ...input, name: input.name })
    },
  },
  {
    method: 'POST',
    pattern: /^\/v1\/crawl-blueprints\/preview$/,
    handler: (_url, init) => {
      const input = body<Parameters<typeof previewBlueprint>[0]>(init)
      if (!input.start_url) throw new MockHttpError(422, 'A starting URL is required')
      if (!/^https?:\/\//.test(input.start_url)) {
        throw new MockHttpError(422, 'The starting URL must begin with http:// or https://')
      }
      if ((input.objective ?? '').trim().length < 12) {
        throw new MockHttpError(422, 'Describe the research objective in a sentence or more')
      }
      return previewBlueprint(input)
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/v1\/crawl-blueprints\/([^/]+)$/,
    handler: (_url, init, params) => {
      const updated = updateBlueprint(params[0], body<Record<string, unknown>>(init))
      if (!updated) throw new MockHttpError(404, 'Crawl blueprint not found')
      return updated
    },
  },
  {
    method: 'POST',
    pattern: /^\/v1\/crawl-blueprints\/([^/]+)\/approve$/,
    handler: (_url, _init, params) => {
      const approved = approveBlueprint(params[0])
      if (!approved) throw new MockHttpError(404, 'Crawl blueprint not found')
      return approved
    },
  },
  {
    method: 'POST',
    pattern: /^\/v1\/crawl-blueprints\/([^/]+)\/run$/,
    handler: (_url, _init, params) => {
      if (!getBlueprint(params[0])) throw new MockHttpError(404, 'Crawl blueprint not found')
      return runBlueprint(params[0])
    },
  },
  {
    method: 'GET',
    pattern: /^\/v1\/admin\/observability\/grafana-link$/,
    handler: (url) => ({
      url: `https://grafana.example/d/scrapal?var-trace=${url.searchParams.get('trace_id') ?? url.searchParams.get('run_id') ?? ''}`,
    }),
  },
  { method: 'POST', pattern: /^\/v1\/conversations$/, handler: () => createConversation() },
  {
    method: 'POST',
    pattern: /^\/v1\/conversations\/([^/]+)\/messages$/,
    handler: (_url, init, params) => {
      const { content } = body<{ content: string }>(init)
      if (!content?.trim()) throw new MockHttpError(422, 'A question is required')
      return startGeneration(params[0], content)
    },
  },
  {
    method: 'GET',
    pattern: /^\/v1\/conversations\/([^/]+)\/events$/,
    handler: (url, init) => {
      const generationId = url.searchParams.get('generation_id') ?? ''
      if (!hasGeneration(generationId)) throw new MockHttpError(404, 'Generation not found')
      return generationEvents(generationId, header(init, 'Last-Event-ID'), init?.signal)
    },
  },
  { method: 'GET', pattern: /^\/v1\/admin\/retrieval-lab\/profiles$/, handler: () => profiles },
  {
    method: 'POST',
    pattern: /^\/v1\/admin\/retrieval-lab\/runs$/,
    handler: (_url, init) => {
      const input = body<Parameters<typeof runRetrieval>[0]>(init)
      if (!input.query?.trim()) throw new MockHttpError(422, 'A research question is required')
      return runRetrieval(input)
    },
  },
  { method: 'GET', pattern: /^\/v1\/documents$/, handler: () => documents() },
  {
    method: 'GET',
    pattern: /^\/v1\/search$/,
    handler: (url) => ({
      hits: search(url.searchParams.get('q') ?? '', url.searchParams.get('collection_id')),
    }),
  },
  { method: 'GET', pattern: /^\/v1\/action-proposals$/, handler: () => listProposals() },
  {
    method: 'POST',
    pattern: /^\/v1\/action-proposals\/([^/]+)\/(approve|reject)$/,
    handler: (_url, _init, params) => {
      const updated = setProposalStatus(params[0], params[1] === 'approve' ? 'approved' : 'rejected')
      if (!updated) throw new MockHttpError(404, 'Proposal not found')
      return updated
    },
  },
  {
    method: 'GET',
    pattern: /^\/v1\/admin\/course-intelligence\/overview$/,
    handler: (url) => recordsOverview(url.searchParams.get('collection_id')),
  },
  {
    method: 'GET',
    pattern: /^\/v1\/admin\/course-intelligence\/records$/,
    handler: (url) => listRecords(
      url.searchParams.get('collection_id'),
      url.searchParams.get('status') as CourseRecord['status'] | null,
      url.searchParams.get('institution_id'),
      Number(url.searchParams.get('limit') ?? 500),
    ),
  },
  {
    method: 'GET',
    pattern: /^\/v1\/admin\/course-intelligence\/records\/([^/]+)\/revisions$/,
    handler: (_url, _init, params) => {
      const revisions = recordRevisions(params[0])
      if (!revisions) throw new MockHttpError(404, 'Course record not found')
      return revisions
    },
  },
  {
    method: 'POST',
    pattern: /^\/v1\/admin\/course-intelligence\/records\/([^/]+)\/(publish|reject|review)$/,
    handler: (_url, init, params) => {
      const { note } = body<{ note?: string }>(init)
      // The API requires a note of at least three characters on every review
      // action; accepting a blank one here would hide that until integration.
      if ((note ?? '').trim().length < 3) throw new MockHttpError(422, 'A review note is required')
      const status = params[1] === 'publish' ? 'published' : params[1] === 'reject' ? 'rejected' : 'review'
      const updated = setRecordStatus(params[0], status, note ?? '')
      if (!updated) throw new MockHttpError(404, 'Course record not found')
      return updated
    },
  },
  {
    method: 'POST',
    pattern: /^\/v1\/research\/match$/,
    handler: (_url, init) => {
      const query = body<RadarQuery>(init)
      // The transport must not quietly accept a document even if a future
      // caller tries to send one: refusing here keeps the privacy promise a
      // property of the system rather than of one component.
      if ('text' in (query as Record<string, unknown>)) {
        throw new MockHttpError(422, 'The Radar accepts a fingerprint, not the document itself')
      }
      return runRadar({
        topics: query.topics ?? [],
        methods: query.methods ?? [],
        applications: query.applications ?? [],
        discipline: query.discipline ?? null,
        keywords: query.keywords ?? [],
      })
    },
  },
  {
    method: 'GET',
    pattern: /^\/v1\/research\/funding$/,
    handler: (url) => listFunding(url.searchParams),
  },
  {
    method: 'GET',
    pattern: /^\/v1\/research\/researchers$/,
    handler: (url) => listResearchers(url.searchParams),
  },
  {
    method: 'GET',
    pattern: /^\/v1\/research\/researchers\/([^/]+)$/,
    handler: (_url, _init, params) => {
      const detail = researcherDetail(params[0])
      if (!detail) throw new MockHttpError(404, 'Researcher not found')
      return detail
    },
  },
  {
    method: 'GET',
    pattern: /^\/v1\/system$/,
    handler: () => ({ ollama: { status: 'ok', version: '0.5.4-mock', models: ['llama3.1:8b'] } }),
  },
  { method: 'GET', pattern: /^\/v1\/sources$/, handler: () => sources },
  { method: 'GET', pattern: /^\/v1\/admin\/course-intelligence\/institutions$/, handler: () => institutions },
  {
    method: 'GET',
    pattern: /^\/v1\/admin\/course-gallery\/institutions$/,
    handler: () => {
      const published = publishedIds()
      return galleryInstitutions.map((institution) => ({
        ...institution,
        published_courses: courses.filter(
          (course) => course.institution_id === institution.id && published.has(course.id),
        ).length,
      }))
    },
  },
  {
    method: 'GET',
    pattern: /^\/v1\/admin\/course-gallery\/courses$/,
    handler: (url) => {
      const items = filterCourses(url.searchParams)
      return { items, total: items.length, next_cursor: null }
    },
  },
  { method: 'GET', pattern: /^\/v1\/admin\/course-gallery\/facets$/, handler: (url) => facets(url.searchParams) },
  { method: 'GET', pattern: /^\/v1\/admin\/course-gallery\/shortlist$/, handler: () => shortlistEntries() },
  {
    method: 'POST',
    pattern: /^\/v1\/admin\/course-gallery\/shortlist$/,
    handler: (_url, init) => {
      const { record_id: recordId } = body<{ record_id: string }>(init)
      if (!courses.some((course) => course.id === recordId)) {
        throw new MockHttpError(404, 'Course record not found')
      }
      if (!shortlist.includes(recordId)) {
        shortlist = [...shortlist, recordId]
        saveShortlist(shortlist)
      }
      return { id: `sl-${recordId}`, record_id: recordId, note: null }
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/v1\/admin\/course-gallery\/shortlist\/([^/]+)$/,
    handler: (_url, _init, params) => {
      shortlist = shortlist.filter((id) => id !== params[0])
      saveShortlist(shortlist)
      return undefined
    },
  },
  {
    method: 'POST',
    pattern: /^\/v1\/admin\/course-gallery\/interpret$/,
    handler: (_url, init) => interpret(body<{ query: string }>(init).query ?? ''),
  },
]

export function resolve(path: string, method: string): ((url: URL, init?: RequestInit) => unknown) | null {
  for (const route of routes) {
    if (route.method !== method) continue
    const match = route.pattern.exec(path)
    if (match) return (url, init) => route.handler(url, init, match.slice(1))
  }
  return null
}
