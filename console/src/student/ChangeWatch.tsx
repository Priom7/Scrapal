import { useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight, Pencil } from 'lucide-react'
import { api } from '../api'
import { ICON, relativeDate } from '../lib'
import { changesSince, describeChange, type FieldChange } from './changes'

const MARKS = { up: ArrowUpRight, down: ArrowDownRight, added: Pencil, removed: Pencil, edited: Pencil }

/** What moved on a course since the student saved it. Only Scrapal can answer
    this, because only Scrapal keeps the earlier crawl. */
export function ChangeWatch({ recordId, since }: { recordId: string; since: string | null }) {
  const revisions = useQuery({
    queryKey: ['student', 'revisions', recordId],
    queryFn: () => api.courseRecordRevisions(recordId),
  })

  if (revisions.isLoading || revisions.error) return null
  const changes = changesSince(revisions.data ?? [], since)
  if (!changes.length) return null

  return <section className="change-watch">
    <h2>{since ? 'Changed since you saved it' : 'Changed at the last crawl'}</h2>
    <ul>
      {changes.map((change) => <ChangeRow key={change.field} change={change} />)}
    </ul>
    <p className="change-note">
      Compared against the version Scrapal read {relativeDate(changes[0].changedAt)}. Universities
      can change a published page at any time.
    </p>
  </section>
}

function ChangeRow({ change }: { change: FieldChange }) {
  const Mark = MARKS[change.direction]
  return <li className={change.direction}>
    <span className="change-mark" aria-hidden="true"><Mark size={ICON.xs} /></span>
    <span className="change-text">{describeChange(change)}</span>
  </li>
}
