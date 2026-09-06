import { Check, Circle, Minus, TriangleAlert } from 'lucide-react'
import { ICON } from '../lib'
import type { CourseMatch, RequirementCheck, Verdict } from './match'

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

export function MatchPanel({ result, detailed = false }: { result: CourseMatch; detailed?: boolean }) {
  return <section className={`match ${detailed ? 'detailed' : ''}`} aria-label="How you match this course">
    <p className="match-headline">{headline(result)}</p>
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
