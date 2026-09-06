// Reference figures: living costs, visa charges and the money rules a visa
// application is judged against. None of this is crawled — it is government and
// city data the product does not hold — so every figure carries its own source
// and the date it was checked, and the UI renders it differently from a figure
// read off a university page. Hiding that seam would quietly break the promise
// the rest of the product rests on.
//
// Everything is reached through the accessors at the bottom rather than read
// directly, so moving this to an API later changes this file and nothing else.

export type ReferenceFigure = {
  amount: number
  currency: 'GBP'
  source: string
  checked: string
}

/** Monthly living cost by campus city: rent, food, transport, essentials. */
const LIVING: Record<string, ReferenceFigure> = {
  London: { amount: 1500, currency: 'GBP', source: 'Student living cost surveys', checked: '2026-06' },
  Brighton: { amount: 1150, currency: 'GBP', source: 'Student living cost surveys', checked: '2026-06' },
  Coventry: { amount: 900, currency: 'GBP', source: 'Student living cost surveys', checked: '2026-06' },
  Newcastle: { amount: 880, currency: 'GBP', source: 'Student living cost surveys', checked: '2026-06' },
  Swansea: { amount: 820, currency: 'GBP', source: 'Student living cost surveys', checked: '2026-06' },
  Dublin: { amount: 1400, currency: 'GBP', source: 'Student living cost surveys', checked: '2026-06' },
  Auckland: { amount: 1250, currency: 'GBP', source: 'Student living cost surveys', checked: '2026-06' },
}

const FALLBACK_LIVING: ReferenceFigure = {
  amount: 1050, currency: 'GBP', source: 'National student average', checked: '2026-06',
}

const VISA_FEE: ReferenceFigure = {
  amount: 524, currency: 'GBP', source: 'UK Student visa, applying from outside the UK', checked: '2026-06',
}

const HEALTH_SURCHARGE_PER_YEAR: ReferenceFigure = {
  amount: 776, currency: 'GBP', source: 'UK immigration health surcharge, student rate', checked: '2026-06',
}

/** What a UK Student visa requires an applicant to hold, per month of study. */
const MAINTENANCE = {
  london: 1483,
  elsewhere: 1136,
  /** The rule caps the living-cost element at nine months however long the course. */
  maxMonths: 9,
  /** Funds must have been held for this many consecutive days. */
  heldForDays: 28,
  source: 'UK Student route maintenance requirement',
  checked: '2026-06',
}

const WORK_RIGHTS = {
  termTimeHoursPerWeek: 20,
  termWeeksPerYear: 30,
  hourlyWage: 12.21,
  source: 'UK Student route work conditions, National Living Wage',
  checked: '2026-06',
}

/** Countries whose visa money rules are modelled. Others get costs but no check. */
const MODELLED_COUNTRIES = new Set(['GB'])

export function livingCostPerMonth(city: string | null): ReferenceFigure {
  return (city && LIVING[city]) || FALLBACK_LIVING
}

export function visaFee(): ReferenceFigure {
  return VISA_FEE
}

export function healthSurchargePerYear(): ReferenceFigure {
  return HEALTH_SURCHARGE_PER_YEAR
}

export function maintenanceRules() {
  return MAINTENANCE
}

export function workRights() {
  return WORK_RIGHTS
}

export function hasVisaRules(countryCode: string | null): boolean {
  return Boolean(countryCode && MODELLED_COUNTRIES.has(countryCode))
}

/** Cities the reference table actually covers, for saying so honestly. */
export function knownCity(city: string | null): boolean {
  return Boolean(city && city in LIVING)
}
