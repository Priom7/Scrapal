// The terms from the last Radar search, kept on this device.
//
// This is what lets the Funding page say "matches your work" without asking the
// reader to paste their research again on every page. Only the fingerprint is
// stored — the published terms that were already safe to send — never the
// writing they came from, so nothing here could disclose an unpublished idea
// even if the storage were read.
//
// Kept deliberately small and explicit: a clear() the reader can reach, and no
// silent syncing anywhere.

const KEY = 'scrapal.student.radar-terms'

export type SavedTerms = { terms: string[]; discipline: string | null; savedAt: string }

export function saveTerms(terms: string[], discipline: string | null): void {
  try {
    if (!terms.length) return
    const value: SavedTerms = { terms, discipline, savedAt: new Date().toISOString() }
    globalThis.localStorage?.setItem(KEY, JSON.stringify(value))
  } catch {
    // The Radar still works for this visit without remembering anything.
  }
}

export function loadTerms(): SavedTerms | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as SavedTerms
    return Array.isArray(value.terms) && value.terms.length ? value : null
  } catch {
    return null
  }
}

export function clearTerms(): void {
  try {
    globalThis.localStorage?.removeItem(KEY)
  } catch {
    // Nothing to do; the caller drops its own copy either way.
  }
}

/** Which of these topics the reader's own work covers. Named overlap only —
    the same rule the matcher follows, so the two never disagree. */
export function overlapWith(topics: string[], saved: SavedTerms | null): string[] {
  if (!saved) return []
  const wanted = new Set(saved.terms.map((term) => term.toLowerCase()))
  return topics.filter((topic) => wanted.has(topic.toLowerCase()))
}
