// "See where every crawl spends its time" (Observability). A failure stays
// attached to the exact stage, page, worker and trace that produced it — each
// lit as the narrator names it — and the runtime panel shows the models
// running locally (README: qwen2.5:7b-instruct, llama3.2:3b, nomic-embed-text).
import { Cpu, Database, Lock, Server, Siren } from 'lucide-react'
import { progress, rise } from '../../anim'
import { CONTENT } from '../../components/AppWindow'
import { Cursor, pressAt, type CursorKey } from '../../components/Cursor'
import type { Cue } from '../../components/Sfx'
import { useTokens } from '../../components/tokens'
import { Badge, Button } from '../../components/ui'
import { FPS, s } from '../../timeline'
import { FONT, MONO, R } from '../../theme'
import { vo } from '../film'

const PAD = 36
const INNER = CONTENT.width - PAD * 2
const LEFT_W = 440
const RIGHT_X = PAD + LEFT_W + 18
const RIGHT_W = INNER - LEFT_W - 18

/** "...the stage, the page, the worker." */
const NAMED = [vo('watch.where', 2.35), vo('watch.where', 3.05), vo('watch.where', 3.7)]
const ACK = vo('watch.where', 4.6) / FPS
/** "And it all runs on local models" — the Ollama row and the sidebar status light up. */
export const LOCAL_AT = () => vo('watch.local', 0.9)
const ACK_BUTTON = { x: PAD + 94, y: 158 + 470 }

