// Saved courses live on the student's own device, like their profile.
import { useEffect, useState } from 'react'

const KEY = 'scrapal.student.saved'
const listeners = new Set<(ids: string[]) => void>()

function read(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function write(ids: string[]): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(ids))
  } catch {
    // Browsing still works without saved courses.
  }
  listeners.forEach((listener) => listener(ids))
}

export function useSaved(): string[] {
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    setIds(read())
    listeners.add(setIds)
    return () => { listeners.delete(setIds) }
  }, [])
  return ids
}

export function isSaved(ids: string[], id: string): boolean {
  return ids.includes(id)
}

/** Returns whether the course is saved after the toggle. */
export function toggleSaved(id: string): boolean {
  const ids = read()
  const next = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
  write(next)
  return next.includes(id)
}
