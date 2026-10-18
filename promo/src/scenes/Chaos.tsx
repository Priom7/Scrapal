// 0:00–0:10 — the problem. Tabs, half-remembered numbers and advice nobody can
// check pile up in the dark while the narrator names them; then every fragment
// is pulled into one point of light, which is where Scrapal begins.
import { Globe, MessageCircle, X } from 'lucide-react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { exit, glide, map, pop, progress, rand } from '../anim'
import { Cues, type Cue } from '../components/Sfx'
import { Thread } from '../components/Thread'
import { FPS, s } from '../timeline'
import { vo, voEnd } from '../vo'
import { C, FONT } from '../theme'

/** Where the fragments converge: the centre of the logo in the next scene. */
export const FOCUS = { x: 960, y: 500 }

type Fragment = {
  kind: 'tab' | 'agent' | 'note'
  text: string
  x: number
  y: number
  depth: number
  rot: number
  at: number
  accent: string
}

// Hand-placed so the centre stays clear for the headline. x/y are the card's
// centre on the 1920×1080 frame; depth scales and slows the far ones.
const FRAGMENTS: Fragment[] = [
  { kind: 'tab', text: 'MSc Data Science — Fees 2026/27', x: 330, y: 120, depth: 1, rot: -2, at: 0.25, accent: C.blue },
  { kind: 'note', text: '6.5 or 7.0?', x: 205, y: 300, depth: 0.9, rot: -5, at: 0.9, accent: C.sky },
  { kind: 'tab', text: 'IELTS requirements · FAQ', x: 930, y: 92, depth: 0.85, rot: 1.5, at: 0.6, accent: C.sky },
  { kind: 'tab', text: 'Student visa: proof of funds', x: 1560, y: 150, depth: 1, rot: 2.5, at: 0.45, accent: C.cyan },
  { kind: 'agent', text: 'Trust me, the fee is £12,000.', x: 1600, y: 330, depth: 1.05, rot: 2, at: 1.4, accent: C.amber },
  { kind: 'note', text: '£14k? £17.5k?', x: 1690, y: 545, depth: 0.95, rot: 4, at: 2.1, accent: C.amber },
  { kind: 'tab', text: 'Cost of living in London', x: 250, y: 770, depth: 1, rot: 2, at: 1.1, accent: C.mint },
  { kind: 'agent', text: 'Scholarship is guaranteed — just pay the deposit today!', x: 1450, y: 800, depth: 1.05, rot: -2.5, at: 2.4, accent: C.amber },
  { kind: 'tab', text: 'Course page (archived 2023)', x: 880, y: 985, depth: 0.85, rot: -1.5, at: 1.8, accent: C.blue },
  { kind: 'note', text: 'Which intake?', x: 560, y: 245, depth: 0.8, rot: 3, at: 2.7, accent: C.sky },
  { kind: 'note', text: 'Deadline moved?', x: 170, y: 560, depth: 0.95, rot: -3, at: 3.0, accent: C.mint },
  { kind: 'tab', text: 'Is this university legit? · Forum', x: 1290, y: 245, depth: 0.8, rot: -2, at: 3.2, accent: C.blue },
  { kind: 'tab', text: 'Scholarships for international students', x: 420, y: 950, depth: 0.95, rot: 1, at: 3.4, accent: C.emerald },
  { kind: 'note', text: 'Can I actually get in?', x: 1330, y: 965, depth: 0.9, rot: 2, at: 3.6, accent: C.sky },
  { kind: 'agent', text: 'Deadline is end of August, don’t worry.', x: 330, y: 420, depth: 0.85, rot: -1.5, at: 3.75, accent: C.amber },
  { kind: 'tab', text: 'Entry requirements (PDF, 41 pages)', x: 1660, y: 690, depth: 0.85, rot: -3, at: 3.9, accent: C.cyan },
  { kind: 'note', text: 'Is this page even current?', x: 1560, y: 450, depth: 0.75, rot: -2, at: 4.1, accent: C.mint },
  { kind: 'tab', text: 'Living costs vs visa funds??', x: 1090, y: 335, depth: 0.75, rot: 2, at: 4.25, accent: C.mint },
  { kind: 'note', text: 'Which one is right?', x: 720, y: 335, depth: 0.7, rot: -2, at: 4.4, accent: C.blue },
  { kind: 'tab', text: 'Supervisors in fraud detection', x: 960, y: 820, depth: 0.7, rot: 1, at: 4.5, accent: C.blue },
]

/** The pile keeps growing until the narrator reaches "Advice you can't check". */
const APPEAR_STRETCH = 1.38
const appearAt = (fragment: Fragment) => s(fragment.at * APPEAR_STRETCH)

