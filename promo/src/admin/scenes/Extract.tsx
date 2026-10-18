// "Turn course pages into trusted facts" (Course intelligence). The captured
// page on the left, the typed facts on the right; on "tied to the exact
// sentence it was read from", a thread wires each value to its sentence —
// the console's field ledger, where every value carries its excerpt.
import { Link2, ScanText } from 'lucide-react'
import { glide, map, pop, progress, rise } from '../../anim'
import { CONTENT } from '../../components/AppWindow'
import type { Cue } from '../../components/Sfx'
import { Thread } from '../../components/Thread'
import { useTokens } from '../../components/tokens'
import { Badge } from '../../components/ui'
import { s } from '../../timeline'
import { C, FONT, MONO, R } from '../../theme'
import { FACTS, PAGE } from '../data'
import { vo } from '../film'

const PAD = 36
const TOP = 112
const LEFT = { x: PAD, w: 340 }
const RIGHT = { x: PAD + 340 + 60, w: CONTENT.width - PAD * 2 - 340 - 60 }
const SENTENCE_TOP = TOP + 92
const SENTENCE_H = 86
const ROW_TOP = TOP + 64
const ROW_H = 92

const sentenceY = (index: number) => SENTENCE_TOP + index * SENTENCE_H + 30
const rowY = (index: number) => ROW_TOP + index * ROW_H + 46
const sentenceIndex = (id: string) => PAGE.sentences.findIndex((sentence) => sentence.id === id)

/** Facts land as "typed facts: fees, intakes, entry requirements" is said. */
const factAt = (index: number) => vo('extract.facts', 1.7 + index * 0.42)
/** Threads draw once "tied to the exact sentence" begins. */
const tieAt = (index: number) => vo('extract.tied', 0.5 + index * 0.45)

