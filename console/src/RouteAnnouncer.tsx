// Tells a screen reader that the page changed.
//
// This is a single-page app: activating a nav item swaps the whole view but
// never reloads, so none of the announcements a browser normally makes on
// navigation happen. Measured before writing this — after clicking through to
// another section the only live region on the page was empty, meaning a screen
// reader user got silence and no way to tell whether anything had happened.
//
// Focus is deliberately left where it was. Moving it to the new heading is the
// other accepted fix, but it strands a keyboard user who was part-way down the
// nav and wanted to carry on; announcing the change gives the same information
// without taking control away.
import { useEffect, useRef, useState } from 'react'
import { useLocation } from './router'

export function RouteAnnouncer() {
  const path = useLocation()
  const [message, setMessage] = useState('')
  const first = useRef(true)

  useEffect(() => {
    // The first render is an ordinary page load, which the browser already
    // announces on its own.
    if (first.current) { first.current = false; return }
    // The new view has to render before it has a heading to read.
    const timer = window.setTimeout(() => {
      const heading = document.querySelector('h1')?.textContent?.trim()
      setMessage(heading ? `${heading}. Page changed.` : 'Page changed.')
    }, 150)
    return () => window.clearTimeout(timer)
  }, [path])

  // role="status" carries an implicit aria-live="polite"; both are given
  // explicitly because older screen readers honour one or the other.
  return <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{message}</div>
}