export function Watch({ frame }: { frame: number }) {
  const t = useTokens()
  const acknowledged = progress(frame, s(ACK), 10)
  const local = progress(frame, LOCAL_AT(), s(0.5))
  const privacy = progress(frame, vo('watch.local', 2.4), s(0.5))
  const keys: CursorKey[] = [
    { f: s(ACK - 0.9), x: 520, y: 690 },
    { f: s(ACK - 0.2), x: ACK_BUTTON.x, y: ACK_BUTTON.y },
    { f: s(ACK), x: ACK_BUTTON.x, y: ACK_BUTTON.y, click: true },
    { f: s(ACK + 0.9), x: 560, y: 760 },
  ]

  const stats = [
    ['LIVE RUNS', '2', 'moving through the pipeline'],
    ['PAGES OBSERVED', '4,812', 'durable stage timelines'],
    ['PAGE P95', '512ms', 'end-to-end processing'],
    ['OPEN INCIDENTS', acknowledged > 0.5 ? '0' : '1', acknowledged > 0.5 ? 'acknowledged' : '1 failed stage'],
  ]
  const fields = [
    ['Stage', 'fetch'],
    ['Page', 'lakeshore.ie/postgraduate/fees'],
    ['Worker', 'crawler-2'],
    ['Trace', '7f3a9c1e·4b02'],
  ]
  const deps: [typeof Server, string, string][] = [
    [Server, 'Crawler workers', '2 reporting'],
    [Database, 'postgres', 'Responding normally'],
    [Database, 'redis', 'Responding normally'],
    [Cpu, 'ollama', 'qwen2.5:7b-instruct loaded'],
  ]

  return <div style={{ position: 'absolute', inset: 0, fontFamily: FONT }}>
    <div style={{ position: 'absolute', left: PAD, top: 22, width: INNER, height: 112, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderRadius: R.card, border: `1px solid ${t.line}`, background: t.surface, overflow: 'hidden', ...rise(progress(frame, 0, 16), 10) }}>
      {stats.map(([label, value, note], index) => {
        const alarm = index === 3 && acknowledged < 0.5
        return <div key={label} style={{ padding: '16px 18px', display: 'grid', gap: 8, alignContent: 'start', borderLeft: index ? `1px solid ${t.line}` : undefined, background: alarm ? t.errorWash : undefined }}>
          <span style={{ color: t.inkFaint, font: `500 11.5px/1 ${MONO}`, letterSpacing: '0.08em' }}>{label}</span>
          <span style={{ color: alarm ? t.errorInk : t.ink, font: `700 30px/1 ${FONT}`, letterSpacing: '-0.02em' }}>{value}</span>
          <span style={{ color: t.inkSoft, font: `400 13px/1 ${FONT}` }}>{note}</span>
        </div>
      })}
    </div>

    {/* The incident, pinned to where it happened. */}
    <div style={{ position: 'absolute', left: PAD, top: 158, width: LEFT_W, height: 512, padding: '18px 20px', borderRadius: R.card, background: t.surface, border: `1px solid ${acknowledged > 0.5 ? t.line : t.errorWash}`, display: 'flex', flexDirection: 'column', gap: 12, ...rise(progress(frame, vo('watch.where', -0.3), 18), 14) }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 12, background: t.errorWash, color: t.errorInk }}><Siren size={19} /></span>
        <span style={{ display: 'grid', gap: 5 }}>
          <span style={{ color: t.inkFaint, font: `600 12.5px/1 ${FONT}` }}>Open incident</span>
          <span style={{ color: t.ink, font: `700 18px/1.15 ${FONT}` }}>lakeshore.ie returned 503 three times</span>
        </span>
      </span>
      {fields.map(([label, value], index) => {
        // Stage, page and worker are named aloud; the trace is there to be found.
        const named = NAMED[index]
        const lit = named == null ? 0 : progress(frame, named, 8)
        const settleBack = named == null ? 1 : progress(frame, named + s(0.6), 10)
        return <div key={label} style={{
          display: 'grid', gridTemplateColumns: '84px 1fr', alignItems: 'center', height: 54, padding: '0 14px', borderRadius: 12,
          background: lit > 0 ? `rgba(115, 132, 255, ${0.16 * lit})` : t.surface2, border: `1px solid ${lit > 0.5 ? t.blueLine : 'transparent'}`,
          transform: `scale(${1 + 0.015 * lit * (1 - settleBack)})`,
        }}>
          <span style={{ color: t.inkFaint, font: `600 13.5px/1 ${FONT}` }}>{label}</span>
          <span style={{ color: t.ink, font: `500 15px/1 ${MONO}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
        </div>
      })}
      <span style={{ color: t.errorInk, font: `500 13.5px/1.4 ${MONO}` }}>HTTP 503 Service Unavailable · retry 3 of 3</span>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        {acknowledged > 0.5
          ? <Badge tone="blue" size={14}>Acknowledged · someone is looking at it</Badge>
          : <><Button size={15} pressed={pressAt(frame, s(ACK))}>Acknowledge</Button><Button variant="secondary" size={15}>Resolve</Button></>}
      </div>
    </div>

    {/* Runtime: workers and the local models. */}
    <div style={{ position: 'absolute', left: RIGHT_X, top: 158, width: RIGHT_W, height: 512, padding: '18px 18px', borderRadius: R.card, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', flexDirection: 'column', gap: 10, ...rise(progress(frame, vo('watch.where', -0.1), 18), 14) }}>
      <span style={{ display: 'grid', gap: 5 }}>
        <span style={{ color: t.inkFaint, font: `600 12.5px/1 ${FONT}` }}>Runtime</span>
        <span style={{ color: t.ink, font: `700 18px/1 ${FONT}` }}>Workers &amp; dependencies</span>
      </span>
      {deps.map(([Icon, name, note]) => {
        const isModel = name === 'ollama'
        const glow = isModel ? local : 0
        return <div key={name} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12,
          background: glow > 0 ? `rgba(66, 207, 160, ${0.12 * glow})` : t.surface2, border: `1px solid ${glow > 0.5 ? t.metLine : 'transparent'}`,
        }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, background: t.metSoft, color: t.successInk }}><Icon size={17} /></span>
          <span style={{ flex: 1, display: 'grid', gap: 4, minWidth: 0 }}>
            <span style={{ color: t.ink, font: `700 15px/1 ${FONT}` }}>{name}</span>
            <span style={{ color: t.inkSoft, font: `400 12.5px/1.2 ${FONT}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note}</span>
          </span>
          <span style={{ color: t.successInk, font: `500 12px/1 ${MONO}` }}>OK</span>
        </div>
      })}
      <div style={{ marginTop: 'auto', padding: '12px 14px', borderRadius: 14, background: t.metSoft, border: `1px solid ${t.metLine}`, display: 'grid', gap: 8, opacity: local, transform: `translateY(${(1 - local) * 10}px)` }}>
        <span style={{ color: t.successInk, font: `700 14px/1 ${FONT}` }}>Local models</span>
        {['qwen2.5:7b-instruct', 'llama3.2:3b', 'nomic-embed-text'].map((model, index) => (
          <span key={model} style={{ color: t.ink, font: `500 13px/1 ${MONO}`, opacity: progress(frame, LOCAL_AT() + s(0.2 + index * 0.15), 10) }}>{model}</span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2, color: t.successInk, font: `600 13px/1.3 ${FONT}`, opacity: privacy }}>
          <Lock size={14} /> Student data stays in this deployment
        </span>
      </div>
    </div>

    <Cursor keys={keys} frame={frame} opacity={progress(frame, s(ACK - 0.9), 10) * (1 - progress(frame, s(ACK + 0.7), 12))} />
  </div>
}

export function watchCues(): Cue[] {
  return [
    ...NAMED.map((at) => ({ at, name: 'pop-hi' as const, volume: 0.13 })),
    { at: s(ACK), name: 'click', volume: 0.28 },
    { at: LOCAL_AT(), name: 'shimmer', volume: 0.14 },
    { at: vo('watch.local', 2.4), name: 'success', volume: 0.16 },
  ]
}
