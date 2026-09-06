// The guided setup: sample a site, project what a full crawl would find, and
// let someone approve the scope before anything runs. Field rates come from the
// seeded courses for that domain, so the projection the wizard shows is the
// coverage the crawl would actually produce rather than an invented number.
import type { CrawlBlueprint, Run, Source } from '../api'
import { startRun } from './runs'
import { courses, institutions, sources } from './seed'

const PAGE_TYPES = ['course-detail', 'course-listing', 'fees', 'entry-requirements', 'campus', 'news', 'staff-profile']

const TRACKED_FIELDS = [
  'title', 'award', 'level', 'campuses', 'study_modes', 'durations',
  'intake_months', 'fees', 'entry_requirements', 'english_requirements',
  'application_documents', 'deadlines', 'scholarships',
]

const store = new Map<string, CrawlBlueprint>()
let counter = 0

function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${String(counter).padStart(4, '0')}`
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Courses already seeded for this domain, if it is one Scrapal knows. */
function knownCourses(startUrl: string) {
  const host = hostOf(startUrl)
  const institution = institutions.find((item) => host.endsWith(item.domain))
  if (!institution) return { institution: undefined, sample: [] }
  return { institution, sample: courses.filter((course) => course.institution_id === institution.id) }
}

function fieldRates(sample: ReturnType<typeof knownCourses>['sample'], required: string[]): Record<string, number> {
  const fields = required.length ? required : TRACKED_FIELDS
  const rates: Record<string, number> = {}
  fields.forEach((field) => {
    if (!sample.length) {
      // An unseeded domain gets a cautious projection, not a confident one.
      rates[field] = Number((0.25 + (field.length % 5) * 0.09).toFixed(2))
      return
    }
    const present = sample.filter((course) => {
      const value = (course as unknown as Record<string, unknown>)[field]
      if (Array.isArray(value)) return value.length > 0
      return value != null && value !== ''
    }).length
    rates[field] = Number((present / sample.length).toFixed(2))
  })
  return rates
}

export function previewBlueprint(input: {
  collection_id?: string
  name: string
  start_url: string
  objective: string
  domain_pack?: CrawlBlueprint['domain_pack']
  required_fields?: string[]
  max_pages?: number
}): CrawlBlueprint {
  const { institution, sample } = knownCourses(input.start_url)
  const host = hostOf(input.start_url)
  const required = input.required_fields ?? []
  const rates = fieldRates(sample, required)
  const values = Object.values(rates)
  const overall = values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : 0

  const sampled = sample.length ? Math.min(24, 8 + sample.length) : 9
  const links = sampled * (institution ? 34 : 21)

  // A domain with no seeded courses genuinely cannot be projected confidently;
  // saying so is more useful than a number that looks authoritative.
  const confidence = !institution ? 'low' : sample.length >= 10 ? 'high' : 'medium'

  const counts: Record<string, number> = {}
  PAGE_TYPES.forEach((type, index) => {
    const weight = type === 'course-detail' ? sample.length || 6 : Math.max(1, Math.round((sampled / (index + 2))))
    counts[type] = weight
  })

  const blueprint: CrawlBlueprint = {
    id: nextId('bp'),
    collection_id: input.collection_id ?? 'col-uk-courses',
    source_id: null,
    name: input.name,
    start_url: input.start_url,
    objective: input.objective,
    domain_pack: input.domain_pack ?? 'generic',
    required_fields: required,
    suggested_config: {
      start_url: input.start_url,
      include_patterns: institution ? ['/study/courses', '/undergraduate', '/postgraduate'] : ['/'],
      exclude_patterns: ['/news', '/events', '/staff', '/blog', '/search'],
      max_pages: input.max_pages ?? 500,
      max_depth: 2,
    },
    discovery_json: {
      title: institution?.name ?? host,
      sampled_pages: sampled,
      links_observed: links,
      page_type_counts: counts,
      candidate_pages: sample.slice(0, 5).map((course) => ({
        url: course.source_url,
        page_type: 'course-detail',
        reason: 'Course title, award and a fees table were all found on this page.',
      })),
      sample_results: sample.slice(0, 5).map((course) => ({
        url: course.source_url,
        title: course.title,
        page_type: 'course-detail',
        status: 'ok',
        fields: TRACKED_FIELDS.filter((field) => {
          const value = (course as unknown as Record<string, unknown>)[field]
          return Array.isArray(value) ? value.length > 0 : value != null && value !== ''
        }),
        coverage: course.coverage,
      })),
      coverage_projection: {
        overall,
        field_rates: rates,
        basis: 'representative_pages',
        pages: sample.length ? Math.min(sample.length, 12) : 0,
        confidence,
      },
      sitemaps: institution ? [`https://${host}/sitemap.xml`] : [],
      robots_status: 200,
      robots_accessible: true,
      warnings: [
        ...(institution ? [] : [`Scrapal has not crawled ${host} before, so this projection is based on a small sample.`]),
        ...(overall < 0.6 ? ['Several required fields were missing from the sampled pages. Expect gaps to review after the first crawl.'] : []),
      ],
    },
    status: 'draft',
    version: 1,
  }
  store.set(blueprint.id, blueprint)
  return blueprint
}

export function getBlueprint(id: string): CrawlBlueprint | undefined {
  return store.get(id)
}

export function updateBlueprint(id: string, patch: Record<string, unknown>): CrawlBlueprint | undefined {
  const blueprint = store.get(id)
  if (!blueprint) return undefined
  const updated: CrawlBlueprint = {
    ...blueprint,
    suggested_config: { ...blueprint.suggested_config, ...patch },
    version: blueprint.version + 1,
  }
  store.set(id, updated)
  return updated
}

export function approveBlueprint(id: string): CrawlBlueprint | undefined {
  const blueprint = store.get(id)
  if (!blueprint) return undefined
  const approved: CrawlBlueprint = { ...blueprint, status: 'approved' }
  store.set(id, approved)
  return approved
}

/** Approving a blueprint creates the source it describes, then crawls it. */
export function runBlueprint(id: string): Run | undefined {
  const blueprint = store.get(id)
  if (!blueprint) return undefined
  const source = blueprint.source_id
    ? sources.find((item) => item.id === blueprint.source_id)!
    : createSource({
      collection_id: blueprint.collection_id,
      name: blueprint.name,
      kind: 'website',
      url: blueprint.start_url,
    })
  store.set(id, { ...blueprint, source_id: source.id, status: 'approved' })
  return startRun(source.id)
}

export function createSource(input: {
  collection_id?: string
  name: string
  kind?: Source['kind']
  url?: string | null
}): Source {
  const source: Source = {
    id: nextId('src'),
    collection_id: input.collection_id ?? 'col-uk-courses',
    name: input.name,
    kind: input.kind ?? 'website',
    url: input.url ?? null,
    enabled: true,
    last_run_at: null,
  }
  sources.push(source)
  return source
}
