// What the student has kept, on their own device.
//
// Started as courses and now holds researchers and funding calls too, because
// finding the right supervisor and then having nowhere to put them is worse
// than not finding them. One store rather than three: the date and the shape
// are the same, only the kind differs, and a single list is what "everything
// you kept" has to read from anyway.
//
// The date matters as much as the id: "what changed since you saved this"
// needs a moment to compare against.
import { useEffect, useState } from 'react'

const KEY = 'scrapal.student.saved'
const listeners = new Set<(entries: SavedEntry[]) => void>()

export type SavedKind = 'course' | 'researcher' | 'funding'

export type SavedEntry = { id: string; kind: SavedKind; at: string }

function read(): SavedEntry[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    // Two earlier shapes to carry forward rather than silently emptying
    // someone's shortlist on upgrade: bare ids, and {id, at} before kinds
    // existed. Both were courses.
    return parsed.map((item) => {
      if (typeof item === 'string') return { id: item, kind: 'course' as const, at: new Date(0).toISOString() }
      const entry = item as Partial<SavedEntry> & { id: string; at: string }
      return { id: entry.id, kind: entry.kind ?? 'course', at: entry.at }
    })
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

/** Course ids. Named for what it returns to the pages that already call it. */
export function useSaved(): string[] {
  return useSavedOf('course')
}

export function useSavedOf(kind: SavedKind): string[] {
  return useSavedEntries().filter((entry) => entry.kind === kind).map((entry) => entry.id)
}

export function isSaved(ids: string[], id: string): boolean {
  return ids.includes(id)
}

export function savedAt(entries: SavedEntry[], id: string): string | null {
  return entries.find((entry) => entry.id === id)?.at ?? null
}

/** Returns whether the thing is saved after the toggle. */
export function toggleSaved(id: string, kind: SavedKind = 'course'): boolean {
  const entries = read()
  const next = entries.some((entry) => entry.id === id)
    ? entries.filter((entry) => entry.id !== id)
    : [...entries, { id, kind, at: new Date().toISOString() }]
  write(next)
  return next.some((entry) => entry.id === id)
}
