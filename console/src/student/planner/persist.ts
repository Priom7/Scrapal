// The conversation survives a closed tab.
//
// The plan already persisted; the thread did not, so a student who came back
// was greeted as a stranger and asked everything again. That is the single
// worst thing a chat-first product can do.
import type { PlannerState } from './types'

const KEY = 'scrapal.student.thread'
/** Enough to hold the shape of a session without growing without bound. */
const MAX_MESSAGES = 80

type Stored = Omit<PlannerState, 'messages'> & {
  messages: PlannerState['messages']
  savedAt: string
}

export function saveThread(state: PlannerState): void {
  try {
    const stored: Stored = {
      ...state,
      messages: state.messages.slice(-MAX_MESSAGES),
      savedAt: new Date().toISOString(),
    }
    globalThis.localStorage?.setItem(KEY, JSON.stringify(stored))
  } catch {
    // The conversation still works for this visit without being saved.
  }
}

export function loadThread(): { state: PlannerState; savedAt: string } | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as Stored
    if (!Array.isArray(stored.messages) || !stored.messages.length) return null
    const { savedAt, ...state } = stored
    return { state: state as PlannerState, savedAt }
  } catch {
    return null
  }
}

export function clearThread(): void {
  try {
    globalThis.localStorage?.removeItem(KEY)
  } catch {
    // Nothing to do; the caller resets the in-memory state either way.
  }
}

/** How long ago, in the words a person would use. */
export function sinceLabel(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 2) return 'just now'
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}
