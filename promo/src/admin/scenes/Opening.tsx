// 0:00–0:12 — where answers come from. University pages float in the dark,
// and on cue they misbehave: on "Pages move" they jump and one turns into a
// 404; on "Fees change" a fee quietly flips. Then, as in the student film,
// every fragment is pulled along a thread into one point of light.
import { Globe, Lock } from 'lucide-react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { exit, glide, map, pop, progress, rand } from '../../anim'
import { Cues, type Cue } from '../../components/Sfx'
import { Thread } from '../../components/Thread'
import { FPS, s } from '../../timeline'
import { C, FONT } from '../../theme'
import { FOCUS, Flash } from '../../scenes/Chaos'
import { vo, voEnd } from '../film'

type Fragment = {
  kind: 'page' | 'note'
  x: number
  y: number
  depth: number
  rot: number
  at: number
  accent: string
  url?: string
  title?: string
  /** A labelled value on the page; `next` replaces `old` when the narrator says "Fees change". */
  value?: string
  old?: string
  next?: string
  /** What the page becomes when the narrator says "Pages move". */
  moved?: '404' | '301'
  text?: string
}

const FRAGMENTS: Fragment[] = [
  { kind: 'page', x: 330, y: 150, depth: 1, rot: -2, at: 0.2, accent: C.blue, url: 'northbridge.ac.uk/study/msc-data-science', title: 'MSc Data Science', value: 'Tuition', old: '£16,900', next: '£17,500' },
  { kind: 'page', x: 1590, y: 170, depth: 0.95, rot: 2, at: 0.6, accent: C.sky, url: 'northbridge.ac.uk/courses/data-science', title: 'Data Science (MSc)', moved: '404' },
  { kind: 'page', x: 300, y: 830, depth: 0.95, rot: 1.5, at: 1.1, accent: C.mint, url: 'lakeshore.ie/postgraduate/fees', title: 'Postgraduate fees', value: 'Apply by', old: '30 June', next: '15 June' },
  { kind: 'page', x: 1610, y: 830, depth: 1, rot: -2, at: 1.6, accent: C.cyan, url: 'ashford.ac.uk/study/applied-data', title: 'Applied Data Science', value: 'IELTS overall', old: '6.0', next: '6.5' },
  { kind: 'page', x: 960, y: 115, depth: 0.8, rot: 1, at: 2.2, accent: C.blue, url: 'northbridge.ac.uk/fees-2027.pdf', title: 'Fees and funding 2027/28' },
  { kind: 'page', x: 960, y: 975, depth: 0.82, rot: -1, at: 2.7, accent: C.emerald, url: 'northbridge.ac.uk/international/scholarships', title: 'International scholarships', moved: '301' },
  { kind: 'note', x: 190, y: 480, depth: 0.9, rot: -4, at: 3.1, accent: C.sky, text: 'Which page is current?' },
  { kind: 'note', x: 1720, y: 480, depth: 0.9, rot: 3, at: 3.5, accent: C.amber, text: '£16,900? £17,500?' },
  { kind: 'note', x: 640, y: 300, depth: 0.7, rot: 2, at: 3.9, accent: C.mint, text: 'Last checked: ?' },
  { kind: 'note', x: 1300, y: 305, depth: 0.7, rot: -2, at: 4.2, accent: C.blue, text: 'Redirected 3 times' },
  { kind: 'note', x: 640, y: 760, depth: 0.72, rot: -2, at: 4.6, accent: C.amber, text: 'Updated without notice' },
  { kind: 'note', x: 1290, y: 765, depth: 0.72, rot: 2, at: 4.9, accent: C.sky, text: 'Copied from an old brochure' },
]

const COLLAPSE_AT = 9.4
const collapseStart = (index: number) => s(COLLAPSE_AT + index * 0.05 + rand(index + 3) * 0.2)

