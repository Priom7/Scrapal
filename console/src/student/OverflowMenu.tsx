// One overflow control, used wherever a surface has secondary actions. Rows of
// competing buttons make a card look busy and hide which action is the point;
// this keeps the primary action visible and puts the rest one tap away.
import { MoreHorizontal } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ICON } from '../lib'

export type MenuItem = {
  label: string
  icon: ReactNode
  onSelect: () => void
  /** Destructive actions are set apart and placed last. */
  danger?: boolean
}

export function OverflowMenu({ items, label = 'More options', align = 'right' }: {
  items: MenuItem[]
  label?: string
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const away = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  if (!items.length) return null

  return <div className="more-menu" ref={wrapper}>
    <button
      type="button"
      className="icon-action"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? id : undefined}
      onClick={(event) => { event.stopPropagation(); setOpen(!open) }}
    >
      <MoreHorizontal size={ICON.md} />
    </button>
    {open && (
      <div className={`more-pop ${align}`} id={id} role="menu">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={item.danger ? 'danger' : ''}
            onClick={(event) => {
              event.stopPropagation()
              setOpen(false)
              item.onSelect()
            }}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>
    )}
  </div>
}
