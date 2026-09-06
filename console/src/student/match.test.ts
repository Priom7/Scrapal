import { describe, expect, it } from 'vitest'
import type { GalleryCourse } from '../api'
import { matchCourse, matchPercent, matchRank } from './match'
import { EMPTY_PROFILE, type StudentProfile } from './profile'

function course(overrides: Partial<GalleryCourse> = {}): GalleryCourse {
  return {
    id: 'rec-test', institution_id: 'inst-test',
    institution: { id: 'inst-test', name: 'Test University', country_code: 'GB', city: 'Leeds', logo_url: null, banner_url: null, brand_color: null },
    title: 'Data Science', award: 'MSc', level: 'Postgraduate',
    campuses: [], study_modes: ['Full-time'], durations: ['1 year'],
    intake_months: ['September'],
    fees: [{ residency: 'international', amount: 20000, currency: 'GBP' }],
    entry_requirements: 'A second-class honours degree (2:1) in a related subject.',
    english_requirements: 'IELTS 6.5 overall with no component below 6.0.',
    modules: [], scholarships: [], course_content: null, careers: null,
    source_url: 'https://example.ac.uk/course', coverage: 0.9, evidence: {},
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

const profile = (overrides: Partial<StudentProfile> = {}): StudentProfile => ({ ...EMPTY_PROFILE, ...overrides })

describe('explainable matching', () => {
  it('says nothing at all without a profile, rather than guessing', () => {
    const result = matchCourse(course(), profile())
    expect(result.unprofiled).toBe(true)
    expect(result.checks.every((check) => check.verdict === 'unknown')).toBe(true)
  })

  it('names the exact IELTS shortfall, band and all', () => {
    const result = matchCourse(course(), profile({ ieltsOverall: 6, ieltsLowest: 5.5 }))
    const english = result.checks.find((check) => check.id === 'english')!
    expect(english.verdict).toBe('close')
    expect(english.gap).toContain('your overall is 6, 0.5 below the 6.5')
    expect(english.gap).toContain('your lowest band is 5.5, 0.5 below the 6')
  })

  // A student who clears the overall but misses one band is the case a single
  // number would hide, and it is exactly the case the spec calls out.
  it('flags a failing band even when the overall score passes', () => {
    const result = matchCourse(course(), profile({ ieltsOverall: 7, ieltsLowest: 5.5 }))
    const english = result.checks.find((check) => check.id === 'english')!
    expect(english.gap).toContain('lowest band')
    expect(english.gap).not.toContain('your overall')
  })

  it('compares degree classifications in the right order', () => {
    const asks21 = course()
    expect(matchCourse(asks21, profile({ classification: 'first' })).checks[0].verdict).toBe('met')
    expect(matchCourse(asks21, profile({ classification: '2:1' })).checks[0].verdict).toBe('met')
    expect(matchCourse(asks21, profile({ classification: '2:2' })).checks[0].verdict).toBe('close')
    expect(matchCourse(asks21, profile({ classification: 'third' })).checks[0].verdict).toBe('unmet')
  })

  it('asks for UCAS points when that is what the course wants', () => {
    const undergrad = course({ entry_requirements: '112 UCAS points including a relevant A-level.' })
    // A degree classification is the wrong thing to ask a school leaver for.
    const withDegree = matchCourse(undergrad, profile({ classification: '2:1' })).checks[0]
    expect(withDegree.verdict).toBe('unknown')
    expect(withDegree.gap).toBe('Add your UCAS points to check this.')

    const withPoints = matchCourse(undergrad, profile({ ucasPoints: 96 })).checks[0]
    expect(withPoints.verdict).toBe('close')
    expect(withPoints.gap).toBe('You are 16 UCAS points short of 112.')
  })

  it('names the amount a course is over budget', () => {
    const budget = matchCourse(course(), profile({ budget: 18000 })).checks.find((c) => c.id === 'budget')!
    expect(budget.verdict).toBe('unmet')
    expect(budget.gap).toBe('£2,000 above the £18,000 you set.')
  })

  it('says which months a course actually starts when the intake is wrong', () => {
    const intake = matchCourse(course({ intake_months: ['January', 'May'] }), profile({ intake: 'September' }))
      .checks.find((c) => c.id === 'intake')!
    expect(intake.verdict).toBe('unmet')
    expect(intake.gap).toBe('No September intake. This course starts in January or May.')
  })

  it('distinguishes a missing publication from a missing profile answer', () => {
    const silent = matchCourse(course({ english_requirements: null }), profile({ ieltsOverall: 7 }))
      .checks.find((c) => c.id === 'english')!
    expect(silent.gap).toBe('The university has not published this.')
  })

  it('ranks a fully checked pass above a partly unknown one', () => {
    const complete = matchCourse(course(), profile({ classification: '2:1', ieltsOverall: 7, ieltsLowest: 6.5, budget: 25000, intake: 'September' }))
    const partial = matchCourse(course({ english_requirements: null }), profile({ classification: '2:1', budget: 25000, intake: 'September' }))
    expect(matchRank(complete)).toBeLessThan(matchRank(partial))
  })
})

describe('the match figure', () => {
  const asks21 = () => course()

  // A number nobody could compute is worse than no number.
  it('has no figure when nothing could be checked', () => {
    expect(matchPercent(matchCourse(asks21(), profile()))).toBeNull()
  })

  it('reaches 100 only when everything checked is met', () => {
    const full = matchCourse(asks21(), profile({
      classification: '2:1', ieltsOverall: 7, ieltsLowest: 6.5, budget: 25000, intake: 'September',
    }))
    expect(matchPercent(full)).toBe(100)
  })

  // Being half a band short is not the same as being unable to apply.
  it('counts a near miss as half, not zero', () => {
    const close = matchCourse(asks21(), profile({
      classification: '2:2', ieltsOverall: 7, ieltsLowest: 6.5, budget: 25000, intake: 'September',
    }))
    expect(matchPercent(close)).toBe(88)
  })

  it('still names the gap alongside the figure', () => {
    const result = matchCourse(asks21(), profile({ classification: '2:2' }))
    expect(matchPercent(result)).not.toBeNull()
    expect(result.checks.find((check) => check.id === 'degree')!.gap).toContain('asks for')
  })
})
