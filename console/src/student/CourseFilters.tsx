// The gallery's filter row, on the student side. A deliberate copy rather than
// a shared import: the operator's gallery is signed off and must not change
// when this one does.
import { Check, ChevronDown, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ICON } from '../lib'
import { useMediaQuery } from '../lib'

export function FilterPopover({ id, label, count, open, setOpen, onClear, children }: {
  id: string
  label: string
  count: number
  open?: string
  setOpen: (id?: string) => void
  onClear: () => void
  children: ReactNode
}) {
  const isOpen = open === id
  const mobile = useMediaQuery('(max-width: 760px)')

  // On a phone this is a bottom sheet over the page, so the page must stop
  // scrolling behind it and there must be something to tap to dismiss it.
  useEffect(() => {
    if (!isOpen || !mobile) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [isOpen, mobile])

  return <div className="filter-group">
    <button
      type="button"
      className={`filter-button ${count > 0 ? 'set' : ''}`}
      aria-expanded={isOpen}
      onClick={() => setOpen(isOpen ? undefined : id)}
    >
      {count > 0 && <span className="tally">{count}</span>}
      {label}
      <ChevronDown aria-hidden="true" />
    </button>
    {/* The sheet is rendered at the body on a phone. Its natural place is
        inside .filter-scroll, which has overflow-x: auto — and a scrolling
        ancestor clips a position:fixed child on iOS, which put the sheet in the
        middle of the page instead of at the bottom. */}
    {isOpen && mobile && createPortal(
      // Portalled content sits outside .student, so it carries the class with
      // it — otherwise the student tokens do not cascade and the sheet's own
      // button renders invisible.
      <div className="student student-portal">
        <button className="filter-backdrop" onClick={() => setOpen(undefined)} aria-label={`Close ${label}`} />
        <div className="filter-pop is-sheet" role="dialog" aria-modal="true" aria-label={label}>
          <header>
            <h4>{label}</h4>
            <div className="filter-pop-actions">
              {count > 0 && <button type="button" onClick={onClear}>Clear</button>}
              <button type="button" className="filter-pop-close" onClick={() => setOpen(undefined)} aria-label={`Close ${label}`}>
                <X size={ICON.sm} />
              </button>
            </div>
          </header>
          <div className="filter-pop-body">{children}</div>
          <footer><button type="button" onClick={() => setOpen(undefined)}>Done</button></footer>
        </div>
      </div>,
      document.body,
    )}
    {isOpen && !mobile && (
      <div className="filter-pop">
        <header>
          <h4>{label}</h4>
          <div className="filter-pop-actions">
            {count > 0 && <button type="button" onClick={onClear}>Clear</button>}
            <button
              type="button"
              className="filter-pop-close"
              onClick={() => setOpen(undefined)}
              aria-label={`Close ${label}`}
            >
              <X size={ICON.sm} />
            </button>
          </div>
        </header>
        <div className="filter-pop-body">{children}</div>
      </div>
    )}
  </div>
}

export function FilterOptions({ values, selected, onToggle, label }: {
  values: { value: string; count: number }[]
  selected: string[]
  onToggle: (value: string) => void
  label?: (value: string) => string
}) {
  if (!values.length) return <p className="filter-empty">Nothing to filter on yet.</p>
  return <>{values.map((item) => (
    <button
      key={item.value}
      type="button"
      className="option"
      aria-pressed={selected.includes(item.value)}
      onClick={() => onToggle(item.value)}
    >
      <span className="box"><Check aria-hidden="true" /></span>
      <span className="label">{label ? label(item.value) : item.value}</span>
      <span className="n">{item.count}</span>
    </button>
  ))}</>
}
