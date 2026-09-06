// Course records are the layer the gallery is a projection of: the gallery
// shows published ones, Course intelligence reviews the rest. Keeping one store
// behind both means publishing a record in review makes it appear in the
// gallery, the way the real product works.
import type {
  CourseIntelligenceOverview, CourseRecord, GalleryCourse, RecordRevision,
} from '../api'
import { courses, institutions } from './seed'

const REQUIRED_FIELDS = [
  'title', 'award', 'level', 'campuses', 'study_modes', 'durations',
  'intake_months', 'fees', 'entry_requirements', 'english_requirements',
  'modules', 'scholarships',
]

const REVIEW_REASONS = [
  'Tuition was read from a fees table that lists more than one academic year.',
  'Two pages state different durations for this course.',
  'The entry requirement paragraph changed since the last crawl.',
  'Coverage fell below the threshold for a published record.',
]

type Stored = {
  record: CourseRecord
  institution_id: string
  collection_id: string
}

function dataFor(course: GalleryCourse): Record<string, unknown> {
  return {
    title: course.title,
    award: course.award,
    level: course.level,
    campuses: course.campuses,
    study_modes: course.study_modes,
    durations: course.durations,
    intake_months: course.intake_months,
    fees: course.fees,
    entry_requirements: course.entry_requirements,
    english_requirements: course.english_requirements,
    modules: course.modules,
    scholarships: course.scholarships,
    course_content: course.course_content,
    careers: course.careers,
    source_url: course.source_url,
  }
}

function missingFor(course: GalleryCourse): string[] {
  const data = dataFor(course)
  return REQUIRED_FIELDS.filter((field) => {
    const value = data[field]
    return value == null || (Array.isArray(value) && value.length === 0)
  })
}

const store: Stored[] = courses.map((course, index) => {
  const missing = missingFor(course)
  // A spread of states, fixed by position so a reload shows the same queue.
  const status: CourseRecord['status'] = index % 23 === 7 ? 'rejected'
    : index % 7 === 3 || course.coverage < 0.6 ? 'review'
      : 'published'
  const reviewed = status !== 'review'
  return {
    institution_id: course.institution_id,
    collection_id: course.institution.country_code === 'NZ' ? 'col-anz-courses' : 'col-uk-courses',
    record: {
      id: course.id,
      schema_name: 'university_course',
      external_id: course.source_url,
      data: dataFor(course),
      evidence: course.evidence,
      confidence: Number(Math.min(0.98, course.coverage + 0.08).toFixed(2)),
      published: status === 'published',
      status,
      validation_json: {
        coverage: course.coverage,
        required_fields: REQUIRED_FIELDS.length,
        missing_fields: missing,
        contradictions: index % 11 === 5 ? ['Two pages state a different tuition fee for home students.'] : [],
        review_reasons: status === 'review' ? [REVIEW_REASONS[index % REVIEW_REASONS.length]] : [],
      },
      extractor_version: 'university-pack@3.2.0',
      revision: 1 + (index % 3),
      reviewed_at: reviewed ? course.updated_at : null,
      reviewed_by: reviewed ? 'evidence-review@scrapal' : null,
      published_at: status === 'published' ? course.updated_at : null,
      updated_at: course.updated_at,
    },
  }
})

/** The gallery is the published slice of this store. */
export function publishedIds(): Set<string> {
  return new Set(store.filter((item) => item.record.status === 'published').map((item) => item.record.id))
}

function inScope(item: Stored, collectionId?: string | null): boolean {
  return !collectionId || item.collection_id === collectionId
}

export function listRecords(
  collectionId?: string | null,
  status?: CourseRecord['status'] | null,
  institutionId?: string | null,
  limit = 500,
): CourseRecord[] {
  return store
    .filter((item) => inScope(item, collectionId))
    .filter((item) => !status || item.record.status === status)
    .filter((item) => !institutionId || item.institution_id === institutionId)
    .slice(0, limit)
    .map((item) => item.record)
}