/** The pull starts as the last line lands; arrivals spread so threads keep
    landing until the light comes up at the cut. */
const COLLAPSE_AT = 7.6
const collapseStart = (index: number) => s(COLLAPSE_AT + index * 0.04 + rand(index) * 0.2)
const COLLAPSE_FOR = 1.0

export function Chaos() {
  const frame = useCurrentFrame()

  // A slow push-in over the whole scene, so the pile feels like it is closing in.
  const push = map(frame, [0, s(COLLAPSE_AT)], [1, 1.07])

  return <AbsoluteFill style={{ fontFamily: FONT }}>
    <AbsoluteFill style={{ transform: `scale(${push})` }}>
      {FRAGMENTS.map((fragment, index) => <FragmentCard key={index} fragment={fragment} index={index} frame={frame} />)}
    </AbsoluteFill>

    {/* The threads: each fragment, shrunk to a node, runs into the light. */}
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      {FRAGMENTS.map((fragment, index) => {
        const c = progress(frame, collapseStart(index), s(COLLAPSE_FOR), glide)
        if (c <= 0) return null
        const d = curve(fragment, index)
        return <Thread
          key={index}
          d={d}
          from={Math.max(0, c * 1.25 - 0.45)}
          to={c}
          width={4.2 * fragment.depth}
          colors={[fragment.accent, C.sky, C.mint]}
          nodeScale={1.6}
          opacity={map(c, [0.92, 1], [1, 0])}
        />
      })}
    </svg>

    <Headline frame={frame} />

    <Flash frame={frame} />
    <Cues cues={CUES} />
  </AbsoluteFill>
}

/** A gentle S-curve from the fragment to the focus point. */
function curve(fragment: Fragment, index: number) {
  const { x, y } = fragment
  const bend = (rand(index + 7) - 0.5) * 380
  const mx = (x + FOCUS.x) / 2 + bend * ((FOCUS.y - y) / 900)
  const my = (y + FOCUS.y) / 2 + bend * ((x - FOCUS.x) / 1400)
  return `M ${x} ${y} Q ${mx} ${my} ${FOCUS.x} ${FOCUS.y}`
}

function FragmentCard({ fragment, index, frame }: { fragment: Fragment; index: number; frame: number }) {
  const appear = pop(frame, appearAt(fragment), { damping: 15, stiffness: 140 })
  // Cards shrink into their node in the first fifth of the thread's run.
  const gone = progress(frame, collapseStart(index), s(0.32), exit)
  if (appear <= 0.001 || gone >= 1) return null

  const t = frame / FPS
  const floatX = Math.sin(t * 0.6 + index * 1.7) * 9 * fragment.depth
  const floatY = Math.cos(t * 0.5 + index * 2.3) * 11 * fragment.depth
  const scale = fragment.depth * (0.86 + 0.14 * appear) * (1 - gone * 0.85)
  const dim = 0.42 + 0.58 * fragment.depth

  return <div style={{
    position: 'absolute', left: fragment.x + floatX, top: fragment.y + floatY,
    transform: `translate(-50%, -50%) rotate(${fragment.rot}deg) scale(${scale})`,
    opacity: Math.min(1, appear) * dim * (1 - gone),
  }}>
    {fragment.kind === 'tab' && <TabCard text={fragment.text} accent={fragment.accent} />}
    {fragment.kind === 'agent' && <AgentBubble text={fragment.text} />}
    {fragment.kind === 'note' && <span style={{
      display: 'block', whiteSpace: 'nowrap', color: C.darkInk,
      font: `600 30px/1 ${FONT}`, letterSpacing: '-0.02em', opacity: 0.8,
    }}>{fragment.text}</span>}
  </div>
}

function TabCard({ text, accent }: { text: string; accent: string }) {
  return <div style={{
    display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap',
    padding: '13px 16px 13px 14px', borderRadius: 14,
    background: C.darkSurface2, border: `1px solid ${C.darkLine}`,
    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.35)',
    color: C.darkInk, font: `500 20px/1 ${FONT}`,
  }}>
    <span style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 7, background: accent, color: C.navy }}>
      <Globe size={15} strokeWidth={2.2} />
    </span>
    {text}
    <X size={16} color={C.darkInkSoft} style={{ marginLeft: 6 }} />
  </div>
}

function AgentBubble({ text }: { text: string }) {
  return <div style={{ display: 'grid', gap: 8, maxWidth: 380 }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.darkInkSoft, font: `600 15px/1 ${FONT}` }}>
      <MessageCircle size={15} /> Agent
    </span>
    <span style={{
      padding: '15px 18px', borderRadius: '18px 18px 18px 6px',
      background: '#1c2b38', border: `1px solid ${C.darkLine}`,
      color: C.darkInk, font: `500 21px/1.35 ${FONT}`,
      boxShadow: '0 18px 40px rgba(0, 0, 0, 0.35)',
    }}>{text}</span>
  </div>
}

