// The Scrapal mark, animated from the master artwork's own geometry.
//
// The reveal tells the logo's story in the order it was drawn: the threads run
// (crawl), the nodes light (extract), the globe → document → search → spark →
// cube icons appear (find, read, check, understand, structure) and the wordmark
// follows. Every part ends exactly where the master file puts it, at full
// opacity and scale, so the resting state *is* the supplied logo.
//
// Idle motion copies scrapal-logo-animated.svg: node pulses and white data
// particles travelling along the threads.
import { evolvePath, getLength, getPointAtLength } from '@remotion/paths'
import { useId, type CSSProperties } from 'react'
import { map, pop, progress } from '../anim'
import { FPS } from '../timeline'
import { ICON_VIEWBOX, LOGO_PARTS, type LogoPart } from './logo-data'

const byId = Object.fromEntries(LOGO_PARTS.map((part) => [part.id, part])) as Record<string, LogoPart>

/** Seconds after the reveal starts at which each part arrives. */
const THREADS: Record<string, [start: number, duration: number]> = {
  path6: [0.0, 0.55],
  path7: [0.12, 0.55],
  path8: [0.24, 0.55],
  path10: [0.36, 0.55],
}
const NODES: Record<string, number> = {
  circle6: 0.0, circle8: 0.12, circle11: 0.36, circle9: 0.42, circle7: 0.5, circle10: 0.74,
  circle12: 0.2, circle13: 0.26, circle14: 0.4,
  // The pipeline row reads left to right, through the spark.
  circle15: 0.62, circle16: 0.66, circle17: 0.7, circle18: 0.74,
  circle26: 0.9, circle19: 0.94, circle20: 0.98, circle21: 1.02,
}
const ICONS: Record<string, number> = { g22: 0.45, g24: 0.58, g25: 0.71, g29: 0.95 }
const SPARK_AT = 0.86
const WORDMARK: [number, number] = [0.95, 0.85]
/** When the reveal is complete, in seconds. */
export const LOGO_REVEAL_SECONDS = WORDMARK[0] + WORDMARK[1]

/** The big thread nodes that breathe in the animated master. */
const PULSING = ['circle6', 'circle7', 'circle8', 'circle9', 'circle10', 'circle11']
const PULSE_DELAY: Record<string, number> = { circle6: 0, circle7: 0.12, circle8: 0.24, circle9: 0.48, circle10: 0.7, circle11: 0.9 }
const PARTICLE_PATHS = ['path6', 'path7', 'path8', 'path10']
const LENGTHS = Object.fromEntries(PARTICLE_PATHS.map((id) => [id, getLength(byId[id].d)]))

const LOCKUP_VIEWBOX = '39 23 905 320'
const ICON_BOX = `${ICON_VIEWBOX.x} ${ICON_VIEWBOX.y} ${ICON_VIEWBOX.width} ${ICON_VIEWBOX.height}`

/** Aspect ratios, for laying the mark out before it renders. */
export const LOCKUP_RATIO = 905 / 320
export const ICON_RATIO = ICON_VIEWBOX.width / ICON_VIEWBOX.height

const inPlace = (transform: string): CSSProperties => ({
  transformBox: 'fill-box',
  transformOrigin: 'center',
  transform,
})

