import { describe, expect, it } from 'vitest'
import type { RecordRevision } from '../api'
import { changesSince, describeChange, diffRevisions } from './changes'

function revision(id: string, createdAt: string, data: Record<string, unknown>): RecordRevision {
  return {
    id, revision: 1, status: 'published', confidence: 0.9,
    validation: {}, note: null, created_at: createdAt, data,
  }
}

const NOW = revision('now', '2026-09-01T00:00:00Z', {
  fees: [{ residency: 'home', amount: 12000 }, { residency: 'international', amount: 19031 }],
  intake_months: ['January', 'May', 'September'],
  english_requirements: 'IELTS 6.5 overall with no component below 6.0.',
})
const THEN = revision('then', '2026-06-01T00:00:00Z', {
  fees: [{ residency: 'home', amount: 12000 }, { residency: 'international', amount: 18131 }],
  intake_months: ['January', 'May'],
  english_requirements: 'IELTS 6.0 overall with no component below 6.0.',
})

describe('diffing two crawls', () => {
  it('reports a fee rise with the size of the move', () => {
    const fee = diffRevisions(THEN, NOW).find((change) => change.field === 'fees')!
    expect(fee.direction).toBe('up')
    expect(fee.delta).toBe(900)
    expect(describeChange(fee)).toBe('Tuition went up by £900, from £18,131 to £19,031')
  })

  it('notices an intake that was added', () => {
    const intake = diffRevisions(THEN, NOW).find((change) => change.field === 'intake_months')!
    expect(intake.direction).toBe('added')
    expect(intake.after).toContain('September')
  })

  // A tightened requirement after someone applied is the change that costs most.
  it('notices a tightened English requirement', () => {
    const english = diffRevisions(THEN, NOW).find((change) => change.field === 'english_requirements')!
    expect(english.direction).toBe('edited')
    expect(english.before).toContain('6.0 overall')
    expect(english.after).toContain('6.5 overall')
  })

  it('reports nothing when nothing moved', () => {
    expect(diffRevisions(NOW, NOW)).toEqual([])
  })

  // Every change must be dated: a change without a date is a rumour.
  it('dates every change to the crawl that found it', () => {
    expect(diffRevisions(THEN, NOW).every((change) => change.changedAt === NOW.created_at)).toBe(true)
  })
})

describe('changes since a student saved a course', () => {
  const OLDEST = revision('oldest', '2026-01-01T00:00:00Z', {
    fees: [{ residency: 'international', amount: 16000 }],
  })
  const history = [NOW, THEN, OLDEST]

  it('compares against what was published when they saved it', () => {
    // Saved in July: the snapshot in force then was June's, not January's.
    const changes = changesSince(history, '2026-07-15T00:00:00Z')
    expect(changes.find((change) => change.field === 'fees')!.before).toBe('£18,131')
  })

  it('falls back to the earliest snapshot for someone who saved it long ago', () => {
    const changes = changesSince(history, '2025-12-01T00:00:00Z')
    expect(changes.find((change) => change.field === 'fees')!.before).toBe('£16,000')
  })

  it('says nothing changed when there is no history to compare', () => {
    expect(changesSince([NOW], '2026-07-15T00:00:00Z')).toEqual([])
  })
})
