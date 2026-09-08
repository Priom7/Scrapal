// Keeping a researcher or a funding call.
//
// The same control on both, because "keep this" should not look like two
// different features depending on what is being kept. Undo is offered because
// unsaving is a real inverse — the entry goes back exactly as it was.
import { Bookmark, BookmarkCheck } from 'lucide-react'
import { ICON } from '../../lib'
import { useToast } from '../../toast'
import { toggleSaved, useSavedEntries, type SavedKind } from '../saved'

const NOUNS: Record<SavedKind, string> = {
  course: 'Course',
  researcher: 'Researcher',
  funding: 'Funding call',
}

export function SaveButton({ id, kind, label }: {
  id: string
  kind: SavedKind
  label: string
}) {
  const notify = useToast()
  const entries = useSavedEntries()
  const on = entries.some((entry) => entry.id === id)

  return <button
    type="button"
    className={`student-button save-button ${on ? 'on' : ''}`}
    aria-pressed={on}
    onClick={() => {
      const now = toggleSaved(id, kind)
      notify({
        title: now ? 'Saved' : 'Removed',
        detail: now ? `${NOUNS[kind]} kept: ${label}.` : `${label} is no longer saved.`,
        onUndo: () => toggleSaved(id, kind),
      })
    }}
  >
    {on
      ? <><BookmarkCheck size={ICON.xs} aria-hidden="true" /> Saved</>
      : <><Bookmark size={ICON.xs} aria-hidden="true" /> Save</>}
  </button>
}
