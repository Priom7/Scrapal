import { describe, expect, it } from 'vitest'
import { readScope, writeScope, type ScopeStore } from './CollectionScope'

function fakeStore(): ScopeStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

const throwingStore: ScopeStore = {
  getItem: () => { throw new Error('storage blocked') },
  setItem: () => { throw new Error('storage blocked') },
  removeItem: () => { throw new Error('storage blocked') },
}

describe('collection scope', () => {
  it('defaults to every collection rather than the first one', () => {
    expect(readScope(fakeStore())).toBeUndefined()
  })

  it('remembers an explicit choice across reloads', () => {
    const store = fakeStore()
    writeScope('abc-123', store)
    expect(readScope(store)).toBe('abc-123')
  })

  it('returns to every collection when the choice is cleared', () => {
    const store = fakeStore()
    writeScope('abc-123', store)
    writeScope(undefined, store)
    expect(readScope(store)).toBeUndefined()
  })

  it('still works when the browser refuses storage', () => {
    expect(readScope(throwingStore)).toBeUndefined()
    expect(() => writeScope('abc-123', throwingStore)).not.toThrow()
  })
})
