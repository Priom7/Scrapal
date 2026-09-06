// Documents and hybrid search, derived from the published record store so the
// Knowledge view indexes exactly what the gallery shows.
import type { Document, SearchHit } from '../api'
import { publishedIds } from './records'
import { courses } from './seed'

type Section = { heading: string; anchor: string; text: (course: (typeof courses)[number]) => string | null }

const SECTIONS: Section[] = [
  { heading: 'Overview', anchor: 'overview', text: (course) => course.course_content },
  {
    heading: 'Fees and funding',
    anchor: 'fees',
    text: (course) => {
      const parts = course.fees
        .filter((fee) => fee.amount != null)
        .map((fee) => `${fee.label ?? fee.residency ?? 'Tuition'}: £${fee.amount!.toLocaleString('en-GB')} per year`)
      return parts.length ? `${parts.join('. ')}. Fees are reviewed annually.` : null
    },
  },
  { heading: 'Entry requirements', anchor: 'entry', text: (course) => course.entry_requirements },
  { heading: 'English language', anchor: 'english', text: (course) => course.english_requirements },
  {
    heading: 'Key dates',
    anchor: 'dates',
    text: (course) => course.intake_months.length
      ? `Intakes run in ${course.intake_months.join(', ')}. The course lasts ${course.durations[0] ?? 'an unstated period'}.`
      : null,
  },
  {
    heading: 'Modules',
    anchor: 'modules',
    text: (course) => course.modules.length ? `Core modules include ${course.modules.slice(0, 4).join(', ')}.` : null,
  },
  { heading: 'Careers', anchor: 'careers', text: (course) => course.careers },
]

// Words that mean the same thing to a reader but share no characters. Without
// these the "meaning" half of hybrid retrieval scores identically to the
// lexical half, and the console has nothing to distinguish.
const CONCEPTS: string[][] = [
  ['tuition', 'fee', 'fees', 'cost', 'costs', 'price', 'funding', 'scholarship', 'bursary'],
  ['intake', 'start', 'starts', 'starting', 'begin', 'begins', 'january', 'may', 'september'],
  ['entry', 'entrance', 'requirement', 'requirements', 'grades', 'ucas', 'honours', 'qualification'],
  ['english', 'ielts', 'language', 'toefl'],
  ['module', 'modules', 'curriculum', 'content', 'syllabus', 'taught', 'study', 'studies', 'learn', 'learning'],
  ['career', 'careers', 'job', 'jobs', 'employment', 'graduate', 'profession'],
  ['duration', 'length', 'long', 'years', 'year', 'placement', 'sandwich'],
]

function related(terms: string[]): string[] {
  const out = new Set<string>()
  terms.forEach((term) => {
    CONCEPTS.forEach((group) => {
      if (group.includes(term)) group.forEach((word) => { if (word !== term) out.add(word) })
    })
  })
  return [...out]
}

export function documents(): Document[] {
  const published = publishedIds()
  return courses
    .filter((course) => published.has(course.id))
    .slice()
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((course) => ({
      id: `doc-${course.id}`,
      title: `${course.title} — ${course.institution.name}`,
      canonical_url: course.source_url,
      media_type: 'text/html',
      updated_at: course.updated_at,
    }))
}

function round(value: number): number {
  return Number(value.toFixed(3))
}

/** Lexical overlap and a crude "meaning" score, fused the way the real hybrid
    retriever reports them, so the console has three numbers to show rather than
    one opaque relevance value. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'are', 'can', 'you', 'your', 'how', 'much', 'many',
  'does', 'did', 'what', 'which', 'who', 'when', 'where', 'will', 'would', 'should',
  'any', 'all', 'from', 'into', 'about', 'this', 'that', 'there', 'have', 'has',
  'get', 'got', 'need', 'want', 'like', 'course', 'courses',
])

export function search(query: string, collectionId?: string | null): SearchHit[] {
  const terms = (query.toLowerCase().match(/[a-z£\d]{3,}/g) ?? [])
    .filter((term) => !STOPWORDS.has(term))
  if (!terms.length) return []
  const published = publishedIds()

  const hits: SearchHit[] = []
  courses.forEach((course) => {
    if (!published.has(course.id)) return
    if (collectionId && collectionId !== (course.institution.country_code === 'NZ' ? 'col-anz-courses' : 'col-uk-courses')) return

    SECTIONS.forEach((section) => {
      const text = section.text(course)
      if (!text) return
      const haystack = `${course.title} ${section.heading} ${text}`.toLowerCase()
      const lexical = terms.filter((term) => haystack.includes(term)).length / terms.length
      // Standing in for embedding similarity: passages that share a concept
      // with the question but not its words, plus title proximity.
      const concepts = related(terms)
      const conceptHits = concepts.length
        ? concepts.filter((word) => haystack.includes(word)).length / concepts.length
        : 0
      const titleHits = terms.filter((term) => course.title.toLowerCase().includes(term)).length / terms.length
      const vector = Math.min(1, conceptHits * 0.75 + titleHits * 0.5 + course.coverage * 0.1)
      if (lexical === 0 && conceptHits === 0 && titleHits === 0) return

      const structured = course.coverage
      const fused = round(lexical * 0.5 + vector * 0.35 + structured * 0.15)
      const excerpt = text.length > 260 ? `${text.slice(0, 257)}…` : text

      hits.push({
        chunk_id: `chunk-${course.id}-${section.anchor}`,
        document_id: `doc-${course.id}`,
        title: `${course.title} — ${course.institution.name}`,
        url: `${course.source_url}#${section.anchor}`,
        heading: section.heading,
        excerpt,
        score: fused,
        document_version_id: `ver-${course.id}-1`,
        section_path: [course.institution.name, course.title, section.heading],
        anchor: section.anchor,
        lexical_score: round(lexical),
        vector_score: round(vector),
        structured_score: round(structured),
        fused_score: fused,
      })
    })
  })

  return hits.sort((a, b) => b.fused_score - a.fused_score).slice(0, 20)
}
