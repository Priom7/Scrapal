// Explainable matching. The product spec is explicit that a match must never be
// a black-box number, so this returns one verdict per requirement with the
// shortfall named in the student's own terms — "your reading is 5.5, this
// course asks for 6.0" — and no overall score anywhere.
//
// Requirements arrive as the prose a university published, because that is what
// the crawler captured. Parsing it here is a stand-in: the real pipeline should
// extract these as typed fields so the gap can be computed without regexes.
import type { GalleryCourse } from '../api'
import type { StudentProfile } from './profile'

export type Verdict = 'met' | 'close' | 'unmet' | 'unknown'

export type RequirementCheck = {
  id: 'degree' | 'english' | 'budget' | 'intake'
  label: string
  verdict: Verdict
  /** What the course asks for, quoted plainly. */
  asks: string
  /** The shortfall, named. Empty when the requirement is met. */
  gap: string
  /** Compact confirmation for a met requirement, so a row that needs no
      attention takes one quiet line instead of repeating the figure. */
  short: string
}

export type CourseMatch = {
  checks: RequirementCheck[]
  met: number
  total: number
  /** Requirements nothing could be said about, either way. */
  unchecked: number
  /** True when the profile has nothing to check this course against. */
  unprofiled: boolean
}

/** UK honours classifications, ordered so they can be compared. */
const CLASSES = ['pass', 'third', '2:2', '2:1', 'first'] as const
export type Classification = (typeof CLASSES)[number]

export const CLASS_LABELS: Record<Classification, string> = {
  first: 'First-class honours',
  '2:1': 'Upper second (2:1)',
  '2:2': 'Lower second (2:2)',
  third: 'Third-class honours',
  pass: 'Pass or ordinary degree',
}

function rank(value: Classification): number {
  return CLASSES.indexOf(value)
}

function requiredClass(text: string | null): Classification | null {
  if (!text) return null
  const lower = text.toLowerCase()
  if (lower.includes('2:1') || lower.includes('upper second')) return '2:1'
  if (lower.includes('2:2') || lower.includes('lower second')) return '2:2'
  if (lower.includes('first-class') || lower.includes('first class')) return 'first'
  return null
}

function requiredUcas(text: string | null): number | null {
  const found = text?.match(/(\d{2,3})\s*UCAS/i)
  return found ? Number(found[1]) : null
}

/** "IELTS 6.5 overall with no component below 6.0" → { overall: 6.5, band: 6 } */
function requiredEnglish(text: string | null): { overall: number; band: number | null } | null {
  if (!text) return null
  const overall = text.match(/IELTS\s*(\d+(?:\.\d+)?)/i)
  if (!overall) return null
  const band = text.match(/below\s*(\d+(?:\.\d+)?)/i)
  return { overall: Number(overall[1]), band: band ? Number(band[1]) : null }
}

function money(amount: number): string {
  return `£${amount.toLocaleString('en-GB')}`
}

function lowestFee(course: GalleryCourse): number | null {
  const international = course.fees.find((fee) => fee.residency === 'international')?.amount
  if (international != null) return international
  const amounts = course.fees.map((fee) => fee.amount).filter((value): value is number => value != null)
  return amounts.length ? Math.min(...amounts) : null
}

function checkDegree(course: GalleryCourse, profile: StudentProfile): RequirementCheck {
  const text = course.entry_requirements
  const needClass = requiredClass(text)
  const needUcas = requiredUcas(text)

  if (needClass && profile.classification) {
    const short = rank(profile.classification) - rank(needClass)
    return {
      id: 'degree',
      label: 'Academic entry',
      asks: `${CLASS_LABELS[needClass]} or equivalent`,
      verdict: short >= 0 ? 'met' : short === -1 ? 'close' : 'unmet',
      gap: short >= 0
        ? ''
        : `You have ${CLASS_LABELS[profile.classification].toLowerCase()}; this course asks for ${CLASS_LABELS[needClass].toLowerCase()}.`,
      short: `${CLASS_LABELS[needClass]}`,
    }
  }

  if (needUcas && profile.ucasPoints != null) {
    const short = profile.ucasPoints - needUcas
    return {
      id: 'degree',
      label: 'Academic entry',
      asks: `${needUcas} UCAS points`,
      verdict: short >= 0 ? 'met' : short >= -16 ? 'close' : 'unmet',
      gap: short >= 0 ? '' : `You are ${Math.abs(short)} UCAS points short of ${needUcas}.`,
      short: `${needUcas} UCAS points`,
    }
  }

  return {
    id: 'degree',
    label: 'Academic entry',
    asks: text ? text.replace(/\s+/g, ' ').trim() : 'Not stated on the source page',
    verdict: 'unknown',
    gap: !text
      ? 'The university has not published this.'
      : needUcas
        ? 'Add your UCAS points to check this.'
        : needClass
          ? 'Add your degree result to check this.'
          : 'This one needs reading in full.',
    short: '',
  }
}

