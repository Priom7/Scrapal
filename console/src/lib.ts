import { RefObject, useEffect, useState } from 'react'
import { Run } from './api'

/** One icon scale for the whole console. Never size an icon inline. */
export const ICON = { xs: 13, sm: 15, md: 17, lg: 20, xl: 24 } as const

/** The state law: cobalt=active, mint=done, amber=waiting, coral=failed, grey=not started. */
export type Tone = 'done' | 'active' | 'wait' | 'fail' | 'idle'

const TONES: Record<string, Tone> = {
  completed: 'done', published: 'done', ok: 'done', ready: 'done', resolved: 'done', supported: 'done', healthy: 'done', ended: 'done',
  running: 'active', queued: 'active', started: 'active', live: 'active', connecting: 'active',
  review: 'wait', pending: 'wait', degraded: 'wait', policy_skipped: 'wait', warning: 'wait', loading: 'wait',
  failed: 'fail', rejected: 'fail', unhealthy: 'fail', worker_timeout: 'fail', withheld: 'fail', offline: 'fail',
}

export function toneFor(status: string): Tone {
  return TONES[status] ?? 'idle'
}

const FOCUSABLE = 'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])'

/** Escape to close, initial focus, a focus trap, and focus restored to whatever opened the dialog. */
export function useDialog(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return onClose()
      if (event.key !== 'Tab' || !ref.current) return
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => !item.hasAttribute('disabled') && item.offsetParent !== null)
      if (!items.length) return
      const [first, last] = [items[0], items[items.length - 1]]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); opener?.focus?.() }
  }, [ref, onClose])
}

export function formatDuration(milliseconds: number) {
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)}s`
  return `${Math.floor(milliseconds / 60_000)}m ${Math.round(milliseconds % 60_000 / 1000)}s`
}

export function compactUrl(value: string) {
  try { const url = new URL(value); return `${url.hostname}${url.pathname}` } catch { return value }
}

export function relativeDate(value: string) {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

export function isLiveRun(run: Run) {
  return run.status === 'running' || (run.status === 'queued' && Date.now() - new Date(run.created_at).getTime() < 120_000)
}

/** Matches a CSS breakpoint in JS so layout-dependent behaviour stays in sync with styles.css. */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}