export function Opening() {
  const frame = useCurrentFrame()
  const push = map(frame, [0, s(COLLAPSE_AT)], [1, 1.07])

  return <AbsoluteFill style={{ fontFamily: FONT }}>
    <AbsoluteFill style={{ transform: `scale(${push})` }}>
      {FRAGMENTS.map((fragment, index) => <Piece key={index} fragment={fragment} index={index} frame={frame} />)}
    </AbsoluteFill>

    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      {FRAGMENTS.map((fragment, index) => {
        const c = progress(frame, collapseStart(index), s(1.0), glide)
        if (c <= 0) return null
        return <Thread key={index} d={curve(fragment, index)} from={Math.max(0, c * 1.25 - 0.45)} to={c}
          width={4.4 * fragment.depth} colors={[fragment.accent, C.sky, C.mint]} nodeScale={1.6} opacity={map(c, [0.92, 1], [1, 0])} />
      })}
    </svg>

    <Headline frame={frame} />
    <Flash frame={frame} gatherAt={10.1} ringsAt={10.4} swellAt={11.55} />
    <Cues cues={CUES} />
  </AbsoluteFill>
}

function curve(fragment: Fragment, index: number) {
  const { x, y } = fragment
  const bend = (rand(index + 11) - 0.5) * 380
  const mx = (x + FOCUS.x) / 2 + bend * ((FOCUS.y - y) / 900)
  const my = (y + FOCUS.y) / 2 + bend * ((x - FOCUS.x) / 1400)
  return `M ${x} ${y} Q ${mx} ${my} ${FOCUS.x} ${FOCUS.y}`
}

function Piece({ fragment, index, frame }: { fragment: Fragment; index: number; frame: number }) {
  const appear = pop(frame, s(fragment.at), { damping: 15, stiffness: 140 })
  const gone = progress(frame, collapseStart(index), s(0.32), exit)
  if (appear <= 0.001 || gone >= 1) return null

  // "Pages move": the pages lurch sideways, the way a reorganised site breaks every link.
  const lurch = fragment.kind === 'page' ? pop(frame, vo('opening.move'), { damping: 12, stiffness: 160 }) : 0
  const lurchX = lurch * (index % 2 ? -36 : 36)
  const t = frame / FPS
  const floatX = Math.sin(t * 0.6 + index * 1.7) * 9 * fragment.depth
  const floatY = Math.cos(t * 0.5 + index * 2.3) * 11 * fragment.depth
  const scale = fragment.depth * (0.86 + 0.14 * appear) * (1 - gone * 0.85)

  return <div style={{
    position: 'absolute', left: fragment.x + floatX + lurchX, top: fragment.y + floatY,
    transform: `translate(-50%, -50%) rotate(${fragment.rot}deg) scale(${scale})`,
    opacity: Math.min(1, appear) * (0.42 + 0.58 * fragment.depth) * (1 - gone),
  }}>
    {fragment.kind === 'page' ? <PageCard fragment={fragment} frame={frame} /> : <span style={{
      display: 'block', whiteSpace: 'nowrap', color: C.darkInk, font: `600 30px/1 ${FONT}`, letterSpacing: '-0.02em', opacity: 0.8,
    }}>{fragment.text}</span>}
  </div>
}

