// What a student has against what a course costs, and whether a visa officer
// will accept it. Two different questions with two different answers, and
// conflating them is the mistake that gets applications refused.
import type { GalleryCourse } from '../api'
import { courseYears } from './costs'
import { hasVisaRules, maintenanceRules, workRights } from './reference'

export type FundingSource = {
  id: string
  label: string
  amount: number
  /** Money a visa officer will count as held funds. Earnings never are. */
  countsForVisa: boolean
}

export type FundingPosition = {
  funded: number
  total: number
  /** Positive means short. */
  gap: number
  covered: boolean
}

export type WorkIncome = {
  perYear: number
  hoursPerWeek: number
  weeks: number
  wage: number
}

export type MaintenanceCheck =
  | { applies: false; reason: string }
  | {
    applies: true
    required: number
    livingElement: number
    tuitionElement: number
    months: number
    held: number
    shortfall: number
    passes: boolean
    heldForDays: number
    source: string
    checked: string
  }

export function fundingPosition(sources: FundingSource[], total: number): FundingPosition {
  const funded = sources.reduce((sum, source) => sum + (Number.isFinite(source.amount) ? source.amount : 0), 0)
  const gap = Math.max(0, Math.round(total - funded))
  return { funded, total, gap, covered: gap === 0 }
}

/** What permitted term-time work earns. Deliberately reported on its own,
    because it may not be counted toward the maintenance requirement. */
export function permittedWorkIncome(): WorkIncome {
  const rules = workRights()
  return {
    perYear: Math.round(rules.termTimeHoursPerWeek * rules.termWeeksPerYear * rules.hourlyWage),
    hoursPerWeek: rules.termTimeHoursPerWeek,
    weeks: rules.termWeeksPerYear,
    wage: rules.hourlyWage,
  }
}

/** The money a UK Student visa requires an applicant to hold: the first year's
    outstanding tuition, plus living costs capped at nine months. */
export function maintenanceCheck(
  course: GalleryCourse,
  heldFunds: number | null,
  tuitionPaid = 0,
): MaintenanceCheck {
  const country = course.institution.country_code
  if (!hasVisaRules(country)) {
    return {
      applies: false,
      reason: `Scrapal does not model the visa money rules for ${country ?? 'this country'} yet.`,
    }
  }

  const rules = maintenanceRules()
  const inLondon = course.institution.city === 'London'
  const months = Math.min(rules.maxMonths, Math.round(courseYears(course) * 12))
  const livingElement = (inLondon ? rules.london : rules.elsewhere) * months

  const fee = course.fees.find((item) => item.residency === 'international')?.amount ?? 0
  const tuitionElement = Math.max(0, fee - tuitionPaid)
  const required = livingElement + tuitionElement
  const held = heldFunds ?? 0

  return {
    applies: true,
    required,
    livingElement,
    tuitionElement,
    months,
    held,
    shortfall: Math.max(0, required - held),
    passes: held >= required,
    heldForDays: rules.heldForDays,
    source: rules.source,
    checked: rules.checked,
  }
}

/** What the total becomes if the exchange rate moves against the student. */
export function currencySwing(totalGbp: number, rate: number, movePercent = 10) {
  const atRate = (multiplier: number) => Math.round(totalGbp * rate * multiplier)
  return {
    now: atRate(1),
    worse: atRate(1 + movePercent / 100),
    better: atRate(1 - movePercent / 100),
    movePercent,
  }
}