export function setRecordStatus(
  id: string,
  status: CourseRecord['status'],
  note: string,
): CourseRecord | undefined {
  const item = store.find((entry) => entry.record.id === id)
  if (!item) return undefined
  const now = new Date().toISOString()
  item.record = {
    ...item.record,
    status,
    published: status === 'published',
    revision: item.record.revision + 1,
    reviewed_at: now,
    reviewed_by: note.trim() ? `review: ${note.trim()}` : 'evidence-review@scrapal',
    published_at: status === 'published' ? now : null,
    updated_at: now,
    validation_json: {
      ...item.record.validation_json,
      review_reasons: status === 'review' ? ['Returned to review by an operator.'] : [],
    },
  }
  return item.record
}

export function recordsOverview(collectionId?: string | null): CourseIntelligenceOverview {
  const scoped = store.filter((item) => inScope(item, collectionId))
  const tally = (items: Stored[], status: CourseRecord['status']) =>
    items.filter((item) => item.record.status === status).length
  const mean = (items: Stored[]) => items.length
    ? Number((items.reduce((sum, item) => sum + (item.record.validation_json.coverage ?? 0), 0) / items.length).toFixed(3))
    : 0

  const missing = new Map<string, number>()
  scoped.forEach((item) => {
    item.record.validation_json.missing_fields?.forEach((field) => {
      missing.set(field, (missing.get(field) ?? 0) + 1)
    })
  })

  return {
    total: scoped.length,
    published: tally(scoped, 'published'),
    review: tally(scoped, 'review'),
    rejected: tally(scoped, 'rejected'),
    average_coverage: mean(scoped),
    by_institution: institutions
      .map((institution) => {
        const rows = scoped.filter((item) => item.institution_id === institution.id)
        return {
          institution_id: institution.id,
          name: institution.name,
          country_code: institution.country_code,
          total: rows.length,
          published: tally(rows, 'published'),
          review: tally(rows, 'review'),
          rejected: tally(rows, 'rejected'),
          average_coverage: mean(rows),
        }
      })
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total),
    missing_fields: [...missing.entries()]
      .map(([field, count]) => ({ field, count }))
      .sort((a, b) => b.count - a.count || a.field.localeCompare(b.field)),
  }
}


// A crawl history, so the console and the student workspace can answer "what
// changed since I saved this?" — the one question a competitor without a crawl
// archive cannot answer at all. Derived from the current record by walking a
// few known changes backwards, so the diff is always real rather than random.
const HISTORY_DAYS = [96, 41]

function olderData(record: CourseRecord, step: number): Record<string, unknown> {
  const data = { ...record.data }
  const fees = (record.data.fees as GalleryCourse['fees'] | undefined) ?? []
  // Fees rose at each revision, which is what actually happens year on year.
  data.fees = fees.map((fee) => (
    fee.amount == null ? fee : { ...fee, amount: Math.round(fee.amount * (step === 2 ? 0.88 : 0.95)) }
  ))
  if (step === 2) {
    const intakes = (record.data.intake_months as string[] | undefined) ?? []
    // The oldest snapshot predates an added intake, where there is one to drop.
    if (intakes.length > 1) data.intake_months = intakes.slice(0, -1)
    if (record.data.english_requirements) {
      data.english_requirements = String(record.data.english_requirements).replace(/6\.5/g, '6.0')
    }
  }
  return data
}

export function recordRevisions(id: string): RecordRevision[] | undefined {
  const item = store.find((entry) => entry.record.id === id)
  if (!item) return undefined
  const now = Date.now()
  const current: RecordRevision = {
    id: `${item.record.id}-rev-current`,
    revision: item.record.revision,
    status: item.record.status,
    confidence: item.record.confidence,
    validation: item.record.validation_json,
    note: 'Current published version.',
    created_at: item.record.updated_at,
    data: item.record.data,
  }
  const older = HISTORY_DAYS.map((days, index) => ({
    id: `${item.record.id}-rev-${index + 1}`,
    revision: Math.max(1, item.record.revision - (index + 1)),
    status: item.record.status,
    confidence: Number(Math.max(0.3, item.record.confidence - 0.05 * (index + 1)).toFixed(2)),
    validation: item.record.validation_json,
    note: index === 0 ? 'Re-crawled after the source page changed.' : 'First published version.',
    created_at: new Date(now - days * 86_400_000).toISOString(),
    data: olderData(item.record, index + 1),
  }))
  return [current, ...older]
}
