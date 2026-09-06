import { Check, Circle, Minus, TriangleAlert } from 'lucide-react'
import { ICON } from '../lib'
import { matchPercent, type CourseMatch, type RequirementCheck, type Verdict } from './match'

const ICONS: Record<Verdict, typeof Check> = {
  met: Check,
  close: TriangleAlert,
  unmet: Minus,
  unknown: Circle,
}

function count(n: number): string {
  return n === 1 ? 'one' : n === 2 ? 'both' : `all ${n}`
}

/** Plain-language headline. No score anywhere: the product spec is explicit
    that a match must be explainable, and a percentage is the opposite of that. */
function headline(result: CourseMatch): string {
  if (result.unprofiled) return 'Add your details to see where you stand'
  const unmet = result.checks.filter((check) => check.verdict === 'unmet').length
  const close = result.checks.filter((check) => check.verdict === 'close').length
  if (!unmet && !close) {
    return result.total === 1
      ? 'You meet the one requirement we could check'
      : `You meet ${count(result.total)} requirements we could check`
  }
  if (!unmet) return `You are close: ${close} requirement${close === 1 ? '' : 's'} to go`
  return `${unmet} requirement${unmet === 1 ? '' : 's'} you do not meet yet`
}

export function MatchPanel({ result, detailed = false, compact = false }: {
  result: CourseMatch
  detailed?: boolean
  /** For narrow places like the catalogue rail: the verdict and what still
      needs attention, without the rows that need none. */
  compact?: boolean
}) {
  if (compact) return <CompactMatch result={result} />
  return <section className={`match ${detailed ? 'detailed' : ''}`} aria-label="How you match this course">
    <div className="match-top">
      <p className="match-headline">{headline(result)}</p>
      <MatchScore result={result} />
    </div>
    {result.unchecked > 0 && !result.unprofiled && (
      <p className="match-unchecked">
        {result.unchecked} more {result.unchecked === 1 ? 'requirement' : 'requirements'} could not be checked.
      </p>
    )}
    <ul className="match-list">
      {result.checks.map((check) => <MatchRow key={check.id} check={check} detailed={detailed} />)}
    </ul>
  </section>
}

/** The figure, with the count it came from so it is never a bare number. */
export function MatchScore({ result, size = 'normal' }: { result: CourseMatch; size?: 'normal' | 'small' }) {
  const percent = matchPercent(result)
  if (percent == null) return null
  const tone = percent === 100 ? 'met' : percent >= 60 ? 'close' : 'unmet'
  return <span className={`match-score ${tone} ${size}`}>
    <strong>{percent}%</strong>
    <small>{result.met} of {result.total} met</small>
  </span>
}

function CompactMatch({ result }: { result: CourseMatch }) {
  const attention = result.checks.filter((check) => check.verdict === 'close' || check.verdict === 'unmet')
  const met = result.checks.filter((check) => check.verdict === 'met').length
  return <section className="match compact" aria-label="How you match this course">
    <div className="match-top">
      <p className="match-headline">{headline(result)}</p>
      <MatchScore result={result} size="small" />
    </div>
    {attention.length > 0 && (
      <ul className="match-list">
        {attention.slice(0, 2).map((check) => (
          <li key={check.id} className={`match-row ${check.verdict}`}>
            <span className="match-icon" aria-hidden="true">
              {check.verdict === 'close' ? <TriangleAlert size={13} /> : <Minus size={13} />}
            </span>
            <span className="match-detail">{check.gap || check.asks}</span>
          </li>
        ))}
      </ul>
    )}
    {met > 0 && <p className="match-met">{met} requirement{met === 1 ? '' : 's'} already met</p>}
  </section>
}

function MatchRow({ check, detailed }: { check: RequirementCheck; detailed: boolean }) {
  const Icon = ICONS[check.verdict]
  // A requirement that needs no attention takes one quiet line; the sentence
  // naming a shortfall is the only thing that should slow a reader down.
  const quiet = check.verdict === 'met'
  return <li className={`match-row ${check.verdict}`}>
    <span className="match-icon" aria-hidden="true"><Icon size={ICON.xs} /></span>
    <span className="match-label">{check.label}</span>
    <span className="match-detail">
      {quiet ? (check.short || check.asks) : (check.gap || check.asks)}
    </span>
    {detailed && !quiet && check.gap && <span className="match-asks">Asks for: {check.asks}</span>}
  </li>
}