function checkEnglish(course: GalleryCourse, profile: StudentProfile): RequirementCheck {
  const need = requiredEnglish(course.english_requirements)
  if (!need) {
    return {
      id: 'english',
      label: 'English language',
      asks: course.english_requirements?.trim() || 'Not stated on the source page',
      verdict: 'unknown',
      gap: course.english_requirements ? 'Add your test scores to check this.' : 'The university has not published this.',
      short: '',
    }
  }

  const asks = need.band != null
    ? `IELTS ${need.overall} overall, no band below ${need.band}`
    : `IELTS ${need.overall} overall`

  if (profile.ieltsOverall == null) {
    return { id: 'english', label: 'English language', asks, verdict: 'unknown', gap: 'Add your IELTS scores to check this.', short: '' }
  }

  const overallShort = Number((need.overall - profile.ieltsOverall).toFixed(1))
  const bandShort = need.band != null && profile.ieltsLowest != null
    ? Number((need.band - profile.ieltsLowest).toFixed(1))
    : 0

  // Name whichever half actually falls short — a student who clears the overall
  // but not one band needs to be told which band.
  const gaps: string[] = []
  if (overallShort > 0) gaps.push(`your overall is ${profile.ieltsOverall}, ${overallShort} below the ${need.overall} asked for`)
  if (bandShort > 0) gaps.push(`your lowest band is ${profile.ieltsLowest}, ${bandShort} below the ${need.band} minimum`)

  const worst = Math.max(overallShort, bandShort)
  return {
    id: 'english',
    label: 'English language',
    asks,
    verdict: worst <= 0 ? 'met' : worst <= 0.5 ? 'close' : 'unmet',
    gap: gaps.length ? `${gaps.join(', and ')}.` : '',
    short: asks.replace('IELTS ', ''),
  }
}

function checkBudget(course: GalleryCourse, profile: StudentProfile): RequirementCheck {
  const fee = lowestFee(course)
  if (fee == null) {
    return {
      id: 'budget',
      label: 'Tuition',
      asks: 'Not stated on the source page',
      verdict: 'unknown',
      gap: 'The university has not published a fee for this course.',
      short: '',
    }
  }
  const asks = `${money(fee)} per year for international students`
  if (profile.budget == null) {
    return { id: 'budget', label: 'Tuition', asks, verdict: 'unknown', gap: 'Set a budget to check this.', short: '' }
  }
  const over = fee - profile.budget
  return {
    id: 'budget',
    label: 'Tuition',
    asks,
    verdict: over <= 0 ? 'met' : over <= profile.budget * 0.1 ? 'close' : 'unmet',
    gap: over <= 0 ? '' : `${money(over)} above the ${money(profile.budget)} you set.`,
    short: `${money(fee)} a year`,
  }
}

function checkIntake(course: GalleryCourse, profile: StudentProfile): RequirementCheck {
  const months = course.intake_months
  const asks = months.length ? `Starts in ${months.join(', ')}` : 'Not stated on the source page'
  if (!months.length) {
    return { id: 'intake', label: 'Start date', asks, verdict: 'unknown', gap: 'The university has not published intake months.', short: '' }
  }
  if (!profile.intake) {
    return { id: 'intake', label: 'Start date', asks, verdict: 'unknown', gap: 'Choose a target intake to check this.', short: '' }
  }
  return {
    id: 'intake',
    label: 'Start date',
    asks,
    verdict: months.includes(profile.intake) ? 'met' : 'unmet',
    gap: months.includes(profile.intake) ? '' : `No ${profile.intake} intake. This course starts in ${months.join(' or ')}.`,
    short: profile.intake,
  }
}

export function matchCourse(course: GalleryCourse, profile: StudentProfile): CourseMatch {
  const checks = [
    checkDegree(course, profile),
    checkEnglish(course, profile),
    checkBudget(course, profile),
    checkIntake(course, profile),
  ]
  const known = checks.filter((check) => check.verdict !== 'unknown')
  return {
    checks,
    met: known.filter((check) => check.verdict === 'met').length,
    total: known.length,
    unchecked: checks.length - known.length,
    unprofiled: known.length === 0,
  }
}

/** Courses a student can act on come first; nothing is hidden. A course that
    could not be checked is not a better match than one that was checked and
    passed, so unchecked requirements carry a cost too — a smaller one, since
    the fault is the university's missing data, not the student's. */
export function matchRank(match: CourseMatch): number {
  if (match.unprofiled) return 0
  const unmet = match.checks.filter((check) => check.verdict === 'unmet').length
  const close = match.checks.filter((check) => check.verdict === 'close').length
  return unmet * 10 + close * 3 + match.unchecked
}
