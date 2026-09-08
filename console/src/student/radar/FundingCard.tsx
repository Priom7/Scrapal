// A funding call, shared by the Radar and the Funding page.
import { Banknote, ExternalLink, Sparkles } from 'lucide-react'
import type { FundingCall, MatchReason } from '../../api'
import { ICON } from '../../lib'
import { Reasons, Score } from './PersonCard'
import { SaveButton } from './SaveButton'
import { relativeDeadline, urgent } from './deadlines'

const KIND_LABELS: Record<FundingCall['kind'], string> = {
  phd: 'PhD',
  fellowship: 'Fellowship',
  grant: 'Grant',
  scholarship: 'Scholarship',
}

/**
 * One funding call.
 *
 * The Radar hands it a score and reasons; the Funding page hands it neither,
 * and instead passes `matched` — the topics the reader's own saved work covers
 * — so a browsed list can still say why something is worth a look without
 * pretending to a percentage it has not computed.
 */
export function FundingCard({ call, score, reasons, matched = [] }: {
  call: FundingCall
  score?: number
  reasons?: MatchReason[]
  matched?: string[]
}) {
  return <article className="match-card">
    <header>
      <span className="match-icon"><Banknote size={ICON.lg} aria-hidden="true" /></span>
      <div className="match-title">
        <h3>{call.name}</h3>
        <p>{call.funder}</p>
        <p className="match-where">{call.summary}</p>
      </div>
      {score !== undefined && <Score value={score} />}
    </header>
    <div className="match-badges">
      <span className="badge">{KIND_LABELS[call.kind]}</span>
      <span className="badge">{call.country_code}</span>
      {call.fully_funded && <span className="badge funded">Fully funded</span>}
      <span className="badge">{call.currency} {call.amount.toLocaleString('en-GB')}</span>
      <span className={`badge ${urgent(call.deadline) ? 'urgent' : ''}`}>{relativeDeadline(call.deadline)}</span>
    </div>
    {reasons && reasons.length > 0 && <Reasons reasons={reasons} />}

    {/* Browsing has no score, so the honest signal is the named overlap with
        whatever the reader last searched on. */}
    {!reasons && matched.length > 0 && <p className="call-matched">
      <Sparkles size={ICON.xs} aria-hidden="true" />
      {/* One flex child, not three: without the span the text, the <b> and the
          full stop each became a flex item and the row gap opened a space
          before the punctuation. */}
      <span>Matches your work on <b>{matched.join(', ')}</b>.</span>
    </p>}
    <div className="match-actions">
      <a className="student-button primary" href={call.url} target="_blank" rel="noreferrer">
        <ExternalLink size={ICON.xs} aria-hidden="true" /> View the call
      </a>
      <SaveButton id={call.id} kind="funding" label={call.name} />
    </div>
  </article>
}
