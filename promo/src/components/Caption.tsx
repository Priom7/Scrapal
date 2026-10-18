// The banner system in motion (guidelines p.05): kicker, headline, one short
// supporting sentence. Lead with a 2–4 word concept, break lines on purpose,
// highlight one phrase only in brand blue.
import type { LucideIcon } from 'lucide-react'
import { exit, progress } from '../anim'
import { C, FONT } from '../theme'
import { IconTile } from './ui'

export function Caption({
  frame,
  inAt = 0,
  outAt,
  kicker,
  icon,
  lines,
  highlight,
  support,
  size = 76,
  width = 600,
  align = 'left',
  tone = 'light',
}: {
  frame: number
  inAt?: number
  /** First frame of the exit. Omit to hold. */
  outAt?: number
  kicker?: string
  icon?: LucideIcon
  lines: string[]
  /** The one phrase set in brand blue. Must appear verbatim in `lines`. */
  highlight?: string
  support?: string
  size?: number
  width?: number
  align?: 'left' | 'center'
  tone?: 'light' | 'dark'
}) {
  const leave = outAt == null ? 0 : progress(frame, outAt, 16, exit)
  const ink = tone === 'dark' ? C.darkInk : C.ink
  const soft = tone === 'dark' ? C.darkInkSoft : C.inkSoft

  const kickerP = progress(frame, inAt, 22)
  const supportP = progress(frame, inAt + 14 + lines.length * 5, 26)

  return <div style={{
    width, display: 'grid', gap: size * 0.3,
    justifyItems: align === 'center' ? 'center' : 'start',
    textAlign: align,
    opacity: 1 - leave,
    transform: `translateY(${-leave * 24}px)`,
  }}>
    {kicker && <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      opacity: kickerP, transform: `translateX(${(1 - kickerP) * -18}px)`,
    }}>
      {icon && <IconTile icon={icon} size={46} />}
      <span style={{ color: C.blue, font: `600 23px/1 ${FONT}`, letterSpacing: '0.01em' }}>{kicker}</span>
    </div>}

    <h2 style={{ margin: 0, color: ink, font: `700 ${size}px/1.04 ${FONT}`, letterSpacing: '-0.035em' }}>
      {lines.map((line, index) => {
        const p = progress(frame, inAt + 6 + index * 5, 30)
        return <span key={index} style={{ display: 'block', overflow: 'hidden', paddingBottom: size * 0.1, marginBottom: -size * 0.1 }}>
          <span style={{ display: 'block', transform: `translateY(${(1 - p) * 105}%)`, opacity: Math.min(1, p * 1.6) }}>
            {paint(line, highlight)}
          </span>
        </span>
      })}
    </h2>

    {support && <p style={{
      margin: 0, maxWidth: width, color: soft,
      font: `400 ${Math.round(size * 0.37)}px/1.5 ${FONT}`, letterSpacing: '-0.005em',
      opacity: supportP, transform: `translateY(${(1 - supportP) * 16}px)`,
    }}>{support}</p>}
  </div>
}

function paint(line: string, highlight?: string) {
  if (!highlight || !line.includes(highlight)) return line
  const [before, after] = line.split(highlight)
  return <>{before}<span style={{ color: C.blue }}>{highlight}</span>{after}</>
}
