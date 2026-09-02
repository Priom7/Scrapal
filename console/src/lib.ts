import { RefObject, useEffect, useRef, useState } from 'react'
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

/**
 * crypto.randomUUID exists only in a secure context, so it is undefined on a
 * phone hitting the console over http://<lan-ip>:3000 — localhost is exempt,
 * which is why this only ever failed on real devices. getRandomValues has no
 * such restriction, so build the v4 id from it and keep the composer working.
 */
export function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const FOCUSABLE = 'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])'

/** Escape to close, initial focus, a focus trap, and focus restored to whatever opened the dialog. */
export function useDialog(ref: RefObject<HTMLElement | null>, onClose: () => void, enabled = true) {
  // onClose is nearly always an inline arrow, so a new identity arrives on every
  // parent render. Keeping it in the effect's deps re-ran the setup on each of
  // the ten-second query refetches, which yanked focus back to the dialog's
  // first button mid-sentence and closed the keyboard on phones.
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    if (!enabled) return
    const opener = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return close.current()
      if (event.key !== 'Tab' || !ref.current) return
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => !item.hasAttribute('disabled') && item.offsetParent !== null)
      if (!items.length) return
      const [first, last] = [items[0], items[items.length - 1]]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); opener?.focus?.() }
  }, [enabled, ref])
}

export function formatDuration(milliseconds: number) {
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)}s`
  return `${Math.floor(milliseconds / 60_000)}m ${Math.floor(milliseconds / 1000) % 60}s`
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

/** The typed plan Ollama derives from a question, plus how it was derived. */
export type QueryPlanData = {
  intent?: string
  entities?: string[]
  requested_fields?: string[]
  level?: string | null
  residency?: string | null
  intake?: string | null
  study_mode?: string | null
  source?: string
}

export function readPlan(raw: unknown): QueryPlanData | undefined {
  return raw && typeof raw === 'object' ? raw as QueryPlanData : undefined
}
