// Tabs that behave like tabs.
//
// Three places already declared role="tablist" with role="tab" and nothing
// else: no aria-controls, no panel, no keyboard handling. That is worse than
// plain buttons — it promises a screen reader a widget and then does not
// deliver one, so the user is told "tab 2 of 4" and then finds the arrow keys
// do nothing. Either complete the pattern or drop the roles; this completes it,
// once, for every caller.
//
// Follows the APG tabs pattern: arrow keys move between tabs, Home and End jump
// to the ends, only the selected tab is in the tab order (roving tabindex), and
// each panel is labelled by the tab that controls it.
import { useRef, type KeyboardEvent, type ReactNode } from 'react'

export type TabDefinition<Id extends string> = {
  id: Id
  label: ReactNode
  /** A count or badge shown after the label. */
  badge?: ReactNode
}

export function TabList<Id extends string>({ tabs, active, onChange, label, className = 'radar-tabs' }: {
  tabs: TabDefinition<Id>[]
  active: Id
  onChange: (id: Id) => void
  /** Names the set for assistive technology — "What matched", not "Tabs". */
  label: string
  className?: string
}) {
  const list = useRef<HTMLDivElement>(null)

  const focusTab = (index: number) => {
    const wrapped = (index + tabs.length) % tabs.length
    onChange(tabs[wrapped].id)
    // The newly selected tab is the only one in the tab order, so focus has to
    // follow selection or the keyboard user is left on a tabIndex -1 element.
    list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[wrapped]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const current = tabs.findIndex((tab) => tab.id === active)
    if (event.key === 'ArrowRight') { event.preventDefault(); focusTab(current + 1) }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); focusTab(current - 1) }
    else if (event.key === 'Home') { event.preventDefault(); focusTab(0) }
    else if (event.key === 'End') { event.preventDefault(); focusTab(tabs.length - 1) }
  }

  return <div ref={list} className={className} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        role="tab"
        id={`tab-${tab.id}`}
        // Only the selected panel is mounted, and aria-controls must point at an
        // element that exists — pointing at an unmounted id is invalid ARIA and
        // some screen readers announce nothing at all for it.
        aria-controls={tab.id === active ? `panel-${tab.id}` : undefined}
        aria-selected={tab.id === active}
        tabIndex={tab.id === active ? 0 : -1}
        onClick={() => onChange(tab.id)}
      >
        {tab.label}
        {/* The space matters: without it the accessible name comes out as
            "Publications3" rather than "Publications 3". */}
        {tab.badge !== undefined && <>{' '}<b>{tab.badge}</b></>}
      </button>
    ))}
  </div>
}

export function TabPanel({ id, active, children }: {
  id: string
  active: boolean
  children: ReactNode
}) {
  // Kept in the DOM but hidden when inactive would mean the hidden panels are
  // still reachable by search; unmounting is simpler and matches how these
  // panels already worked.
  if (!active) return null
  return <div
    role="tabpanel"
    id={`panel-${id}`}
    aria-labelledby={`tab-${id}`}
    // A panel whose content is scrollable must be focusable, and the APG
    // recommends it generally so the panel is reachable straight after its tab.
    tabIndex={0}
  >
    {children}
  </div>
}