export function Extract({ frame }: { frame: number }) {
  const t = useTokens()
  const scan = progress(frame, vo('extract.facts', 0.3), s(1.6), glide)

  return <div style={{ position: 'absolute', inset: 0, fontFamily: FONT }}>
    {/* The console's header for this screen. */}
    <div style={{ position: 'absolute', left: PAD, right: PAD, top: 20, height: 74, display: 'flex', alignItems: 'center', gap: 18, padding: '0 20px', borderRadius: R.card, border: `1px solid ${t.line}`, background: t.surface, ...rise(progress(frame, 0, 18), 12) }}>
      <div style={{ flex: 1, display: 'grid', gap: 6 }}>
        <span style={{ color: t.inkFaint, font: `600 12.5px/1 ${FONT}` }}>University domain pack · evidence control</span>
        <span style={{ color: t.ink, font: `700 19px/1 ${FONT}`, letterSpacing: '-0.01em' }}>Know what is complete before students rely on it.</span>
      </div>
      <Badge tone="met" size={13.5}>74% field coverage</Badge>
    </div>

    {/* Captured page */}
    <div style={{ position: 'absolute', left: LEFT.x, top: TOP, width: LEFT.w, height: 540, borderRadius: R.card, background: t.surface, border: `1px solid ${t.line}`, overflow: 'hidden', ...rise(progress(frame, s(0.15), 20), 16) }}>
      <div style={{ padding: '18px 20px 0', display: 'grid', gap: 10 }}>
        <span style={{ color: t.inkFaint, font: `500 12.5px/1 ${MONO}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{PAGE.url}</span>
        <span style={{ color: t.ink, font: `700 22px/1 ${FONT}` }}>{PAGE.title}</span>
      </div>
      {PAGE.sentences.map((sentence, index) => {
        const fact = FACTS.findIndex((f) => f.source === sentence.id)
        const lit = fact >= 0 ? progress(frame, tieAt(fact) + s(0.35), s(0.4), glide) : 0
        return <p key={sentence.id} style={{
          position: 'absolute', left: 20, right: 20, top: SENTENCE_TOP - TOP + index * SENTENCE_H, height: SENTENCE_H - 14, margin: 0,
          color: lit > 0.5 ? t.ink : t.inkSoft, font: `400 16px/1.5 ${FONT}`,
        }}>
          <span style={{
            padding: '2px 4px', margin: '0 -4px', borderRadius: 5, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
            backgroundImage: `linear-gradient(rgba(115, 132, 255, 0.24), rgba(115, 132, 255, 0.24))`,
            backgroundRepeat: 'no-repeat', backgroundSize: `${lit * 100}% 100%`,
          }}>{sentence.text}</span>
        </p>
      })}
      {/* The reader passing over the page. */}
      {scan > 0 && scan < 1 && <div style={{
        position: 'absolute', left: 0, right: 0, top: 70 + scan * 460, height: 46,
        background: `linear-gradient(180deg, transparent, rgba(66, 207, 160, 0.16), transparent)`, borderBottom: `1px solid rgba(66, 207, 160, 0.5)`,
      }} />}
    </div>

    {/* Typed facts */}
    <div style={{ position: 'absolute', left: RIGHT.x, top: TOP, width: RIGHT.w, height: 540, borderRadius: R.card, background: t.surface, border: `1px solid ${t.line}`, ...rise(progress(frame, s(0.3), 20), 16) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 20px 0', color: t.ink, font: `700 17px/1 ${FONT}` }}>
        <ScanText size={19} color={t.blue} /> Typed facts
      </div>
      {FACTS.map((fact, index) => {
        const p = pop(frame, factAt(index), { damping: 15, stiffness: 190 })
        const pinned = progress(frame, tieAt(index) + s(0.5), 10)
        const confidence = progress(frame, factAt(index), s(0.6))
        return <div key={fact.field} style={{
          position: 'absolute', left: 16, right: 16, top: ROW_TOP - TOP + index * ROW_H, height: ROW_H - 12,
          padding: '12px 14px', borderRadius: R.panel, background: t.surface2, display: 'grid', gap: 8, alignContent: 'center',
          opacity: Math.min(1, p * 1.4), transform: `translateX(${(1 - p) * 20}px)`,
          boxShadow: pinned > 0 ? `inset 3px 0 0 ${C.mint}` : undefined,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: t.inkFaint, font: `500 13px/1 ${MONO}` }}>{fact.field}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, color: t.successInk, font: `600 12.5px/1 ${FONT}`, opacity: pinned }}><Link2 size={13} /> Pinned</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: t.ink, font: `700 19px/1 ${FONT}` }}>{fact.value}</span>
            <span style={{ marginLeft: 'auto', width: 64, height: 6, borderRadius: 6, background: t.line, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${fact.confidence * 100 * confidence}%`, background: C.emerald }} />
            </span>
            <span style={{ color: t.inkSoft, font: `500 13px/1 ${MONO}` }}>{(fact.confidence * confidence).toFixed(2)}</span>
          </span>
        </div>
      })}
    </div>

    {/* Each value, wired to the sentence it was read from. */}
    <svg width={CONTENT.width} height={CONTENT.height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      {FACTS.map((fact, index) => {
        const p = progress(frame, tieAt(index), s(0.55), glide)
        if (p <= 0) return null
        const from = { x: RIGHT.x + 14, y: rowY(index) }
        const to = { x: LEFT.x + LEFT.w - 14, y: sentenceY(sentenceIndex(fact.source)) }
        const d = `M ${from.x} ${from.y} C ${from.x - 50} ${from.y}, ${to.x + 50} ${to.y}, ${to.x} ${to.y}`
        const flow = frame > tieAt(index) + s(0.6) ? [((frame - tieAt(index)) / s(1.2)) % 1] : []
        return <Thread key={fact.field} d={d} to={p} width={3.5} tailNode nodeScale={1.6} colors={[C.mint, C.sky, C.blue]} particles={flow} opacity={map(frame, [tieAt(index), tieAt(index) + 6], [0.6, 1])} />
      })}
    </svg>
  </div>
}

export function extractCues(): Cue[] {
  return [
    { at: vo('extract.facts', 0.3), name: 'whoosh-soft', volume: 0.16 },
    ...FACTS.map((_, index) => ({ at: factAt(index), name: 'pop-hi' as const, volume: 0.13 })),
    ...FACTS.map((_, index) => ({ at: tieAt(index), name: 'thread' as const, volume: 0.12 })),
  ]
}
