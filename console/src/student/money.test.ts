import { describe, expect, it } from 'vitest'
import type { GalleryCourse } from '../api'
import { courseYears, modelCost } from './costs'
import { currencySwing, fundingPosition, maintenanceCheck, permittedWorkIncome } from './funding'

function course(overrides: Partial<GalleryCourse> = {}): GalleryCourse {
  return {
    id: 'rec-test', institution_id: 'inst-test',
    institution: { id: 'inst-test', name: 'Test University', country_code: 'GB', city: 'Coventry', logo_url: null, banner_url: null, brand_color: null },
    title: 'Data Science', award: 'MSc', level: 'Postgraduate',
    campuses: [], study_modes: ['Full-time'], durations: ['1 year'], intake_months: ['September'],
    fees: [{ residency: 'international', amount: 20000, currency: 'GBP' }],
    entry_requirements: null, english_requirements: null,
    modules: [], scholarships: [], course_content: null, careers: null,
    source_url: 'https://example.ac.uk/course', coverage: 0.9, evidence: {},
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

describe('cost model', () => {
  it('reads the length out of the published duration', () => {
    expect(courseYears(course())).toBe(1)
    expect(courseYears(course({ durations: ['3 years'] }))).toBe(3)
    expect(courseYears(course({ durations: ['4 years with placement'] }))).toBe(4)
    expect(courseYears(course({ durations: ['2 years part-time'] }))).toBe(2)
  })

  // Budgeting for year one is the mistake this whole model exists to prevent.
  it('charges tuition and living for every year of the course', () => {
    const model = modelCost(course({ durations: ['3 years'] }))
    const tuition = model.lines.find((line) => line.id === 'tuition')!
    expect(tuition.amount).toBe(60000)
    expect(model.monthsOfLiving).toBe(36)
    expect(model.lines.find((line) => line.id === 'living')!.amount).toBe(900 * 36)
  })

  it('separates figures read from the university from reference figures', () => {
    const model = modelCost(course())
    expect(model.lines.find((line) => line.id === 'tuition')!.origin).toBe('course')
    const living = model.lines.find((line) => line.id === 'living')!
    expect(living.origin).toBe('reference')
    // A reference figure has to be able to say where it came from and when.
    expect(living.source).toBeTruthy()
    expect(living.checked).toBeTruthy()
  })

  it('says the total is partial when no fee was published', () => {
    const model = modelCost(course({ fees: [] }))
    expect(model.feeMissing).toBe(true)
    expect(model.lines.some((line) => line.id === 'tuition')).toBe(false)
  })
})

describe('funding position', () => {
  it('names the gap rather than scoring affordability', () => {
    const position = fundingPosition([
      { id: 'a', label: 'Savings', amount: 12000, countsForVisa: true },
      { id: 'b', label: 'Family', amount: 9000, countsForVisa: true },
    ], 25000)
    expect(position.funded).toBe(21000)
    expect(position.gap).toBe(4000)
    expect(position.covered).toBe(false)
  })

  it('reports permitted work income on its own', () => {
    const income = permittedWorkIncome()
    expect(income.hoursPerWeek).toBe(20)
    expect(income.perYear).toBe(Math.round(20 * 30 * 12.21))
  })
})

describe('visa maintenance', () => {
  it('caps the living element at nine months however long the course', () => {
    const check = maintenanceCheck(course({ durations: ['3 years'] }), 0)
    if (!check.applies) throw new Error('expected the check to apply')
    expect(check.months).toBe(9)
    expect(check.livingElement).toBe(1136 * 9)
  })

  it('uses the higher London rate for a London campus', () => {
    const london = maintenanceCheck(course({
      institution: { ...course().institution, city: 'London' },
    }), 0)
    if (!london.applies) throw new Error('expected the check to apply')
    expect(london.livingElement).toBe(1483 * 9)
  })

  it('subtracts tuition already paid from what must be held', () => {
    const check = maintenanceCheck(course(), 40000, 5000)
    if (!check.applies) throw new Error('expected the check to apply')
    expect(check.tuitionElement).toBe(15000)
    expect(check.required).toBe(1136 * 9 + 15000)
    expect(check.passes).toBe(true)
  })

  it('declines to guess for a country whose rules are not modelled', () => {
    const check = maintenanceCheck(course({
      institution: { ...course().institution, country_code: 'NZ' },
    }), 50000)
    expect(check.applies).toBe(false)
  })
})

describe('currency exposure', () => {
  it('shows what a move against the student costs them', () => {
    const swing = currencySwing(30000, 150)
    expect(swing.now).toBe(4_500_000)
    expect(swing.worse).toBe(4_950_000)
    expect(swing.better).toBe(4_050_000)
  })
})