function Headline({ frame }: { frame: number }) {
  // The words on screen are the words being said, as they are said.
  const first = [
    { text: 'Choosing where to study abroad', at: vo('chaos.tabs') },
    { text: 'starts with a hundred open tabs.', at: vo('chaos.tabs', 1.55) },
  ]
  const second = [
    { text: 'Fees that don’t match.', at: vo('chaos.fees') },
    { text: 'Deadlines that move.', at: vo('chaos.deadlines') },
    { text: 'Advice you can’t check.', at: vo('chaos.advice') },
  ]
  const firstOut = progress(frame, voEnd('chaos.tabs', -0.05), s(0.35), exit)
  const secondOut = progress(frame, voEnd('chaos.advice', 0.1), s(0.4), exit)

  const line = (text: string, at: number, out: number, size: number, color: string) => {
    const p = progress(frame, at - 3, s(0.5))
    return <span key={text} style={{ display: 'block', overflow: 'hidden', paddingBottom: 10, marginBottom: -10 }}>
      <span style={{
        display: 'block', color, font: `700 ${size}px/1.08 ${FONT}`, letterSpacing: '-0.035em',
        transform: `translateY(${(1 - p) * 100 - out * 40}%)`,
        opacity: Math.min(1, p * 1.5) * (1 - out),
      }}>{text}</span>
    </span>
  }

  return <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
    {/* A soft dark pool behind the words keeps them legible over the pile. */}
    <div style={{
      position: 'absolute', width: 1300, height: 520,
      background: 'radial-gradient(closest-side, rgba(10, 16, 22, 0.92), rgba(10, 16, 22, 0.6) 55%, transparent)',
      opacity: 1 - secondOut,
    }} />
    <div style={{ position: 'relative' }}>
      {firstOut < 1 && first.map((entry) => line(entry.text, entry.at, firstOut, 84, C.darkInk))}
    </div>
    <div style={{ position: 'absolute' }}>
      {frame >= vo('chaos.fees') - 4 && second.map((entry, index) => line(entry.text, entry.at, secondOut, 76, index === 2 ? '#ffffff' : C.darkInkSoft))}
    </div>
  </AbsoluteFill>
}

/** Everything lands in one point, which swells into the light of the next scene. */
export function Flash({ frame, gatherAt = 8.3, ringsAt = 8.6, swellAt = 9.55 }: {
  frame: number
  /** Seconds into the scene: the point starts to gather, the rings pull, it swells into light. */
  gatherAt?: number
  ringsAt?: number
  swellAt?: number
}) {
  const gather = progress(frame, s(gatherAt), s(1.3), glide)
  const swell = progress(frame, s(swellAt), s(0.45))
  if (gather <= 0) return null
  const r = 6 + gather * 16 + swell * 120
  // Rings drawing inward: the pull everything is caught in.
  const ringsFrom = s(ringsAt)
  const rings = [0, 1, 2].map((i) => {
    const cycle = ((frame - ringsFrom) / s(0.5) + i / 3) % 1
    return { r: 260 * (1 - cycle) + 18, o: frame < ringsFrom ? 0 : Math.sin(cycle * Math.PI) * 0.5 * (1 - swell) }
  })
  return <>
    {rings.map((ring, i) => <div key={i} style={{
      position: 'absolute', left: FOCUS.x - ring.r, top: FOCUS.y - ring.r, width: ring.r * 2, height: ring.r * 2,
      borderRadius: '50%', border: `2px solid ${C.sky}`, opacity: ring.o,
    }} />)}
    <div style={{
    position: 'absolute', left: FOCUS.x - r * 3, top: FOCUS.y - r * 3, width: r * 6, height: r * 6,
    borderRadius: '50%',
    background: `radial-gradient(circle, rgba(255,255,255,${0.95}) 0%, rgba(214,226,255,0.85) ${10 + swell * 10}%, rgba(70,92,255,${0.35 * gather}) 28%, transparent 62%)`,
  }} />
  </>
}

const CUES: Cue[] = [
  ...FRAGMENTS.map((fragment) => ({ at: appearAt(fragment), name: 'pop-low' as const, volume: 0.05 + 0.08 * fragment.depth })),
  ...['chaos.fees', 'chaos.deadlines', 'chaos.advice'].map((id) => ({ at: vo(id) - 3, name: 'whoosh-soft' as const, volume: 0.16 })),
  ...[0, 5, 10, 15].map((index) => ({ at: collapseStart(index), name: 'thread' as const, volume: 0.13 })),
]
