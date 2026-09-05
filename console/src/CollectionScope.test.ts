import { describe, expect, it } from 'vitest'
import { isStaleScope } from './CollectionScope'

describe('stale collection scope', () => {
  it('is stale when it names a collection that no longer exists', () => {
    expect(isStaleScope('4d32ae31', [{ id: 'f3aece0b' }])).toBe(true)
  })

  it('is not stale while it still matches a live collection', () => {
    expect(isStaleScope('f3aece0b', [{ id: 'f3aece0b' }, { id: 'other' }])).toBe(false)
  })

  it('treats an unloaded collection list as no evidence, not as a purge', () => {
    expect(isStaleScope('f3aece0b', [])).toBe(false)
  })

  it('has nothing to clear when no scope is stored', () => {
    expect(isStaleScope(undefined, [{ id: 'f3aece0b' }])).toBe(false)
  })
})
