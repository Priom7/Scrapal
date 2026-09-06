// A minimal history router. The console had no URL state at all — no shareable
// course link, no working back button — and the student product cannot ship
// without one. Hand-rolled to match the way this codebase already handles its
// own dialogs and event streams, and to avoid a dependency for sixty lines.
import { useEffect, useState, type MouseEvent } from 'react'

export type Route = { path: string; params: Record<string, string> }

function current(): string {
  return window.location.pathname + window.location.search
}

const listeners = new Set<() => void>()

function announce(): void {
  listeners.forEach((listener) => listener())
}

export function navigate(to: string, options?: { replace?: boolean }): void {
  if (to === current()) return
  window.history[options?.replace ? 'replaceState' : 'pushState']({}, '', to)
  announce()
  // A new page starts at the top; keeping the old scroll position is
  // disorienting when the content is unrelated.
  window.scrollTo(0, 0)
}

export function useLocation(): string {
  const [path, setPath] = useState(current)
  useEffect(() => {
    const update = () => setPath(current())
    listeners.add(update)
    window.addEventListener('popstate', update)
    return () => {
      listeners.delete(update)
      window.removeEventListener('popstate', update)
    }
  }, [])
  return path
}

/** Matches "/student/courses/:id" against the current path. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('?')[0].split('/').filter(Boolean)
  if (patternParts.length !== pathParts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i += 1) {
    const expected = patternParts[i]
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(pathParts[i])
      continue
    }
    if (expected !== pathParts[i]) return null
  }
  return params
}

/** Anchor props that keep middle-click and modifier-click working.
    Deliberately a plain function, not a hook: link props are needed inside
    conditional branches all over the UI, and a hook there is a bug waiting. */
export function linkTo(to: string): { href: string; onClick: (event: MouseEvent) => void } {
  return {
    href: to,
    onClick: (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      navigate(to)
    },
  }
}
