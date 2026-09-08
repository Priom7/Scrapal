import { beforeEach, describe, expect, it } from 'vitest'
import { toggleSaved } from './saved'

const KEY = 'scrapal.student.saved'

/** read() is private, so the store is exercised the way the app uses it. */
function stored() {
  return JSON.parse(localStorage.getItem(KEY) ?? '[]') as { id: string; kind: string; at: string }[]
}

describe('what the student keeps', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to a course, so existing callers keep working', () => {
    toggleSaved('rec-ds')
    expect(stored()[0].kind).toBe('course')
  })

  it('keeps researchers and funding apart from courses', () => {
    toggleSaved('rec-ds')
    toggleSaved('r-priya-nair', 'researcher')
    toggleSaved('f-0', 'funding')
    expect(stored().map((entry) => entry.kind).sort()).toEqual(['course', 'funding', 'researcher'])
  })

  it('toggles off as well as on', () => {
    expect(toggleSaved('r-priya-nair', 'researcher')).toBe(true)
    expect(toggleSaved('r-priya-nair', 'researcher')).toBe(false)
    expect(stored()).toHaveLength(0)
  })

  // Two older shapes were written before kinds existed. Emptying someone's
  // shortlist on upgrade would be the worst possible migration.
  it('carries bare ids from the oldest version forward as courses', () => {
    localStorage.setItem(KEY, JSON.stringify(['rec-old']))
    toggleSaved('rec-new')
    const after = stored()
    expect(after).toHaveLength(2)
    expect(after.find((entry) => entry.id === 'rec-old')?.kind).toBe('course')
  })

  it('carries kind-less entries forward as courses', () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: 'rec-old', at: '2026-01-01T00:00:00Z' }]))
    toggleSaved('r-someone', 'researcher')
    const after = stored()
    expect(after.find((entry) => entry.id === 'rec-old')?.kind).toBe('course')
    expect(after.find((entry) => entry.id === 'rec-old')?.at).toBe('2026-01-01T00:00:00Z')
  })
})
