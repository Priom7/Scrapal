import { useCallback, useState } from 'react'

const KEY = 'scrapal-collection-scope'

export type ScopeStore = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

function browserStore(): ScopeStore | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function readScope(store: ScopeStore | undefined = browserStore()): string | undefined {
  try {
    return store?.getItem(KEY) ?? undefined
  } catch {
    return undefined
  }
}

export function writeScope(
  id: string | undefined,
  store: ScopeStore | undefined = browserStore(),
): void {
  try {
    if (id) store?.setItem(KEY, id)
    else store?.removeItem(KEY)
  } catch {
    // Storage is optional. The current session still works when it is blocked.
  }
}

/**
 * A stored scope outlives the collection it names. The picker hides below two
 * collections, so a scope pointing at a deleted one would filter every view
 * down to nothing with no control left to clear it. An empty list means the
 * collections have not loaded yet, which is not evidence of anything.
 */
export function isStaleScope(
  scope: string | undefined,
  collections: { id: string }[],
): boolean {
  if (!scope || !collections.length) return false
  return !collections.some((collection) => collection.id === scope)
}

export function useCollectionScope() {
  const [scope, set] = useState<string | undefined>(() => readScope())
  const setScope = useCallback((id: string | undefined) => {
    writeScope(id)
    set(id)
  }, [])
  return { scope, setScope }
}
