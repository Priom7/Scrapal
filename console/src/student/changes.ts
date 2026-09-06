// What changed about a course, and when.
//
// Scrapal keeps a dated snapshot every time a record is re-crawled, so it can
// answer a question no competitor can: not "what does this page say" but "what
// did it say when you saved it, and what moved since". Every change carries the
// date it was read, because a change without a date is a rumour.
import type { RecordRevision } from '../api'

export type ChangeDirection = 'up' | 'down' | 'added' | 'removed' | 'edited'

export type FieldChange = {
  field: string
  label: string
  direction: ChangeDirection
  before: string
  after: string
  /** Money only: the size of the move, for saying "£900 more". */
  delta?: number
  /** When the newer of the two snapshots was read. */
  changedAt: string
}

const WATCHED: { field: string; label: string }[] = [
  { field: 'fees', label: 'Tuition' },
  { field: 'intake_months', label: 'Intakes' },
  { field: 'entry_requirements', label: 'Entry requirements' },
  { field: 'english_requirements', label: 'English requirements' },
  { field: 'durations', label: 'Length' },
]

type Fee = { residency?: string; amount?: number; currency?: string }

function internationalFee(data: Record<string, unknown>): number | null {
  const fees = (data.fees as Fee[] | undefined) ?? []
  const international = fees.find((fee) => fee.residency === 'international')?.amount
  if (international != null) return international
  const amounts = fees.map((fee) => fee.amount).filter((value): value is number => value != null)
  return amounts.length ? Math.max(...amounts) : null
}

function money(amount: number): string {
  return `£${amount.toLocaleString('en-GB')}`
}

function asList(value: unknown): string[] | null {
  return Array.isArray(value) ? value.map(String) : null
}

function compareField(
  field: string,
  label: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  changedAt: string,
): FieldChange | null {
  if (field === 'fees') {
    const was = internationalFee(before)
    const now = internationalFee(after)
    if (was == null || now == null || was === now) return null
    return {
      field, label, changedAt,
      direction: now > was ? 'up' : 'down',
      before: money(was),
      after: money(now),
      delta: Math.abs(now - was),
    }
  }

  const wasList = asList(before[field])
  const nowList = asList(after[field])
  if (wasList && nowList) {
    const added = nowList.filter((item) => !wasList.includes(item))
    const removed = wasList.filter((item) => !nowList.includes(item))
    if (!added.length && !removed.length) return null
    return {
      field, label, changedAt,
      direction: added.length && !removed.length ? 'added' : removed.length && !added.length ? 'removed' : 'edited',
      before: wasList.join(', ') || 'nothing',
      after: nowList.join(', ') || 'nothing',
    }
  }

  const was = before[field] == null ? null : String(before[field])
  const now = after[field] == null ? null : String(after[field])
  if (was === now) return null
  return {
    field, label, changedAt,
    direction: was == null ? 'added' : now == null ? 'removed' : 'edited',
    before: was ?? 'not published',
    after: now ?? 'not published',
  }
}

/** Everything that moved between two snapshots. */
export function diffRevisions(before: RecordRevision, after: RecordRevision): FieldChange[] {
  return WATCHED
    .map(({ field, label }) => compareField(field, label, before.data, after.data, after.created_at))
    .filter((change): change is FieldChange => change !== null)
}

/** What changed since a given moment — the moment a student saved the course.
    Revisions arrive newest first, as the API returns them. */
export function changesSince(revisions: RecordRevision[], since: string | null): FieldChange[] {
  if (revisions.length < 2) return []
  const current = revisions[0]
  const baseline = since
    ? // The newest snapshot that was already in place when they saved it.
    revisions.find((revision) => revision.created_at <= since) ?? revisions[revisions.length - 1]
    : revisions[1]
  if (baseline.id === current.id) return []
  return diffRevisions(baseline, current)
}

/** One line a reader can act on, in plain words. */
export function describeChange(change: FieldChange): string {
  if (change.field === 'fees' && change.delta != null) {
    return change.direction === 'up'
      ? `Tuition went up by ${money(change.delta)}, from ${change.before} to ${change.after}`
      : `Tuition came down by ${money(change.delta)}, from ${change.before} to ${change.after}`
  }
  if (change.direction === 'added') return `${change.label} now include ${change.after}`
  if (change.direction === 'removed') return `${change.label} dropped to ${change.after}`
  return `${change.label} changed from “${change.before}” to “${change.after}”`
}
