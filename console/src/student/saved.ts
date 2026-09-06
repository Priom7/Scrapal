// Saved courses live on the student's own device, like their profile. The date
// matters as much as the id: "what changed since you saved this" needs a moment
// to compare against.
import { useEffect, useState } from 'react'

const KEY = 'scrapal.student.saved'
const listeners = new Set<(entries: SavedEntry[]) => void>()

export type SavedEntry = { id: string; at: string }

function read(): SavedEntry[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    // Earlier versions stored bare ids; keep those working rather than
    // silently emptying someone's shortlist on upgrade.
    return parsed.map((item) => typeof item === 'string'
      ? { id: item, at: new Date(0).toISOString() }
      : item as SavedEntry)
  } catch {
    return []
  }
}

function write(entries: SavedEntry[]): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(entries))
  } catch {
    // Browsing still works without saved courses.
  }
  listeners.forEach((listener) => listener(entries))
}

export function useSavedEntries(): SavedEntry[] {
  const [entries, setEntries] = useState<SavedEntry[]>([])
  useEffect(() => {
    setEntries(read())
    listeners.add(setEntries)
    return () => { listeners.delete(setEntries) }
  }, [])
  return entries
}

export function useSaved(): string[] {
  return useSavedEntries().map((entry) => entry.id)
}

export function isSaved(ids: string[], id: string): boolean {
  return ids.includes(id)
}

export function savedAt(entries: SavedEntry[], id: string): string | null {
  return entries.find((entry) => entry.id === id)?.at ?? null
}

/** Returns whether the course is saved after the toggle. */
export function toggleSaved(id: string): boolean {
  const entries = read()
  const next = entries.some((entry) => entry.id === id)
    ? entries.filter((entry) => entry.id !== id)
    : [...entries, { id, at: new Date().toISOString() }]
  write(next)
  return next.some((entry) => entry.id === id)
}