function PageCard({ fragment, frame }: { fragment: Fragment; frame: number }) {
  const moved = fragment.moved ? progress(frame, vo('opening.move', 0.15), 10) : 0
  const changed = fragment.next ? progress(frame, vo('opening.change', 0.1), 10) : 0
  const flash = fragment.next ? Math.max(0, 1 - Math.abs(frame - vo('opening.change', 0.15)) / 18) : 0
  return <div style={{
    width: 380, borderRadius: 16, overflow: 'hidden',
    background: C.darkSurface2, border: `1px solid ${C.darkLine}`, boxShadow: '0 18px 40px rgba(0, 0, 0, 0.35)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#121c26', borderBottom: `1px solid ${C.darkLine}` }}>
      <span style={{ display: 'flex', gap: 5 }}>{['#ff5f57', '#febc2e', '#28c840'].map((c) => <i key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c, opacity: 0.55 }} />)}</span>
      <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 8, background: '#0b131b', color: C.darkInkSoft, font: `500 13px/1 ${FONT}`, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <Lock size={11} /> {fragment.url}
      </span>
    </div>
    <div style={{ position: 'relative', padding: '16px 18px 18px', display: 'grid', gap: 10 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 9, color: C.darkInk, font: `700 19px/1.1 ${FONT}` }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 6, background: fragment.accent, color: C.navy }}><Globe size={13} strokeWidth={2.3} /></span>
        {fragment.title}
      </span>
      <span style={{ height: 8, width: '88%', borderRadius: 4, background: '#22303d' }} />
      <span style={{ height: 8, width: '64%', borderRadius: 4, background: '#22303d' }} />
      {fragment.value && <span style={{
        position: 'relative', display: 'inline-flex', gap: 10, alignItems: 'center', justifySelf: 'start',
        padding: '6px 10px', borderRadius: 8, background: `rgba(228, 167, 44, ${0.08 + 0.3 * flash})`,
        color: C.darkInk, font: `700 18px/1 ${FONT}`,
      }}>
        <span style={{ color: C.darkInkSoft, fontWeight: 500 }}>{fragment.value}</span>
        <span style={{ textDecoration: changed > 0.5 ? 'line-through' : 'none', opacity: changed > 0.5 ? 0.45 : 1 }}>{fragment.old}</span>
        {changed > 0 && <span style={{ color: '#f0b74e', opacity: changed, transform: `translateX(${(1 - changed) * -8}px)` }}>→ {fragment.next}</span>}
      </span>}
      {fragment.moved && moved > 0 && <div style={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: `rgba(16, 24, 32, ${0.92 * moved})`,
      }}>
        <span style={{ opacity: moved, color: fragment.moved === '404' ? '#ff9b95' : '#f0b74e', font: `700 26px/1.2 ${FONT}`, textAlign: 'center' }}>
          {fragment.moved === '404' ? '404 · Page not found' : '301 · Moved permanently'}
        </span>
      </div>}
    </div>
  </div>
}

function Headline({ frame }: { frame: number }) {
  const first = [
    { text: 'Every answer a student trusts', at: vo('opening.sentence') },
    { text: 'begins as a sentence on someone else’s website.', at: vo('opening.sentence', 2.0) },
  ]
  const second = [
    { text: 'Pages move.', at: vo('opening.move') },
    { text: 'Fees change.', at: vo('opening.change') },
    { text: 'Nobody tells you.', at: vo('opening.tell') },
  ]
  const firstOut = progress(frame, voEnd('opening.sentence', -0.05), s(0.35), exit)
  const secondOut = progress(frame, voEnd('opening.tell', 0.15), s(0.4), exit)

  const line = (text: string, at: number, out: number, size: number, color: string) => {
    const p = progress(frame, at - 3, s(0.5))
    return <span key={text} style={{ display: 'block', overflow: 'hidden', paddingBottom: 10, marginBottom: -10 }}>
      <span style={{
        display: 'block', color, font: `700 ${size}px/1.08 ${FONT}`, letterSpacing: '-0.035em',
        transform: `translateY(${(1 - p) * 100 - out * 40}%)`, opacity: Math.min(1, p * 1.5) * (1 - out),
      }}>{text}</span>
    </span>
  }

  return <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
    <div style={{
      position: 'absolute', width: 1400, height: 520,
      background: 'radial-gradient(closest-side, rgba(10, 16, 22, 0.94), rgba(10, 16, 22, 0.62) 55%, transparent)',
      opacity: 1 - secondOut,
    }} />
    <div style={{ position: 'relative' }}>
      {firstOut < 1 && first.map((entry, i) => line(entry.text, entry.at, firstOut, i === 0 ? 84 : 64, i === 0 ? C.darkInk : C.darkInkSoft))}
    </div>
    <div style={{ position: 'absolute' }}>
      {frame >= vo('opening.move') - 4 && second.map((entry, index) => line(entry.text, entry.at, secondOut, 84, index === 2 ? '#ffffff' : C.darkInkSoft))}
    </div>
  </AbsoluteFill>
}

const CUES: Cue[] = [
  ...FRAGMENTS.map((fragment) => ({ at: s(fragment.at), name: 'pop-low' as const, volume: 0.05 + 0.08 * fragment.depth })),
  { at: vo('opening.move', 0.05), name: 'whoosh-soft', volume: 0.2 },
  { at: vo('opening.move', 0.15), name: 'alert', volume: 0.14 },
  { at: vo('opening.change', 0.1), name: 'highlight', volume: 0.18 },
  ...[0, 4, 8].map((index) => ({ at: collapseStart(index), name: 'thread' as const, volume: 0.13 })),
]
