// What a course costs over its whole length, itemised.
//
// Cost is a list of typed lines rather than a fixed set of fields, so adding
// dependants, an accommodation deposit or a second visa application later is a
// new entry rather than a change to the model.
import type { GalleryCourse } from '../api'
import {
  healthSurchargePerYear, livingCostPerMonth, visaFee, type ReferenceFigure,
} from './reference'

export type CostLine = {
  id: string
  label: string
  /** Total across the whole course, already multiplied out. */
  amount: number
  detail: string
  /** 'course' means it was read from the university's page and can be traced;
      'reference' means it came from the reference tables and cannot. */
  origin: 'course' | 'reference'
  source?: string
  checked?: string
}

export type CostModel = {
  lines: CostLine[]
  total: number
  years: number
  monthsOfLiving: number
  /** True when the university never published a fee, so the total is partial. */
  feeMissing: boolean
}

/** "4 years with placement" → 4. "2 years part-time" → 2. */
export function courseYears(course: GalleryCourse): number {
  for (const duration of course.durations) {
    const found = duration.match(/(\d+(?:\.\d+)?)\s*year/i)
    if (found) return Number(found[1])
  }
  return 1
}

function internationalFee(course: GalleryCourse): number | null {
  const international = course.fees.find((fee) => fee.residency === 'international')?.amount
  if (international != null) return international
  const amounts = course.fees.map((fee) => fee.amount).filter((value): value is number => value != null)
  return amounts.length ? Math.max(...amounts) : null
}

function referenceLine(
  id: string,
  label: string,
  figure: ReferenceFigure,
  multiplier: number,
  detail: string,
): CostLine {
  return {
    id,
    label,
    amount: Math.round(figure.amount * multiplier),
    detail,
    origin: 'reference',
    source: figure.source,
    checked: figure.checked,
  }
}

export function modelCost(course: GalleryCourse, options?: { flights?: number }): CostModel {
  const years = courseYears(course)
  // Living cost is charged for the study months, not the whole calendar span.
  const monthsOfLiving = Math.round(years * 12)
  const fee = internationalFee(course)
  const city = course.institution.city
  const living = livingCostPerMonth(city)

  const lines: CostLine[] = []

  if (fee != null) {
    lines.push({
      id: 'tuition',
      label: 'Tuition',
      amount: fee * years,
      detail: years === 1
        ? `£${fee.toLocaleString('en-GB')} for one year`
        : `£${fee.toLocaleString('en-GB')} a year × ${years} years`,
      origin: 'course',
    })
  }

  lines.push(referenceLine(
    'living', 'Living costs', living, monthsOfLiving,
    `£${living.amount.toLocaleString('en-GB')} a month in ${city ?? 'the UK'} × ${monthsOfLiving} months`,
  ))
  lines.push(referenceLine('visa', 'Visa application', visaFee(), 1, 'One application, from outside the country'))
  lines.push(referenceLine(
    'health', 'Health surcharge', healthSurchargePerYear(), years,
    `£${healthSurchargePerYear().amount} a year × ${years} years`,
  ))

  if (options?.flights) {
    lines.push({
      id: 'flights',
      label: 'Flights',
      amount: options.flights,
      detail: 'What you entered',
      origin: 'reference',
      source: 'Your estimate',
    })
  }

  return {
    lines,
    total: lines.reduce((sum, line) => sum + line.amount, 0),
    years,
    monthsOfLiving,
    feeMissing: fee == null,
  }
}
