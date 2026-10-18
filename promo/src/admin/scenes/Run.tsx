// "Follow the knowledge thread" — the Overview's run path (console/src/RunPath.tsx).
// Discover → Fetch → Extract → Save → Complete, each stage finishing on the
// word that names it; then the durable crawler events the counts come from.
import { Check, Radio } from 'lucide-react'
import { glide, pop, progress, rise } from '../../anim'
import { CONTENT } from '../../components/AppWindow'
import type { Cue } from '../../components/Sfx'
import { useTokens } from '../../components/tokens'
import { Badge } from '../../components/ui'
import { FPS, s } from '../../timeline'
import { C, FONT, MONO, R } from '../../theme'
import { RUN } from '../data'
import { vo } from '../film'

const PAD = 36
const INNER = CONTENT.width - PAD * 2

/** When each stage starts and finishes, keyed to "what was found, fetched, extracted and saved". */
function stageWindow(index: number) {
  const trail = vo('run.trail') / FPS
  const done = [2.3, 2.9, 3.5, 4.2, 4.6][index]
  const start = [0.9, 1.6, 2.2, 2.9, 4.2][index]
  return { start: trail + start, done: trail + done }
}

const EVENTS = [
  ['12:04:31.208', 'fetch', '200', '/study/msc-data-science', '182 ms'],
  ['12:04:31.391', 'extract', 'ok', '/study/msc-data-science', '14 fields'],
  ['12:04:31.522', 'persist', 'ok', 'document 7f3a9c · revision 3', '9 ms'],
  ['12:04:31.640', 'robots', 'skip', '/alumni/events · outside scope', 'policy'],
  ['12:04:31.802', 'fetch', '200', '/study/msc-applied-statistics', '164 ms'],
  ['12:04:31.977', 'extract', 'ok', '/study/msc-applied-statistics', '13 fields'],
  ['12:04:32.115', 'fetch', '304', '/fees/postgraduate-2027', 'unchanged'],
]