export function Logo({
  frame,
  width,
  variant = 'lockup',
  revealed = false,
  idleFrom,
  style,
}: {
  /** Local frame; 0 is the first frame of the reveal. */
  frame: number
  width: number
  variant?: 'lockup' | 'icon'
  /** Skip the reveal and show the resting artwork. */
  revealed?: boolean
  /** Frame from which the idle pulse and particles run. Omit for a still mark. */
  idleFrom?: number
  style?: CSSProperties
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const id = (name: string) => `${name}-${uid}`
  const t = (seconds: number) => seconds * FPS
  const at = (seconds: number) => (revealed ? -1e6 : t(seconds))

  const idle = idleFrom == null ? 0 : progress(frame, idleFrom, t(0.6))
  const idleTime = idleFrom == null ? 0 : Math.max(0, frame - idleFrom) / FPS

  const isIcon = variant === 'icon'
  const height = isIcon ? width / ICON_RATIO : width / LOCKUP_RATIO

  const renderPart = (part: LogoPart, extra?: CSSProperties, strokeDash?: { strokeDasharray: string; strokeDashoffset: number }) => (
    <path
      key={part.id}
      d={part.d}
      fill={part.fill?.startsWith('url(') ? `url(#${id(part.fill.slice(5, -1))})` : part.fill ?? 'none'}
      stroke={part.stroke?.startsWith('url(') ? `url(#${id(part.stroke.slice(5, -1))})` : part.stroke ?? undefined}
      strokeWidth={part.strokeWidth ?? undefined}
      strokeLinecap={part.linecap ?? undefined}
      strokeLinejoin={part.linejoin ?? undefined}
      opacity={part.opacity}
      style={extra}
      {...strokeDash}
    />
  )

  const thread = (partId: string) => {
    const [start, duration] = THREADS[partId]
    const p = progress(frame, at(start), t(duration))
    if (p <= 0) return null
    const dash = p >= 1 ? undefined : evolvePath(p, byId[partId].d)
    return renderPart(byId[partId], undefined, dash)
  }

  const node = (partId: string) => {
    const s = pop(frame, at(NODES[partId]), { damping: 11, stiffness: 210, mass: 0.7 })
    if (s <= 0.001) return null
    const pulse = PULSING.includes(partId)
      ? 1 + 0.035 * idle * Math.sin(((idleTime - PULSE_DELAY[partId]) / 2.1) * Math.PI * 2)
      : 1
    return renderPart(byId[partId], inPlace(`scale(${s * pulse})`))
  }

  const icon = (groupId: string) => {
    const parts = LOGO_PARTS.filter((part) => part.group === groupId)
    const s = pop(frame, at(ICONS[groupId]), { damping: 13, stiffness: 180 })
    if (s <= 0.001) return null
    return <g key={groupId} transform={parts[0].transform ?? undefined}>
      <g style={{ ...inPlace(`scale(${0.55 + 0.45 * s})`), opacity: Math.min(1, s * 1.4) }}>
        {parts.map((part) => renderPart(part))}
      </g>
    </g>
  }

  const spark = () => {
    const s = pop(frame, at(SPARK_AT), { damping: 10, stiffness: 160 })
    if (s <= 0.001) return null
    const breathe = idle * Math.sin(((idleTime - 0.75) / 1.8) * Math.PI * 2)
    return renderPart(byId.path26, inPlace(`rotate(${(1 - s) * -120 + breathe * 9}deg) scale(${s * (1 + breathe * 0.07)})`))
  }

  const wordmarkP = progress(frame, at(WORDMARK[0]), t(WORDMARK[1]))
  const edge = 340 + wordmarkP * (960 - 340 + 160)

  const particles = idle > 0 && PARTICLE_PATHS.map((partId, index) => {
    const phase = ((idleTime - index * 0.65) / 2.6) % 1
    if (idleTime < index * 0.65) return null
    const length = LENGTHS[partId]
    const point = getPointAtLength(byId[partId].d, phase * length)
    if (!point) return null
    const fade = map(phase, [0, 0.12], [0, 1]) * map(phase, [0.82, 1], [1, 0])
    return <circle key={partId} cx={point.x} cy={point.y} r={4.3} fill="#ffffff" opacity={0.95 * fade * idle} />
  })

  return <svg
    width={width}
    height={height}
    viewBox={isIcon ? ICON_BOX : LOCKUP_VIEWBOX}
    style={{ overflow: 'visible', display: 'block', ...style }}
    aria-label="Scrapal"
  >
    <defs>
      <linearGradient id={id('threadBlue')} x1="50" y1="70" x2="275" y2="185" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#465CFF" /><stop offset="1" stopColor="#3FA7E8" />
      </linearGradient>
      <linearGradient id={id('threadMint')} x1="115" y1="185" x2="285" y2="295" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#34A8D8" /><stop offset="1" stopColor="#42CFA0" />
      </linearGradient>
      <linearGradient id={id('threadLower')} x1="60" y1="300" x2="285" y2="235" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#20C998" /><stop offset="1" stopColor="#42CFA0" />
      </linearGradient>
      <linearGradient id={id('wordFade')} x1={edge - 160} x2={edge} y1="0" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fff" stopOpacity="1" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <mask id={id('wordMask')} maskUnits="userSpaceOnUse" x="300" y="60" width="700" height="260">
        <rect x="300" y="60" width="700" height="260" fill={`url(#${id('wordFade')})`} />
      </mask>
    </defs>

    {Object.keys(THREADS).map(thread)}
    {Object.keys(ICONS).map(icon)}
    {spark()}
    {Object.keys(NODES).map(node)}
    {particles}

    {!isIcon && wordmarkP > 0 && (
      <g mask={wordmarkP < 1 ? `url(#${id('wordMask')})` : undefined}>
        <g transform={`translate(${(1 - wordmarkP) * -26} 0)`}>
          {renderPart(byId.text29)}
        </g>
      </g>
    )}
  </svg>
}
