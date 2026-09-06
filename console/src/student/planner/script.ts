// The interview, as data.
//
// A blank chat box is as cold as a blank form: it asks the student to know what
// to ask. So Scrapal leads, one question at a time, always with tappable
// answers and always with a way to skip. Steps are entries here rather than
// branches in code, so the conversation can be reordered or extended without
// touching the engine.
import { matchCourse, matchRank, type Classification } from '../match'
import type { Chip, StepContext, StepId } from './types'

export type Step = {
  id: StepId
  /** What Scrapal says when it reaches this step. */
  ask: (context: StepContext) => string
  chips?: (context: StepContext) => Chip[]
  /** Reads a free-text or chip answer into the plan. Null means "not understood". */
  apply?: (answer: string, context: StepContext) => Partial<StepResult> | null
  next: StepId
}

export type StepResult = {
  /** Free-text answers kept verbatim for the personal statement. */
  answer: { id: string; text: string } | null
  name: string | null
  referee: { name: string; email: string } | null
  subject: string | null
  classification: Classification | null
  ucasPoints: number | null
  ieltsOverall: number | null
  ieltsLowest: number | null
  budget: number | null
  intake: string | null
  countries: string[]
  level: string | null
}

const SKIP = ['skip', 'not sure', 'no preference', 'later', 'dunno', "don't know", 'not yet']

export function isSkip(answer: string): boolean {
  const lower = answer.trim().toLowerCase()
  return SKIP.some((word) => lower === word || lower.startsWith(word))
}

function number(answer: string): number | null {
  const found = answer.replace(/[,£]/g, '').match(/\d+(?:\.\d+)?/)
  return found ? Number(found[0]) : null
}

/** Courses that fit what has been said so far, best first. */
export function shortlist({ state, courses }: StepContext, limit = 3) {
  const subject = state.subject?.toLowerCase()
  return courses
    .filter((course) => !subject || `${course.title} ${course.modules.join(' ')}`.toLowerCase().includes(subject))
    .filter((course) => !state.profile.countries.length
      || state.profile.countries.includes(course.institution.country_code ?? ''))
    .map((course) => ({ course, result: matchCourse(course, state.profile) }))
    .sort((a, b) => matchRank(a.result) - matchRank(b.result))
    .slice(0, limit)
    .map((entry) => entry.course)
}

export const STEPS: Step[] = [
  {
    id: 'greet',
    ask: () => 'Hi. I can help you work out where you could study, what it would cost, and whether you would get in. Nothing you tell me leaves this device.',
    chips: () => [{ label: 'Let’s start' }, { label: 'Just show me some courses', value: 'show me courses' }],
    next: 'subject',
  },
  {
    id: 'subject',
    ask: () => 'What do you want to study?',
    chips: () => [
      { label: 'Data Science' }, { label: 'Business Management' },
      { label: 'Cyber Security' }, { label: 'Nursing' },
      { label: 'Not sure yet', value: 'skip', tone: 'skip' },
    ],
    apply: (answer) => isSkip(answer) ? { subject: null } : { subject: answer.trim() },
    next: 'level',
  },
  {
    id: 'level',
    ask: () => 'Is this your first degree, or a master’s?',
    chips: () => [
      { label: 'First degree', value: 'undergraduate' },
      { label: 'Master’s', value: 'postgraduate' },
      { label: 'Not sure yet', value: 'skip', tone: 'skip' },
    ],
    apply: (answer) => {
      if (isSkip(answer)) return { level: null }
      const lower = answer.toLowerCase()
      if (lower.includes('master') || lower.includes('postgrad') || lower.includes('msc')) return { level: 'Postgraduate' }
      if (lower.includes('first') || lower.includes('undergrad') || lower.includes('bachelor')) return { level: 'Undergraduate' }
      return null
    },
    next: 'country',
  },
  {
    id: 'country',
    ask: () => 'Anywhere in particular? I have courses in the UK, Ireland and New Zealand so far.',
    chips: () => [
      { label: 'United Kingdom', value: 'GB' }, { label: 'Ireland', value: 'IE' },
      { label: 'New Zealand', value: 'NZ' },
      { label: 'Anywhere', value: 'skip', tone: 'skip' },
    ],
    apply: (answer) => {
      if (isSkip(answer) || answer.toLowerCase().includes('anywhere')) return { countries: [] }
      const lower = answer.toLowerCase()
      // People type the country's name, not its code. "uk" as a bare substring
      // also matches nothing useful — "United Kingdom" does not contain it.
      const uk = ['united kingdom', 'kingdom', 'britain', 'british', 'england', 'scotland', 'wales', 'london']
      const codes = [
        ...(/\buk\b|\bgb\b/.test(lower) || uk.some((word) => lower.includes(word)) ? ['GB'] : []),
        ...(/\bie\b/.test(lower) || lower.includes('ireland') || lower.includes('irish') || lower.includes('dublin') ? ['IE'] : []),
        ...(/\bnz\b/.test(lower) || lower.includes('zealand') || lower.includes('auckland') ? ['NZ'] : []),
      ]
      return codes.length ? { countries: codes } : null
    },
    next: 'grades',
  },
  {
    id: 'grades',
    ask: ({ state }) => state.profile.level === 'Undergraduate'
      ? 'How many UCAS points do you have, or expect?'
      : 'What did you get in your last degree?',
    chips: ({ state }) => state.profile.level === 'Undergraduate'
      ? [{ label: '96' }, { label: '112' }, { label: '128' }, { label: 'Not sure yet', value: 'skip', tone: 'skip' }]
      : [
        { label: 'First' }, { label: '2:1' }, { label: '2:2' },
        { label: 'Not sure yet', value: 'skip', tone: 'skip' },
      ],
    apply: (answer, { state }) => {
      if (isSkip(answer)) return { classification: null, ucasPoints: null }
      const lower = answer.toLowerCase()
      if (lower.includes('first') || lower.includes('1st')) return { classification: 'first' }
      if (lower.includes('2:1') || lower.includes('2.1') || lower.includes('upper')) return { classification: '2:1' }
      if (lower.includes('2:2') || lower.includes('2.2') || lower.includes('lower')) return { classification: '2:2' }
      if (lower.includes('third')) return { classification: 'third' }
      const points = number(answer)
      if (points != null && state.profile.level === 'Undergraduate') return { ucasPoints: points }
      return null
    },
    next: 'english',
  },
  {
    id: 'english',
    ask: () => 'What is your IELTS overall, if you have taken it?',
    chips: () => [
      { label: '5.5' }, { label: '6.0' }, { label: '6.5' }, { label: '7.0' },
      { label: 'Not taken it yet', value: 'skip', tone: 'skip' },
    ],
    apply: (answer) => {
      if (isSkip(answer)) return { ieltsOverall: null }
      const score = number(answer)
      return score != null && score >= 3 && score <= 9 ? { ieltsOverall: score, ieltsLowest: score } : null
    },
    next: 'budget',
  },
  {
    id: 'budget',
    ask: () => 'Roughly what could you pay in tuition each year?',
    chips: () => [
      { label: 'Under £15,000', value: '15000' },
      { label: 'Up to £20,000', value: '20000' },
      { label: 'Up to £25,000', value: '25000' },
      { label: 'Not worked out yet', value: 'skip', tone: 'skip' },
    ],
    apply: (answer) => {
      if (isSkip(answer)) return { budget: null }
      const amount = number(answer)
      return amount != null ? { budget: amount } : null
    },
    next: 'intake',
  },
  {
    id: 'intake',
    ask: () => 'When would you want to start?',
    chips: () => [
      { label: 'September' }, { label: 'January' }, { label: 'May' },
      { label: 'Whenever', value: 'skip', tone: 'skip' },
    ],
    apply: (answer) => {
      if (isSkip(answer)) return { intake: null }
      const month = ['January', 'May', 'September'].find((item) => answer.toLowerCase().includes(item.toLowerCase()))
      return month ? { intake: month } : null
    },
    next: 'results',
  },
]