export function Run({ frame }: { frame: number }) {
  const t = useTokens()
  const lastDone = stageWindow(4).done
  const percent = Math.round(100 * progress(frame, s(stageWindow(0).start), s(lastDone - stageWindow(0).start)))
  const complete = frame >= s(lastDone)

  return <div style={{ position: 'absolute', inset: 0, fontFamily: FONT }}>
    <div style={{
      position: 'absolute', left: PAD, top: 22, width: INNER, padding: '20px 22px 22px',
      borderRadius: R.card, background: t.surface, border: `1px solid ${t.line}`, borderLeft: `4px solid ${C.mint}`,
      ...rise(progress(frame, 0, 20), 16),
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'grid', gap: 7 }}>
          <span style={{ color: t.ink, font: `700 22px/1 ${FONT}`, letterSpacing: '-0.01em' }}>Latest run path</span>
          <span style={{ color: t.inkSoft, font: `400 14.5px/1.3 ${FONT}` }}>Every count comes from durable crawler events—not an estimated animation.</span>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Badge tone={complete ? 'met' : 'blue'} size={13}>{complete ? '● Completed' : '● Running'}</Badge>
          <span style={{ color: t.ink, font: `700 26px/1 ${FONT}`, fontVariantNumeric: 'tabular-nums', minWidth: 72, textAlign: 'right' }}>{percent}%</span>
        </span>
      </div>

      <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', borderRadius: R.panel, border: `1px solid ${t.line}`, overflow: 'hidden' }}>
        {RUN.map((stage, index) => {
          const { start, done } = stageWindow(index)
          const p = progress(frame, s(start), s(done - start), glide)
          const finished = frame >= s(done)
          const tick = pop(frame, s(done), { damping: 11, stiffness: 220 })
          const count = Math.round(stage.count * (stage.key === 'complete' ? (finished ? 1 : 0) : p))
          const active = p > 0 && !finished
          const span = index < 3 ? 'span 2' : 'span 3'
          return <div key={stage.key} style={{
            gridColumn: span, position: 'relative', padding: '16px 16px 14px', display: 'grid', gap: 10,
            borderTop: index >= 3 ? `1px solid ${t.line}` : undefined,
            borderLeft: index % 3 !== 0 && index < 3 ? `1px solid ${t.line}` : index === 4 ? `1px solid ${t.line}` : undefined,
            background: active ? t.blueWash : 'transparent',
            outline: stage.key === 'complete' && finished ? `1.5px solid ${t.blue}` : undefined, outlineOffset: -2,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10,
                background: finished ? t.metSoft : t.surface2, border: `1px solid ${finished ? t.metLine : t.line}`, color: t.successInk,
              }}>{finished ? <Check size={18} strokeWidth={2.6} style={{ transform: `scale(${tick})` }} /> : active ? <Radio size={16} color={t.blue} /> : null}</span>
              <span style={{ display: 'grid', gap: 5 }}>
                <span style={{ color: t.ink, font: `700 17px/1 ${FONT}` }}>{stage.label}</span>
                <span style={{ color: t.inkSoft, font: `500 13.5px/1 ${FONT}`, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{count.toLocaleString('en-GB')} {stage.unit}</span>
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, height: 4, borderRadius: 4, background: t.surface2, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${(stage.key === 'complete' ? (finished ? 1 : 0) : p) * 100}%`, background: C.mint, borderRadius: 4 }} />
              </span>
              {stage.seconds > 0 && <span style={{ color: t.inkFaint, font: `500 12px/1 ${MONO}`, minWidth: 40, textAlign: 'right' }}>{(stage.seconds * p).toFixed(1)}s</span>}
            </span>
          </div>
        })}
      </div>

      {/* The selected stage, as the console summarises it. */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 22, padding: '12px 16px', borderRadius: R.panel, border: `1px solid ${t.line}`, opacity: progress(frame, s(lastDone), 14) }}>
        <span style={{ display: 'grid', gap: 5 }}>
          <span style={{ color: t.inkFaint, font: `600 12px/1 ${FONT}` }}>Selected stage</span>
          <span style={{ color: t.ink, font: `700 17px/1 ${FONT}`, whiteSpace: 'nowrap' }}>Complete · 612 pages · 590 documents</span>
        </span>
        {[['Reached', '100%'], ['Events', '2,481'], ['Duration', '2m 26s'], ['Failed', '0']].map(([k, v]) => <span key={k} style={{ display: 'grid', gap: 5, marginLeft: k === 'Reached' ? 'auto' : 0 }}>
          <span style={{ color: t.inkFaint, font: `500 11.5px/1 ${FONT}` }}>{k}</span>
          <span style={{ color: t.ink, font: `600 15px/1 ${MONO}` }}>{v}</span>
        </span>)}
      </div>
    </div>

    {/* Durable crawler events: what every number above is counted from. */}
    {(() => {
      const realAt = vo('run.real')
      const card = progress(frame, realAt - s(0.4), 18)
      return <div style={{
        position: 'absolute', left: PAD, top: 462, width: INNER, padding: '16px 20px',
        borderRadius: R.card, background: t.surface, border: `1px solid ${t.line}`, ...rise(card, 18),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ color: t.ink, font: `700 17px/1 ${FONT}` }}>Crawler events</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: t.blue, font: `500 12.5px/1 ${MONO}`, letterSpacing: '0.04em' }}><Radio size={14} /> DURABLE · POSTGRES</span>
        </div>
        {EVENTS.map((event, index) => {
          const p = progress(frame, realAt + s(index * 0.26), 10)
          const skip = event[2] === 'skip'
          return <div key={index} style={{
            display: 'grid', gridTemplateColumns: '118px 74px 50px 1fr 90px', gap: 10, alignItems: 'center', height: 25,
            color: t.inkSoft, font: `400 13.5px/1 ${MONO}`, opacity: p, transform: `translateX(${(1 - p) * -10}px)`,
          }}>
            <span style={{ color: t.inkFaint }}>{event[0]}</span>
            <span style={{ color: t.blue }}>{event[1]}</span>
            <span style={{ color: skip ? t.warningInk : t.successInk }}>{event[2]}</span>
            <span style={{ color: t.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event[3]}</span>
            <span style={{ textAlign: 'right' }}>{event[4]}</span>
          </div>
        })}
      </div>
    })()}
  </div>
}

export function runCues(): Cue[] {
  return [
    ...RUN.map((_, index) => ({ at: s(stageWindow(index).done), name: 'pop-hi' as const, volume: 0.16 })),
    { at: s(stageWindow(4).done), name: 'success', volume: 0.2 },
    ...[0, 2, 4, 6].map((index) => ({ at: vo('run.real') + s(index * 0.26), name: 'click' as const, volume: 0.07 })),
  ]
}
