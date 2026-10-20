// A page inside an app window. Neighbouring pages overlap by a few frames —
// the old one settles out as the new one rises in — so the window is never
// empty between them.
import type { ReactNode } from 'react'
import { exit, glide, progress } from '../anim'

const OVERLAP = 6

export function Beat({ frame, from, to, first, last, children }: {
  frame: number
  from: number
  to: number
  first?: boolean
  last?: boolean
  /** Renders the page at its own clock: frame 0 is the page's first frame. */
  children: (localFrame: number) => ReactNode
}) {
  if (frame < from - (first ? 0 : OVERLAP) || frame >= to + (last ? 0 : OVERLAP)) return null
  const inP = first ? 1 : progress(frame, from - OVERLAP, 18, glide)
  const outP = last ? 0 : progress(frame, to - 10, 16, exit)
  return <div style={{
    position: 'absolute', inset: 0,
    opacity: inP * (1 - outP),
    transform: `translateY(${(1 - inP) * 18 - outP * 10}px)`,
  }}>
    {children(frame - from)}
  </div>
}
