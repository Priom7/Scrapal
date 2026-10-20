// 1:38–1:44 — everything at once. Eight tiles, one per feature, strung on a
// single thread that runs through them in an S — the mark's own shape — then
// gathered into the point the logo draws from.
import {
  BellRing, Coins, FileSearch, FileText, ListChecks, MessagesSquare,
  Radar, ShieldQuestion, type LucideIcon,
} from 'lucide-react'
import { getLength } from '@remotion/paths'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { exit, glide, pop, progress } from '../anim'
import { Caption } from '../components/Caption'
import { Cues, type Cue } from '../components/Sfx'
import { Thread } from '../components/Thread'
import { IconTile } from '../components/ui'
import { s } from '../timeline'
import { STUDENT_VOICE, type Voice } from '../vo'
import { C, FONT, R, SHADOW } from '../theme'

/** Where the outro's logo draws from. */
export const GATHER = { x: 960, y: 470 }

export type Tile = { icon: LucideIcon; title: string; sub: string }

/** The student film's eight features. Any film passes exactly eight: the S-thread is laid out for them. */
const TILES: Tile[] = [
  { icon: MessagesSquare, title: 'Plan', sub: 'From question to shortlist' },
  { icon: ListChecks, title: 'Match', sub: 'Every gap named' },
  { icon: FileSearch, title: 'Evidence', sub: 'Every figure sourced' },
  { icon: Coins, title: 'Money', sub: 'The whole cost, upfront' },
  // Second row runs right to left, so the thread turns like the S.
  { icon: ShieldQuestion, title: 'Check', sub: 'Claims checked' },
  { icon: BellRing, title: 'Watch', sub: 'Changes flagged' },
  { icon: Radar, title: 'Radar', sub: 'Research matched' },
  { icon: FileText, title: 'Apply', sub: 'Applications, organised' },
]

const W = 330
const H = 196
const GAP = 28
const LEFT = (1920 - (W * 4 + GAP * 3)) / 2
const TOP = 372

function slot(index: number) {
  const row = index < 4 ? 0 : 1
  const col = row === 0 ? index : 7 - index
  return { x: LEFT + col * (W + GAP), y: TOP + row * (H + GAP), row, col }
}

// The thread enters at the left, runs along the top row, turns down the right
// side and comes back along the bottom row: centres of the tiles, in order.
const CENTRES = TILES.map((_, i) => ({ x: slot(i).x + W / 2, y: slot(i).y + H / 2 }))
const TURN = LEFT + W * 4 + GAP * 3 + 70
const SEGMENTS = [
  `M ${LEFT - 120} ${CENTRES[0].y}`,
  `L ${CENTRES[3].x} ${CENTRES[3].y}`,
  `C ${TURN} ${CENTRES[3].y}, ${TURN} ${CENTRES[4].y}, ${CENTRES[4].x} ${CENTRES[4].y}`,
  `L ${CENTRES[7].x} ${CENTRES[7].y}`,
  `L ${LEFT - 120} ${CENTRES[7].y}`,
]
const PATH = SEGMENTS.join(' ')

/** Fraction along PATH at which the thread reaches each tile's centre. */
const REACH = (() => {
  const total = getLength(PATH)
  const toTop = (i: number) => CENTRES[i].x - (LEFT - 120)
  const toTurn = getLength(SEGMENTS.slice(0, 3).join(' '))
  return CENTRES.map((c, i) => (i < 4 ? toTop(i) : toTurn + (CENTRES[4].x - c.x)) / total)
})()
const DRAW_AT = 0.25
const DRAW_FOR = 2.1
const GATHER_AT = 5.0

