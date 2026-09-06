// Cited answers, simulated as a frame script.
//
// The client's stream reader (api.ts watchGeneration) resumes with
// Last-Event-ID, backs off, and distinguishes a thrown handler from a broken
// connection. None of that runs against a fixture that always succeeds, so this
// mock deliberately drops the first connection to every generation part-way
// through and lets the client resume it.
import type { Generation, GenerationEvent } from '../api'
import { tick } from './config'
import { publishedIds } from './records'
import { courses } from './seed'

type Frame = { id: number; event: string; data: Record<string, unknown> }

type Script = {
  frames: Frame[]
  /** Cleared once the first connection has been cut, so a resume completes. */
  dropPending: boolean
}

const scripts = new Map<string, Script>()
let counter = 0

function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${String(counter).padStart(4, '0')}`
}

export function createConversation(): { id: string } {
  return { id: nextId('conv') }
}

const AWARDS = ['MBA', 'MSc', 'MA', 'BSc', 'BA', 'BEng']
const MONTHS = ['January', 'May', 'September']
const COUNTRIES: Record<string, string> = {
  uk: 'GB', england: 'GB', britain: 'GB', ireland: 'IE', irish: 'IE',
  'new zealand': 'NZ', auckland: 'NZ', dublin: 'IE', london: 'GB',
}

/** Constraints the question states outright are filters, not hints: asking for
    an MBA starting in September must not return an MA starting in January. */
function askedIntake(question: string): string | undefined {
  return MONTHS.find((month) => question.toLowerCase().includes(month.toLowerCase()))
}

function matches(question: string) {
  const text = question.toLowerCase()
  const award = AWARDS.find((value) => new RegExp(`\\b${value.toLowerCase()}\\b`).test(text))
  const intake = MONTHS.find((month) => text.includes(month.toLowerCase()))
  const country = Object.entries(COUNTRIES).find(([name]) => text.includes(name))?.[1]
  const level = text.includes('master') || text.includes('postgrad') ? 'Postgraduate'
    : text.includes('bachelor') || text.includes('undergrad') ? 'Undergraduate'
      : null
  const partTime = text.includes('part-time') || text.includes('part time')

  const published = publishedIds()
  const eligible = courses.filter((course) => {
    if (!published.has(course.id)) return false
    if (award && course.award !== award) return false
    if (intake && !course.intake_months.includes(intake)) return false
    if (country && course.institution.country_code !== country) return false
    if (level && course.level !== level) return false
    if (partTime && !course.study_modes.some((mode) => mode.includes('Part-time'))) return false
    return true
  })

  // Everything the constraints did not consume ranks what is left by subject.
  const consumed = new Set([
    ...(award ? [award.toLowerCase()] : []),
    ...(intake ? [intake.toLowerCase()] : []),
    ...Object.keys(COUNTRIES).filter((name) => text.includes(name)),
    'course', 'courses', 'what', 'which', 'they', 'cost', 'have', 'does', 'with', 'from', 'much',
    'master', 'masters', 'bachelor', 'bachelors', 'postgraduate', 'undergraduate', 'part', 'time',
  ])
  const words = (text.match(/[a-z]{3,}/g) ?? []).filter((word) => !consumed.has(word))

  const scored = eligible
    .map((course) => {
      const haystack = `${course.title} ${course.institution.name} ${course.modules.join(' ')}`.toLowerCase()
      return { course, score: words.filter((word) => haystack.includes(word)).length }
    })
    .sort((a, b) => b.score - a.score || b.course.coverage - a.course.coverage)

  // A question with recognised constraints but no subject term still has an
  // answer; one that matches nothing at all must abstain.
  const anchored = award || intake || country || level || partTime
  const hits = words.length ? scored.filter((hit) => hit.score > 0) : scored
  return (hits.length ? hits : anchored ? scored : []).slice(0, 3).map((hit) => hit.course)
}

function planFor(question: string, hits: ReturnType<typeof matches>) {
  const text = question.toLowerCase()
  return {
    intent: hits.length ? 'compare_courses' : 'unknown',
    entities: [...new Set(hits.map((course) => course.institution.name))],
    requested_fields: [
      ...(text.includes('fee') || text.includes('cost') || text.includes('tuition') ? ['fees'] : []),
      ...(text.includes('intake') || text.includes('start') ? ['intake_months'] : []),
      ...(text.includes('entry') || text.includes('requirement') ? ['entry_requirements'] : []),
      ...(text.includes('long') || text.includes('duration') ? ['durations'] : []),
    ],
    search_query: question,
    level: text.includes('master') || text.includes('postgrad') ? 'Postgraduate'
      : text.includes('bachelor') || text.includes('undergrad') ? 'Undergraduate' : null,
    residency: text.includes('international') ? 'international' : text.includes('home') ? 'home' : null,
    intake: ['January', 'May', 'September'].find((month) => text.includes(month.toLowerCase())) ?? null,
    study_mode: text.includes('part-time') || text.includes('part time') ? 'Part-time' : null,
    source: 'mock',
  }
}

function money(amount?: number): string {
  return amount == null ? 'an unpublished fee' : `£${amount.toLocaleString('en-GB')}`
}

function chunk(text: string): string[] {
  // Roughly word-sized pieces, so the answer types out rather than appearing.
  return text.match(/\S+\s*/g) ?? [text]
}

function buildScript(question: string): Frame[] {
  const frames: Frame[] = []
  let id = 0
  const push = (event: string, data: Record<string, unknown> = {}) => {
    id += 1
    frames.push({ id, event, data })
  }

  const hits = matches(question)
  push('retrieval.started')
  push('retrieval.completed', { passages: hits.length * 4, plan: planFor(question, hits) })

  // A question the evidence cannot answer must abstain rather than improvise.
  if (!hits.length) {
    push('abstained', {
      answer: 'Nothing in the published evidence covers that. Try naming a subject, a university, or an intake month.',
    })
    push('completed')
    return frames
  }

  if (question.toLowerCase().includes('fail')) {
    push('failed', { reason: 'The local model stopped responding.' })
    return frames
  }

  push('generation.started')
  hits.forEach((course, index) => {
    push('citation', {
      number: index + 1,
      title: `${course.title} — ${course.institution.name}`,
      url: course.source_url,
    })
  })

  const wanted = askedIntake(question)
  const sentences = hits.map((course, index) => {
    const fee = course.fees.find((item) => item.residency === 'international')?.amount
    const intake = wanted && course.intake_months.includes(wanted) ? wanted : course.intake_months[0]
    return `${course.institution.name} offers ${course.title} (${course.award ?? 'award not stated'}) at ${money(fee)} for international students, running ${course.durations[0] ?? 'for an unstated period'} with a ${intake ?? 'unpublished'} intake [${index + 1}].`
  })
  chunk(sentences.join(' ')).forEach((delta) => push('answer.delta', { delta }))

  // One sentence the validator could not tie back to a source. The panel has a
  // state for this; without it here, that state would never be seen.
  push('answer.withheld', { reason: 'A sentence about scholarship deadlines had no supporting citation.' })
  push('completed')
  return frames
}

export function startGeneration(conversationId: string, question: string): Generation {
  const id = nextId('gen')
  scripts.set(id, { frames: buildScript(question), dropPending: true })
  return {
    id,
    conversation_id: conversationId,
    status: 'queued',
    created_at: new Date().toISOString(),
  }
}

export function hasGeneration(id: string): boolean {
  return scripts.has(id)
}

function encodeFrame(frame: Frame): string {
  return `event: ${frame.event}\nid: ${frame.id}\ndata: ${JSON.stringify(frame.data)}\n\n`
}

export function generationEvents(
  generationId: string,
  lastEventId: string | null,
  signal?: AbortSignal | null,
): ReadableStream<Uint8Array> {
  const script = scripts.get(generationId)!
  const encoder = new TextEncoder()
  const after = lastEventId ? Number(lastEventId) : 0
  const pending = script.frames.filter((frame) => frame.id > after)
  // Cut the first connection about two thirds in, so the client's resume path
  // runs on an answer that is still mid-sentence.
  const cutAt = script.dropPending && pending.length > 6
    ? Math.max(1, Math.floor(pending.length * 0.66))
    : Number.POSITIVE_INFINITY
  let sent = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  return new ReadableStream({
    start(controller) {
      // A comment frame: the client must skip it rather than parse it.
      controller.enqueue(encoder.encode(': keepalive\n\n'))
      const push = () => {
        if (signal?.aborted) {
          controller.close()
          return
        }
        if (sent >= cutAt) {
          script.dropPending = false
          controller.close()
          return
        }
        const frame = pending[sent]
        if (!frame) {
          controller.close()
          return
        }
        controller.enqueue(encoder.encode(encodeFrame(frame)))
        sent += 1
        if (frame.event === 'completed' || frame.event === 'failed') {
          controller.close()
          return
        }
        timer = setTimeout(push, tick(frame.event === 'answer.delta' ? 45 : 260))
      }
      push()
    },
    cancel() {
      if (timer != null) clearTimeout(timer)
    },
  })
}

export type { GenerationEvent }
