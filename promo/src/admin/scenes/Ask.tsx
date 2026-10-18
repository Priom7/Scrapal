// "Trace an answer back to evidence" (Retrieval Lab). The question runs
// through three lanes — structured, lexical, semantic — fused by rank (RRF,
// k=60); answer validation emits each sentence with its evidence, or
// withholds it. Wording follows RetrievalTrace in console/src/App.tsx.
import { Check, Search, X } from 'lucide-react'
import { pop, progress, rise, typed } from '../../anim'
import { CONTENT } from '../../components/AppWindow'
import { Cursor, pressAt, type CursorKey } from '../../components/Cursor'
import type { Cue } from '../../components/Sfx'
import { useTokens } from '../../components/tokens'
import { Badge, Button } from '../../components/ui'
import { FPS, s } from '../../timeline'
import { FONT, MONO, R } from '../../theme'
import { QUESTION, RANKING } from '../data'
import { vo } from '../film'

const PAD = 36
const INNER = CONTENT.width - PAD * 2
const RUN_AT = vo('ask.receipts', 1.5) / FPS
const MATRIX_AT = RUN_AT + 0.35
const EMIT_AT = vo('ask.cited', 0.2) / FPS
const WITHHOLD_AT = vo('ask.cited', 1.75) / FPS
const RUN_BUTTON = { x: PAD + INNER - 74, y: 22 + 92 }

/** Where the emitted sentence sits in the window's content area, for the thread out to the student view. */
export const EMITTED_ANCHOR = { x: PAD + 30, y: 570 }