/** The application phase: three questions only the student can answer, then a
    pack they can work from. Nothing here is guessed on their behalf. */
const APPLY_STEPS: Step[] = [
  {
    id: 'details',
    ask: ({ state }) => state.profile.name
      ? `And your full name is ${state.profile.name}? Universities want it exactly as it appears on your passport.`
      : 'First, what name should go on the application? Exactly as it appears on your passport.',
    chips: ({ state }) => state.profile.name
      ? [{ label: 'That is right', value: state.profile.name }, { label: 'Change it', value: 'skip', tone: 'skip' }]
      : [{ label: 'Skip for now', value: 'skip', tone: 'skip' }],
    apply: (answer) => isSkip(answer) ? { name: null } : { name: answer.trim() },
    next: 'referee',
  },
  {
    id: 'referee',
    ask: () => 'Who will write your reference? A name and email is enough — I will draft the request so you can send it today rather than in three weeks.',
    chips: () => [{ label: 'I do not know yet', value: 'skip', tone: 'skip' }],
    apply: (answer) => {
      if (isSkip(answer)) return { referee: null }
      const email = answer.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? ''
      const name = answer.replace(email, '').replace(/[,;]/g, ' ').trim()
      return name || email ? { referee: { name: name || 'Your referee', email } } : null
    },
    next: 'why',
  },
  {
    id: 'why',
    ask: ({ state, courses }) => {
      const course = courses.find((item) => item.id === state.applyingTo)
      return `Good. Three questions and I can put the draft together. First — why do you want to study ${course?.title ?? 'this'}? One honest reason is plenty.`
    },
    chips: () => [{ label: 'Skip for now', value: 'skip', tone: 'skip' }],
    apply: (answer) => isSkip(answer) ? { answer: null } : { answer: { id: 'why', text: answer } },
    next: 'experience',
  },
  {
    id: 'experience',
    ask: () => 'What have you actually done that is relevant? A project, a job, a module you did well in. One concrete thing beats three vague ones.',
    chips: () => [{ label: 'Skip for now', value: 'skip', tone: 'skip' }],
    apply: (answer) => isSkip(answer) ? { answer: null } : { answer: { id: 'experience', text: answer } },
    next: 'goal',
  },
  {
    id: 'goal',
    ask: () => 'Last one. What do you want to do afterwards? A direction is enough.',
    chips: () => [{ label: 'Skip for now', value: 'skip', tone: 'skip' }],
    apply: (answer) => isSkip(answer) ? { answer: null } : { answer: { id: 'goal', text: answer } },
    next: 'pack',
  },
]

STEPS.push(...APPLY_STEPS)

export function stepById(id: StepId): Step | undefined {
  return STEPS.find((step) => step.id === id)
}
