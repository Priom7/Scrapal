import { describe, expect, it } from 'vitest'
import type { GalleryCourse } from '../../api'
import { answer, initialState, resume, start } from './engine'
import type { PlannerState, StepContext } from './types'

function course(overrides: Partial<GalleryCourse> = {}): GalleryCourse {
  return {
    id: 'rec-ds', institution_id: 'inst-1',
    institution: { id: 'inst-1', name: 'Coventry University', country_code: 'GB', city: 'Coventry', logo_url: null, banner_url: null, brand_color: null },
    title: 'Data Science', award: 'MSc', level: 'Postgraduate',
    campuses: [], study_modes: ['Full-time'], durations: ['1 year'], intake_months: ['September'],
    fees: [{ residency: 'international', amount: 18000, currency: 'GBP' }],
    entry_requirements: 'A second-class honours degree (2:1).',
    english_requirements: 'IELTS 6.5 overall with no component below 6.0.',
    modules: [], scholarships: [], course_content: null, careers: null,
    source_url: 'https://example.ac.uk', coverage: 0.9, evidence: {},
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

const courses = [course(), course({ id: 'rec-cy', title: 'Cyber Security' })]
const ctx = (state: PlannerState): StepContext => ({ state, courses })

function say(state: PlannerState, text: string): PlannerState {
  return answer(state, text, ctx(state))
}

const opening = () => start(ctx(initialState()))

describe('the planner opens the conversation', () => {
  // A blank chat box asks the student to already know what to ask.
  it('speaks first, and offers something to tap', () => {
    const state = opening()
    expect(state.messages[0].from).toBe('scrapal')
    expect(state.messages[0].chips?.length).toBeGreaterThan(0)
  })
})

describe('answering builds the plan while talking', () => {
  it('records what was said into the profile the rest of the app reads', () => {
    let state = say(opening(), 'Let’s start')
    state = say(state, 'Data Science')
    state = say(state, 'Master’s')
    state = say(state, 'United Kingdom')
    state = say(state, '2:1')
    state = say(state, '6.5')
    state = say(state, '20000')
    state = say(state, 'September')

    expect(state.subject).toBe('Data Science')
    expect(state.profile.level).toBe('Postgraduate')
    expect(state.profile.countries).toEqual(['GB'])
    expect(state.profile.classification).toBe('2:1')
    expect(state.profile.ieltsOverall).toBe(6.5)
    expect(state.profile.budget).toBe(20000)
    expect(state.profile.intake).toBe('September')
  })

  it('shows courses once it knows enough, rather than asking forever', () => {
    let state = opening()
    for (const said of ['Let’s start', 'Data Science', 'Master’s', 'United Kingdom', '2:1', '6.5', '20000', 'September']) {
      state = say(state, said)
    }
    expect(state.step).toBe('results')
    const card = state.messages.find((message) => message.card?.kind === 'courses')
    expect(card).toBeTruthy()
  })

  it('accepts free text, not only the chips', () => {
    let state = say(opening(), 'Let’s start')
    state = say(state, 'i want to do data science')
    state = say(state, 'a masters please')
    expect(state.profile.level).toBe('Postgraduate')
  })

  it('lets the student skip anything without being nagged', () => {
    let state = say(opening(), 'Let’s start')
    state = say(state, 'skip')
    expect(state.subject).toBeNull()
    expect(state.messages.some((m) => m.text?.includes('come back to that'))).toBe(true)
  })

  // Guessing at an answer it did not understand is how these things go wrong.
  it('says plainly when it did not follow, and stays on the question', () => {
    let state = say(opening(), 'Let’s start')
    state = say(state, 'Data Science')
    const before = state.step
    state = say(state, 'purple')
    expect(state.step).toBe(before)
    expect(state.messages.at(-1)?.text).toContain('did not follow')
    expect(state.messages.at(-1)?.chips?.length).toBeGreaterThan(0)
  })

  it('can jump straight to courses for someone who just wants to look', () => {
    const state = say(opening(), 'Just show me some courses')
    expect(state.step).toBe('results')
  })

  it('starts over without losing what it already knows how to ask', () => {
    let state = say(opening(), 'Let’s start')
    state = say(state, 'Data Science')
    state = say(state, 'restart')
    expect(state.step).toBe('subject')
    expect(state.messages.at(-1)?.chips?.length).toBeGreaterThan(0)
  })
})

describe('what the student sees themselves having said', () => {
  // Echoing "GB" or "postgraduate" back at someone is the exact robotic tell
  // this interface exists to avoid.
  it('echoes the words on the chip, not the value behind it', () => {
    const state = answer(opening(), 'GB', ctx(opening()), 'United Kingdom')
    const said = state.messages.find((message) => message.from === 'student')
    expect(said?.text).toBe('United Kingdom')
  })

  it('still parses the value, not the label', () => {
    let state = say(opening(), 'Let’s start')
    state = say(state, 'Data Science')
    state = answer(state, 'postgraduate', ctx(state), 'Master’s')
    expect(state.profile.level).toBe('Postgraduate')
    expect(state.messages.some((m) => m.from === 'student' && m.text === 'Master’s')).toBe(true)
  })
})

describe('interrupting and coming back', () => {
  it('keeps the student’s place when they ask something mid-flow', () => {
    let state = say(opening(), 'Let’s start')
    state = say(state, 'Data Science')
    const wasAt = state.step
    state = say(state, 'what does IELTS 6.5 mean?')
    expect(state.step).toBe('asking')
    expect(state.resumeStack).toEqual([wasAt])
    // It answers, and offers the way back rather than stranding them.
    expect(state.messages.some((m) => m.card?.kind === 'answer')).toBe(true)
    expect(state.messages.at(-1)?.chips?.some((chip) => chip.value === 'resume')).toBe(true)
  })

  it('puts them back exactly where they were', () => {
    let state = say(opening(), 'Let’s start')
    state = say(state, 'Data Science')
    const wasAt = state.step
    state = say(state, 'how much does a visa cost?')
    state = say(state, 'resume')
    expect(state.step).toBe(wasAt)
    expect(state.resumeStack).toEqual([])
  })

  it('allows a second question without losing the place either', () => {
    let state = say(opening(), 'Let’s start')
    state = say(state, 'Data Science')
    state = say(state, 'what is a CAS?')
    state = say(state, 'and what about the health surcharge?')
    expect(state.step).toBe('asking')
    expect(state.resumeStack.length).toBe(1)
  })

  it('recognises a question without a question mark', () => {
    let state = say(opening(), 'Let’s start')
    state = say(state, 'Data Science')
    state = say(state, 'can I work while studying')
    expect(state.step).toBe('asking')
  })

  // An answer to the current question must not be mistaken for an aside.
  it('does not treat a plain answer as a question', () => {
    let state = say(opening(), 'Let’s start')
    state = say(state, 'Data Science')
    expect(state.step).not.toBe('asking')
  })
})

describe('picking a draft up later', () => {
  it('lists what is on the go when asked', () => {
    const state = say(opening(), 'show me my applications')
    expect(state.step).toBe('drafts')
    expect(state.messages.some((m) => m.card?.kind === 'drafts')).toBe(true)
  })
})

describe('coming back after closing the tab', () => {
  it('greets a returning student with what it remembers', () => {
    let state = say(opening(), 'Let’s start')
    state = say(state, 'Data Science')
    const back = resume(state, 'yesterday', ctx(state))
    const last = back.messages.at(-1)
    expect(last?.text).toContain('Welcome back')
    expect(last?.text).toContain('yesterday')
    // The thread it already had is still there, not replayed.
    expect(back.messages.length).toBe(state.messages.length + 1)
  })

  it('offers to carry on rather than starting over', () => {
    const state = say(opening(), 'Let’s start')
    const chips = resume(state, 'just now', ctx(state)).messages.at(-1)?.chips ?? []
    expect(chips.some((chip) => /carry on/i.test(chip.label))).toBe(true)
  })
})

describe('where an application stands', () => {
  it('records that it was sent, in the student’s own words', () => {
    let state = say(opening(), 'Let’s start')
    state = { ...state, applyingTo: 'rec-ds' }
    state = say(state, 'I have sent this application')
    expect(state.messages.at(-1)?.text).toContain('marked as sent')
  })

  it('does not call an unsuccessful application a rejection', () => {
    let state = say(opening(), 'Let’s start')
    state = { ...state, applyingTo: 'rec-ds' }
    state = say(state, 'they said no')
    const reply = state.messages.at(-1)?.text ?? ''
    expect(reply).toContain('unsuccessful')
    expect(reply.toLowerCase()).not.toContain('rejected')
    // And it does not leave them there.
    expect(reply).toContain('others on your list')
  })
})

describe('returning more than once', () => {
  // Every visit used to append another greeting to the saved thread.
  it('replaces the previous welcome rather than stacking another', () => {
    const state = say(opening(), 'Let’s start')
    const first = resume(state, 'an hour ago', ctx(state))
    const second = resume(first, 'just now', ctx(first))
    const greetings = second.messages.filter((message) => message.kind === 'resume')
    expect(greetings.length).toBe(1)
    expect(greetings[0].text).toContain('just now')
    expect(second.messages.length).toBe(first.messages.length)
  })
})
