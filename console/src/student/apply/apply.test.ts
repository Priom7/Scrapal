import { describe, expect, it } from 'vitest'
import type { GalleryCourse } from '../../api'
import { EMPTY_PROFILE } from '../profile'
import { expiryWarning, requiredDocuments } from './documents'
import { draftStatement, statementText } from './statement'

function course(overrides: Partial<GalleryCourse> = {}): GalleryCourse {
  return {
    id: 'rec-ds', institution_id: 'inst-1',
    institution: { id: 'inst-1', name: 'Coventry University', country_code: 'GB', city: 'Coventry', logo_url: null, banner_url: null, brand_color: null },
    title: 'Data Science', award: 'MSc', level: 'Postgraduate',
    campuses: [], study_modes: ['Full-time'], durations: ['1 year'], intake_months: ['September'],
    fees: [{ residency: 'international', amount: 18000, currency: 'GBP' }],
    entry_requirements: 'A second-class honours degree (2:1).',
    english_requirements: 'IELTS 6.5 overall with no component below 6.0.',
    modules: ['Machine Learning', 'Statistical Inference', 'Research Methods'],
    scholarships: [], course_content: null, careers: null,
    source_url: 'https://example.ac.uk', coverage: 0.9, evidence: {},
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

describe('what a university asks for', () => {
  it('adds the English test only when the course published a requirement', () => {
    expect(requiredDocuments(course()).some((doc) => doc.id === 'english')).toBe(true)
    expect(requiredDocuments(course({ english_requirements: null })).some((doc) => doc.id === 'english')).toBe(false)
  })

  it('quotes the course’s own wording and marks it as read from the page', () => {
    const english = requiredDocuments(course()).find((doc) => doc.id === 'english')!
    expect(english.why).toContain('IELTS 6.5')
    expect(english.fromCourse).toBe(true)
  })

  // A passport expiring mid-course is a routine visa refusal.
  it('warns when a passport expires before the course ends', () => {
    const ends = new Date('2027-09-01')
    expect(expiryWarning('2027-01-01', ends)).toContain('expires before your course')
    expect(expiryWarning('2030-01-01', ends)).toBeNull()
    expect(expiryWarning(null, ends)).toBeNull()
  })
})

describe('the personal statement scaffold', () => {
  const profile = { ...EMPTY_PROFILE, classification: '2:1' as const, ieltsOverall: 6.5 }

  // The line the whole feature depends on.
  it('invents nothing, and marks every gap it leaves', () => {
    const draft = draftStatement(course(), EMPTY_PROFILE, {})
    expect(draft.gaps).toBeGreaterThan(0)
    const text = statementText(draft)
    // Nothing asserted about the student that they did not say.
    expect(text).not.toMatch(/I have always been passionate/i)
    expect(text).toContain('[')
  })

  it('uses the student’s own words when they gave them', () => {
    const draft = draftStatement(course(), profile, {
      why: 'I want to work with health data',
      experience: 'I built a model predicting hospital readmissions',
      goal: 'I want to work in the NHS',
    })
    const text = statementText(draft)
    expect(text).toContain('I want to work with health data')
    expect(text).toContain('hospital readmissions')
    expect(text).toContain('upper second')
    expect(text).toContain('IELTS 6.5')
  })

  it('quotes what the university published rather than praising it generically', () => {
    const text = statementText(draftStatement(course(), profile, {}))
    expect(text).toContain('Machine Learning')
    expect(text).toContain('Statistical Inference')
  })

  it('tells the student not to fabricate', () => {
    const text = statementText(draftStatement(course(), EMPTY_PROFILE, {}))
    expect(text.toLowerCase()).toContain('universities check')
  })

  it('counts remaining gaps down as answers arrive', () => {
    const empty = draftStatement(course(), EMPTY_PROFILE, {})
    const partial = draftStatement(course(), profile, { why: 'Health data interests me' })
    expect(partial.gaps).toBeLessThan(empty.gaps)
  })
})