export function Montage({ tiles = TILES, title = 'One place for the whole journey.', highlight = 'the whole journey.', voice = STUDENT_VOICE, lineId = 'montage.one' }: {
  tiles?: Tile[]
  title?: string
  /** The phrase of the title set in brand blue. */
  highlight?: string
  voice?: Voice
  lineId?: string
}) {
  const frame = useCurrentFrame()
  const draw = progress(frame, s(DRAW_AT), s(DRAW_FOR), glide)
  const gather = (i: number) => progress(frame, s(GATHER_AT + (7 - i) * 0.035), s(0.6), glide)
  const titleOut = progress(frame, s(GATHER_AT - 0.1), s(0.4), exit)
  const threadOut = progress(frame, s(GATHER_AT - 0.2), s(0.5), exit)
  const flowing = frame > s(DRAW_AT + DRAW_FOR * 0.6)

  return <AbsoluteFill style={{ fontFamily: FONT }}>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 150, display: 'flex', justifyContent: 'center', opacity: 1 - titleOut }}>
      <Caption frame={frame} inAt={voice.vo(lineId) - 4} lines={[title]} highlight={highlight} size={72} width={1500} align="center" />
    </div>

    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      <Thread
        d={PATH}
        to={draw}
        from={threadOut}
        width={6}
        nodeScale={1.6}
        opacity={0.95}
        particles={flowing ? [0, 1, 2, 3, 4].map((k) => ((frame - s(1.5)) / s(2.4) + k / 5) % 1) : []}
      />
    </svg>

    {tiles.map((tile, index) => {
      const { x, y } = slot(index)
      // glide eases the draw, so time-at-fraction is not linear; 0.82 keeps each tile just ahead of the head.
      const reachAt = DRAW_AT + REACH[index] * DRAW_FOR * 0.82
      const p = pop(frame, s(reachAt), { damping: 14, stiffness: 170 })
      const g = gather(index)
      const cx = x + W / 2
      const cy = y + H / 2
      const tx = (GATHER.x - cx) * g
      const ty = (GATHER.y - cy) * g
      if (p <= 0.001) return null
      return <div key={tile.title} style={{
        position: 'absolute', left: x, top: y, width: W, height: H, padding: '24px 26px',
        borderRadius: R.card, background: C.surface, border: `1px solid ${C.line}`, boxShadow: SHADOW.lift,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        opacity: Math.min(1, p * 1.5) * (1 - g ** 3),
        transform: `translate(${tx}px, ${ty}px) scale(${(0.82 + 0.18 * p) * (1 - g * 0.86)})`,
      }}>
        <IconTile icon={tile.icon} size={62} />
        <div style={{ display: 'grid', gap: 8 }}>
          <span style={{ color: C.ink, font: `700 31px/1 ${FONT}`, letterSpacing: '-0.025em' }}>{tile.title}</span>
          <span style={{ color: C.inkSoft, font: `400 19px/1.2 ${FONT}` }}>{tile.sub}</span>
        </div>
      </div>
    })}

    {/* Everything lands in one point; a ring answers it as the logo begins. */}
    {frame > s(GATHER_AT) && (() => {
      const landed = TILES.reduce((sum, _, i) => sum + gather(i), 0) / TILES.length
      const fade = 1 - progress(frame, s(GATHER_AT + 0.75), s(0.25))
      const r = 4 + landed * 16
      return <div style={{
        position: 'absolute', left: GATHER.x - r, top: GATHER.y - r, width: r * 2, height: r * 2, borderRadius: '50%',
        background: `radial-gradient(circle, ${C.sky}, ${C.blue})`, opacity: Math.min(1, landed * 3) * fade,
        boxShadow: `0 0 ${30 * landed}px rgba(70, 92, 255, 0.45)`,
      }} />
    })()}
    {frame > s(GATHER_AT + 0.5) && (() => {
      const ring = progress(frame, s(GATHER_AT + 0.55), s(0.45))
      const r = 10 + ring * 180
      return <div style={{
        position: 'absolute', left: GATHER.x - r, top: GATHER.y - r, width: r * 2, height: r * 2,
        borderRadius: '50%', border: `3px solid ${C.blue}`, opacity: (1 - ring) * 0.6,
      }} />
    })()}
    <Cues cues={CUES} />
  </AbsoluteFill>
}

const CUES: Cue[] = [
  { at: s(DRAW_AT), name: 'thread', volume: 0.2 },
  ...REACH.map((reach) => ({ at: s(DRAW_AT + reach * DRAW_FOR * 0.82), name: 'pop' as const, volume: 0.11 })),
  { at: s(GATHER_AT + 0.05), name: 'whoosh', volume: 0.3 },
]
