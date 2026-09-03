import { useState } from 'react'

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

export function useCollectionScope() {
  const [scope, set] = useState<string | undefined>(() => readScope())
  return {
    scope,
    setScope: (id: string | undefined) => {
      writeScope(id)
      set(id)
    },
  }
}