export function Ask({ frame }: { frame: number }) {
  const t = useTokens()
  const question = typed(QUESTION, frame, vo('ask.receipts', -0.4), 60)
  const keys: CursorKey[] = [
    { f: s(RUN_AT - 0.8), x: 520, y: 640 },
    { f: s(RUN_AT - 0.15), x: RUN_BUTTON.x, y: RUN_BUTTON.y },
    { f: s(RUN_AT), x: RUN_BUTTON.x, y: RUN_BUTTON.y, click: true },
    { f: s(RUN_AT + 0.9), x: 560, y: 740 },
  ]

  const col = '1fr 92px 82px 92px 96px 116px'
  return <div style={{ position: 'absolute', inset: 0, fontFamily: FONT }}>
    {/* Research question */}
    <div style={{ position: 'absolute', left: PAD, top: 22, width: INNER, padding: '16px 18px', borderRadius: R.card, background: t.surface, border: `1px solid ${t.line}`, display: 'grid', gap: 10, ...rise(progress(frame, 0, 16), 10) }}>
      <span style={{ color: t.inkSoft, font: `600 13.5px/1 ${FONT}` }}>Research question</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ flex: 1, display: 'flex', alignItems: 'center', minHeight: 46, padding: '0 14px', borderRadius: R.input, background: t.paper, border: `1px solid ${t.line}`, color: t.ink, font: `600 15.5px/1.3 ${FONT}` }}>{question || ' '}</span>
        <Button icon={Search} size={15} pressed={pressAt(frame, s(RUN_AT))}>Run trace</Button>
      </div>
      <span style={{ display: 'flex', gap: 10, color: t.inkSoft, font: `500 13px/1 ${FONT}` }}>
        <Badge tone="neutral" size={12.5}>Retrieval mode · Hybrid</Badge>
        <Badge tone="blue" size={12.5}>✓ Validate an answer</Badge>
        <span style={{ marginLeft: 'auto', alignSelf: 'center', color: t.inkFaint, font: `500 12.5px/1 ${MONO}` }}>nomic-embed-text · 768 dimensions</span>
      </span>
    </div>

    {/* Retrieval decision matrix */}
    <div style={{ position: 'absolute', left: PAD, top: 168, width: INNER, padding: '14px 18px', borderRadius: R.card, background: t.surface, border: `1px solid ${t.line}`, display: 'grid', gap: 8, ...rise(progress(frame, s(MATRIX_AT), 18), 14) }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <span style={{ display: 'grid', gap: 5 }}>
          <span style={{ color: t.inkFaint, font: `600 12px/1 ${FONT}`, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Retrieval decision matrix</span>
          <span style={{ color: t.ink, font: `700 18px/1 ${FONT}` }}>Evidence ranking</span>
        </span>
        <span style={{ color: t.inkSoft, font: `500 13px/1 ${FONT}` }}>3 of 4 packed · <span style={{ fontFamily: MONO }}>RRF, k=60</span></span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: col, gap: 8, padding: '8px 10px', borderRadius: 10, background: t.surface2, color: t.inkFaint, font: `600 12.5px/1 ${FONT}` }}>
        {['Evidence', 'Structured', 'Lexical', 'Semantic', 'Fused', 'Decision'].map((h) => <span key={h}>{h}</span>)}
      </div>
      {RANKING.map((row, index) => {
        const p = progress(frame, s(MATRIX_AT + 0.25 + index * 0.18), 12)
        const rank = (value: number | null) => <span style={{ color: value ? t.ink : t.inkFaint, font: `500 14px/1 ${MONO}` }}>{value ? `#${value}` : '—'}</span>
        return <div key={row.title} style={{
          display: 'grid', gridTemplateColumns: col, gap: 8, alignItems: 'center', padding: '7px 10px', borderRadius: 10,
          background: row.included ? `rgba(115, 132, 255, ${0.07 * p})` : 'transparent', opacity: p * (row.included ? 1 : 0.65),
        }}>
          <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
            <span style={{ color: t.ink, font: `600 14.5px/1.1 ${FONT}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.title}</span>
            <span style={{ color: t.inkFaint, font: `400 12px/1 ${FONT}`, whiteSpace: 'nowrap' }}>{row.detail}</span>
          </span>
          {rank(row.structured)}{rank(row.lexical)}{rank(row.semantic)}
          <span style={{ display: 'grid', gap: 3 }}>{rank(row.fused)}<span style={{ color: t.inkFaint, font: `400 11px/1 ${MONO}` }}>{row.score}</span></span>
          {row.included
            ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: t.successInk, font: `600 13.5px/1 ${FONT}` }}><Check size={15} /> Included</span>
            : <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: t.inkFaint, font: `600 13.5px/1 ${FONT}` }}><X size={15} /> Excluded</span>}
        </div>
      })}
    </div>

    {/* Answer validation */}
    <div style={{ position: 'absolute', left: PAD, top: 500, width: INNER, padding: '14px 18px', borderRadius: R.card, background: t.surface, border: `1px solid ${t.line}`, display: 'grid', gap: 10, ...rise(progress(frame, s(EMIT_AT - 0.3), 18), 14) }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ color: t.inkFaint, font: `600 12px/1 ${FONT}`, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Answer validation</span>
        <span style={{ color: t.ink, font: `700 18px/1 ${FONT}` }}>Grounded answer</span>
        <span style={{ marginLeft: 'auto', color: t.inkFaint, font: `500 12px/1 ${MONO}` }}>Answer model · qwen2.5:7b-instruct</span>
      </span>
      <Sentence frame={frame} at={EMIT_AT} supported text="International students pay £17,500 for the full course." note="Evidence [1]" />
      <Sentence frame={frame} at={WITHHOLD_AT} text="Most international students receive a scholarship." note="Withheld · no supporting evidence" />
    </div>

    <Cursor keys={keys} frame={frame} opacity={progress(frame, s(RUN_AT - 0.8), 10) * (1 - progress(frame, s(RUN_AT + 0.6), 12))} />
  </div>
}

function Sentence({ frame, at, text, note, supported }: { frame: number; at: number; text: string; note: string; supported?: boolean }) {
  const t = useTokens()
  const p = pop(frame, s(at), { damping: 15, stiffness: 190 })
  return <div style={{
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12,
    background: supported ? t.metSoft : t.errorWash, border: `1px solid ${supported ? t.metLine : 'transparent'}`,
    opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * 10}px)`,
  }}>
    <span style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, background: supported ? t.successInk : t.errorInk, color: t.paper }}>
      {supported ? <Check size={16} strokeWidth={2.8} /> : <X size={16} strokeWidth={2.8} />}
    </span>
    <span style={{ flex: 1, display: 'grid', gap: 5 }}>
      <span style={{ color: supported ? t.successInk : t.errorInk, font: `700 12.5px/1 ${FONT}`, letterSpacing: '0.03em', textTransform: 'uppercase' }}>{supported ? 'Emitted' : 'Withheld'}</span>
      <span style={{ color: t.ink, font: `500 16px/1.3 ${FONT}`, textDecoration: supported ? 'none' : 'line-through', textDecorationColor: t.errorInk }}>{text}</span>
    </span>
    <span style={{ color: supported ? t.successInk : t.errorInk, font: `500 12.5px/1.2 ${MONO}`, textAlign: 'right', maxWidth: 150 }}>{note}</span>
  </div>
}

export function askCues(): Cue[] {
  return [
    { at: vo('ask.receipts', -0.4), name: 'typing', volume: 0.22, length: s(1.4) },
    { at: s(RUN_AT), name: 'click', volume: 0.3 },
    ...RANKING.map((_, index) => ({ at: s(MATRIX_AT + 0.25 + index * 0.18), name: 'pop-hi' as const, volume: 0.1 })),
    { at: s(EMIT_AT), name: 'success', volume: 0.2 },
    { at: s(WITHHOLD_AT), name: 'alert', volume: 0.18 },
  ]
}
