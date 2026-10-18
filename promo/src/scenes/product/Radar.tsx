// Research Opportunity Radar (student/radar). Write → review terms → results.
// The privacy boundary is the point: the writing is analysed on the device and
// only the derived topics cross to the search — drawn here literally, as
// threads carrying chips out of a dashed "on your device" panel while the text
// stays behind.
import {
  ArrowRight, Banknote, BadgeCheck, Building2, FlaskConical, Lock, Search, Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { exit, glide, pop, progress, rise } from '../../anim'
import { CONTENT } from '../../components/AppWindow'
import { Cursor, pressAt, type CursorKey } from '../../components/Cursor'
import type { Cue } from '../../components/Sfx'
import { Thread } from '../../components/Thread'
import { Avatar, Badge, Button, IconTile } from '../../components/ui'
import { FUNDING, PEOPLE, RESEARCH } from '../../data'
import { FPS, s } from '../../timeline'
import { vo } from '../../vo'
import { C, FONT, R, SHADOW } from '../../theme'

const PAD = 36
const INNER = CONTENT.width - PAD * 2

// Write → review → results, on the narration: the review opens on "Your
// research stays on your device", the topics fly on "only its topics are
// searched", and the results arrive with "Scrapal finds the supervisors".
const PASTE_AT = vo('radar.phd', 0.55) / FPS
const CLICK_REVIEW = vo('radar.device', -0.3) / FPS
export const REVIEW_AT = vo('radar.device', 0.1) / FPS
/** Seconds after REVIEW_AT at which the first topic leaves the device. */
const FLY_AFTER = vo('radar.device', 2.0) / FPS - REVIEW_AT
const CLICK_SEARCH = vo('radar.match', -0.45) / FPS
export const RESULTS_AT = vo('radar.match', -0.2) / FPS

// Phase 2 layout: the device panel and the search panel.
const LEFT = { x: PAD, y: 92, w: 430, h: 420 }
const RIGHT = { x: PAD + 430 + 44, y: 92, w: INNER - 430 - 44, h: 420 }
const LINE_H = 29
const TEXT_TOP = LEFT.y + 70
const CHAR_W = 8.05

/** The research, broken where the topics will not straddle a line. */
const LINES = [
  'We develop graph neural networks that detect',
  'financial fraud in large transaction networks,',
  'and explain each alert in terms an',
  'investigator can audit. Current work studies',
  'anomaly detection when spending patterns',
  'drift over time.',
]
/** [line, first char, last char] of each phrase the fingerprint draws on. */
const SPANS: [number, number, number][] = [[0, 11, 32], [1, 0, 15], [1, 25, 45], [2, 4, 22], [4, 0, 17]]

export function Radar({ frame }: { frame: number }) {
  const step = frame >= s(RESULTS_AT) ? 3 : frame >= s(REVIEW_AT) ? 2 : 1
  const phase1 = 1 - progress(frame, s(REVIEW_AT - 0.2), s(0.4), exit)
  const phase2 = Math.min(progress(frame, s(REVIEW_AT), s(0.45)), 1 - progress(frame, s(RESULTS_AT - 0.2), s(0.4), exit))

  const keys: CursorKey[] = [
    { f: s(CLICK_REVIEW - 0.9), x: 700, y: 690 },
    { f: s(CLICK_REVIEW - 0.2), x: CONTENT.width - PAD - 120, y: 626 },
    { f: s(CLICK_REVIEW), x: CONTENT.width - PAD - 120, y: 626, click: true },
    { f: s(CLICK_REVIEW + 0.85), x: 760, y: 700 },
    { f: s(CLICK_SEARCH - 0.2), x: CONTENT.width - PAD - 130, y: 600 },
    { f: s(CLICK_SEARCH), x: CONTENT.width - PAD - 130, y: 600, click: true },
    { f: s(CLICK_SEARCH + 0.85), x: 790, y: 720 },
  ]
  const cursorOpacity = Math.min(progress(frame, s(CLICK_REVIEW - 0.9), 10), 1 - progress(frame, s(CLICK_SEARCH + 0.55), 12, exit))

  return <div style={{ position: 'absolute', inset: 0, fontFamily: FONT }}>
    <Stepper frame={frame} step={step} />
    {phase1 > 0 && <Write frame={frame} opacity={phase1} press={pressAt(frame, s(CLICK_REVIEW))} />}
    {phase2 > 0 && <Review frame={frame} opacity={phase2} press={pressAt(frame, s(CLICK_SEARCH))} />}
    {frame >= s(RESULTS_AT - 0.1) && <Results frame={frame} />}
    <Cursor keys={keys} frame={frame} opacity={cursorOpacity} />
  </div>
}

function Stepper({ frame, step }: { frame: number; step: number }) {
  const steps = ['Your work', 'What gets searched', 'What matched']
  return <div style={{ position: 'absolute', left: PAD, top: 22, display: 'flex', gap: 10, ...rise(progress(frame, 0, 16), 10) }}>
    {steps.map((label, i) => {
      const active = step === i + 1
      const done = step > i + 1
      return <span key={label} style={{
        display: 'inline-flex', alignItems: 'center', gap: 9, height: 42, padding: '0 16px 0 7px',
        borderRadius: R.pill, border: `1.5px solid ${active ? C.blue : C.line}`,
        background: active ? C.blueWash : C.surface,
        color: active ? C.blue : done ? C.ink : C.inkFaint, font: `600 16px/1 ${FONT}`,
      }}>
        <span style={{
          width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: active ? C.blue : done ? C.metSoft : C.surface2,
          color: active ? '#fff' : done ? C.successInk : C.inkFaint, font: `700 14px/1 ${FONT}`,
        }}>{done ? '✓' : i + 1}</span>
        {label}
      </span>
    })}
  </div>
}

function PrivacyNote({ compact }: { compact?: boolean }) {
  return <div style={{
    display: 'flex', alignItems: 'flex-start', gap: 12, padding: compact ? '12px 14px' : '14px 16px',
    borderRadius: 14, background: C.successWash, border: '1px solid #c4eedd',
    color: C.successInk, font: `400 16px/1.45 ${FONT}`,
  }}>
    <Lock size={19} strokeWidth={2.1} style={{ flex: 'none', marginTop: 2 }} />
    <span><b>This stays on your device.</b> Scrapal works out the topics here. The writing itself is never uploaded and never used for training.</span>
  </div>
}

function Write({ frame, opacity, press }: { frame: number; opacity: number; press: number }) {
  const card = progress(frame, s(0.05), 22)
  const paste = progress(frame, s(PASTE_AT), s(0.35))
  return <div style={{
    position: 'absolute', left: PAD, top: 86, width: INNER, padding: 26,
    borderRadius: R.card, background: C.surface, border: `1px solid ${C.line}`, boxShadow: SHADOW.lift,
    display: 'grid', gap: 16, opacity: opacity * card, transform: `translateY(${(1 - card) * 18}px)`,
  }}>
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={{ color: C.ink, font: `700 22px/1 ${FONT}`, letterSpacing: '-0.01em' }}>Paste your research, or attach it</span>
      <span style={{ color: C.inkSoft, font: `400 16px/1.4 ${FONT}` }}>An abstract, a proposal, a thesis chapter or a few sentences about what you work on.</span>
    </div>
    <PrivacyNote />
    <div style={{
      height: 176, padding: '16px 18px', borderRadius: R.input, border: `1.5px solid ${paste > 0 && paste < 1 ? C.blue : C.line}`,
      color: C.ink, font: `400 17px/1.6 ${FONT}`, position: 'relative', overflow: 'hidden',
    }}>
      {paste <= 0 && <span style={{ color: C.inkFaint }}>Graph neural networks for detecting financial fraud…</span>}
      <span style={{ opacity: paste, display: 'block', transform: `translateY(${(1 - paste) * 6}px)` }}>{RESEARCH.text}</span>
      {/* The paste flash. */}
      <span style={{ position: 'absolute', inset: 0, background: C.blueWash, opacity: paste > 0 && paste < 1 ? 0.6 * (1 - paste) : 0 }} />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ color: C.inkFaint, font: `500 15px/1 ${FONT}` }}>{paste > 0.5 ? '34 words' : '0 words'}</span>
      <Button icon={ArrowRight} pressed={press} size={17} style={{ flexDirection: 'row-reverse' }}>See what will be searched</Button>
    </div>
  </div>
}

function Review({ frame, opacity, press }: { frame: number; opacity: number; press: number }) {
  const t = (seconds: number) => s(REVIEW_AT + seconds)
  return <div style={{ position: 'absolute', inset: 0, opacity }}>
    {/* On your device */}
    <div style={{
      position: 'absolute', left: LEFT.x, top: LEFT.y, width: LEFT.w, height: LEFT.h, padding: '18px 20px',
      borderRadius: R.card, border: `2px dashed rgba(8, 114, 85, 0.45)`, background: 'rgba(231, 248, 239, 0.55)',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 9, color: C.successInk, font: `700 17px/1 ${FONT}` }}>
        <Lock size={18} strokeWidth={2.2} /> On your device
      </span>
    </div>
    <div style={{ position: 'absolute', left: LEFT.x + 20, top: TEXT_TOP, width: LEFT.w - 40 }}>
      {LINES.map((line, li) => <div key={li} style={{ height: LINE_H, whiteSpace: 'nowrap', color: C.inkSoft, font: `400 15.5px/${LINE_H}px ${FONT}` }}>
        {paintLine(line, li, frame, t)}
      </div>)}
    </div>
    <span style={{ position: 'absolute', left: LEFT.x + 20, top: LEFT.y + LEFT.h - 46, color: C.successInk, font: `500 14.5px/1.35 ${FONT}`, width: LEFT.w - 40 }}>
      Your writing stays here. It is never uploaded.
    </span>

    {/* What gets searched */}
    <div style={{
      position: 'absolute', left: RIGHT.x, top: RIGHT.y, width: RIGHT.w, height: RIGHT.h, padding: '18px 20px',
      borderRadius: R.card, border: `1px solid ${C.line}`, background: C.surface, boxShadow: SHADOW.lift,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 9, color: C.ink, font: `700 17px/1 ${FONT}` }}>
        <Search size={18} strokeWidth={2.2} /> What gets searched
      </span>
    </div>

    {/* Each topic crosses the boundary on a thread; the sentence it came from does not. */}
    <svg width={CONTENT.width} height={CONTENT.height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      {SPANS.map((span, i) => {
        const fly = progress(frame, t(FLY_AFTER + i * 0.2), s(0.7), glide)
        const o = origin(span)
        const d = dest(i)
        const path = `M ${o.x} ${o.y} C ${o.x + 120} ${o.y}, ${d.x - 140} ${d.y}, ${d.x} ${d.y}`
        return <Thread key={i} d={path} to={fly} from={Math.max(0, fly * 1.3 - 0.3)} width={3.5} headNode={false}
          opacity={1 - progress(frame, t(FLY_AFTER + i * 0.2 + 0.75), 14)} />
      })}
    </svg>
    {RESEARCH.labels.map((label, i) => {
      const fly = progress(frame, t(FLY_AFTER + i * 0.2), s(0.7), glide)
      if (fly <= 0) return null
      const o = origin(SPANS[i])
      const d = dest(i)
      const x = o.x + (d.x - o.x) * fly
      const y = o.y + (d.y - o.y) * fly - Math.sin(fly * Math.PI) * 26
      return <span key={label} style={{
        position: 'absolute', left: x, top: y, transform: `translate(0, -50%) scale(${0.8 + 0.2 * fly})`, transformOrigin: 'left center',
        display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 15px', borderRadius: R.pill,
        background: C.blueWash, border: '1.5px solid #d9dfff', color: C.blue, font: `600 16.5px/1 ${FONT}`, whiteSpace: 'nowrap',
        boxShadow: fly < 1 ? SHADOW.liftHigh : 'none',
      }}>{label}</span>
    })}

    <div style={{
      position: 'absolute', left: PAD, right: PAD, top: 530, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      ...rise(progress(frame, t(FLY_AFTER + 1.15), 18), 12),
    }}>
      <span style={{ color: C.inkSoft, font: `500 16.5px/1.4 ${FONT}`, maxWidth: 400 }}>
        Only these 5 topics leave your device. Remove any before searching.
      </span>
      <Button icon={Search} pressed={press} size={17}>Search with these</Button>
    </div>
  </div>
}

function origin([line, start]: [number, number, number]) {
  return { x: LEFT.x + 20 + start * CHAR_W, y: TEXT_TOP + line * LINE_H + LINE_H / 2 }
}

function dest(index: number) {
  return { x: RIGHT.x + 20, y: RIGHT.y + 82 + index * 56 }
}

function paintLine(line: string, li: number, frame: number, t: (seconds: number) => number) {
  const spans = SPANS.map((span, i) => ({ span, i })).filter(({ span }) => span[0] === li)
  if (!spans.length) return line
  const out: ReactNode[] = []
  let at = 0
  for (const { span, i } of spans) {
    const [, a, b] = span
    out.push(line.slice(at, a))
    const h = progress(frame, t(0.35 + i * 0.14), s(0.35), glide)
    out.push(<span key={i} style={{
      color: h > 0.5 ? C.ink : undefined, fontWeight: h > 0.5 ? 600 : 400,
      backgroundImage: 'linear-gradient(rgba(70, 92, 255, 0.18), rgba(70, 92, 255, 0.18))',
      backgroundRepeat: 'no-repeat', backgroundSize: `${h * 100}% 100%`, borderRadius: 4,
    }}>{line.slice(a, b)}</span>)
    at = b
  }
  out.push(line.slice(at))
  return out
}

function Results({ frame }: { frame: number }) {
  const t = (seconds: number) => s(RESULTS_AT + seconds)
  const tabs = progress(frame, t(0.05), 18)
  return <div style={{ position: 'absolute', inset: 0 }}>
    <div style={{ position: 'absolute', left: PAD, top: 86, display: 'flex', gap: 10, ...rise(tabs, 10) }}>
      {[['People', 12, Users], ['Funding', 6, Banknote], ['Labs', 3, FlaskConical]].map(([label, count, Icon], i) => {
        const TabIcon = Icon as typeof Users
        return <span key={label as string} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 15px', borderRadius: R.pill,
          border: `1.5px solid ${i === 0 ? C.navy : C.line}`, background: i === 0 ? C.navy : C.surface,
          color: i === 0 ? '#fff' : C.inkSoft, font: `600 16px/1 ${FONT}`,
        }}>
          <TabIcon size={17} strokeWidth={1.9} /> {label as string}
          <span style={{ padding: '3px 7px', borderRadius: 99, background: i === 0 ? 'rgba(255,255,255,0.16)' : C.surface2, font: `700 13px/1 ${FONT}` }}>{count as number}</span>
        </span>
      })}
    </div>

    {PEOPLE.map((person, i) => {
      const p = progress(frame, t(0.3 + i * 0.22), 22)
      const w = (INNER - 18) / 2
      return <div key={person.name} style={{
        position: 'absolute', left: PAD + i * (w + 18), top: 146, width: w, height: 254, padding: '20px 20px 18px',
        borderRadius: R.card, background: C.surface, border: `1px solid ${C.line}`, boxShadow: SHADOW.lift,
        display: 'flex', flexDirection: 'column', gap: 12, ...rise(p, 24),
      }}>
        <Badge tone={person.tone} size={13} style={{ alignSelf: 'flex-end', marginBottom: -6 }}>{person.badge}</Badge>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Avatar initials={person.initials} color={person.color} size={58} />
          <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.ink, font: `700 19px/1 ${FONT}` }}>
              {person.name} <BadgeCheck size={17} color={C.blue} strokeWidth={2} />
            </span>
            <span style={{ color: C.inkSoft, font: `400 14.5px/1.25 ${FONT}` }}>{person.role}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.inkFaint, font: `500 14px/1 ${FONT}` }}>
              <Building2 size={14} /> {person.place}
            </span>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <span style={{ color: C.inkFaint, font: `600 13px/1 ${FONT}`, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Why this match</span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {person.why.map((term, k) => <Badge key={term} tone="blue" size={13.5}
              style={{ transform: `scale(${0.9 + 0.1 * pop(frame, t(0.7 + i * 0.22 + k * 0.08))})` }}>{term}</Badge>)}
          </span>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
          <Button icon={Users} size={14.5}>View profile</Button>
          <Button variant="secondary" size={14.5}>Save</Button>
        </div>
      </div>
    })}

    {(() => {
      const p = progress(frame, t(0.75), 22)
      return <div style={{
        position: 'absolute', left: PAD, top: 418, width: INNER, padding: '20px 22px',
        borderRadius: R.card, background: C.surface, border: `1px solid ${C.line}`, boxShadow: SHADOW.lift,
        display: 'flex', gap: 16, alignItems: 'flex-start', ...rise(p, 24),
      }}>
        <IconTile icon={Banknote} size={50} />
        <div style={{ flex: 1, display: 'grid', gap: 10 }}>
          <span style={{ color: C.ink, font: `700 20px/1.1 ${FONT}`, letterSpacing: '-0.01em' }}>{FUNDING.title}</span>
          <span style={{ color: C.inkSoft, font: `400 15px/1 ${FONT}` }}>{FUNDING.funder}</span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 4 }}>
            <Badge tone="neutral" size={13.5}>PhD</Badge>
            <Badge tone="met" size={13.5}>Fully funded</Badge>
            <Badge tone="neutral" size={13.5}>{FUNDING.amount}</Badge>
            <Badge tone="close" size={13.5}>{FUNDING.closes}</Badge>
          </span>
          <span style={{ color: C.inkFaint, font: `500 14.5px/1 ${FONT}` }}>Why: {FUNDING.why.join(' · ')}</span>
        </div>
        <Button size={15}>View the call</Button>
      </div>
    })()}
  </div>
}

export const RADAR_CUES: Cue[] = [
  { at: s(PASTE_AT), name: 'whoosh-soft', volume: 0.2 },
  { at: s(CLICK_REVIEW), name: 'click', volume: 0.45 },
  { at: s(REVIEW_AT), name: 'whoosh-soft', volume: 0.18 },
  ...SPANS.map((_, i) => ({ at: s(REVIEW_AT + 0.35 + i * 0.14), name: 'highlight' as const, volume: 0.08 })),
  ...SPANS.map((_, i) => ({ at: s(REVIEW_AT + FLY_AFTER + i * 0.2), name: 'thread' as const, volume: 0.16 })),
  { at: s(CLICK_SEARCH), name: 'click', volume: 0.45 },
  { at: s(RESULTS_AT + 0.3), name: 'success', volume: 0.24 },
  ...[0.3, 0.52, 0.75].map((t) => ({ at: s(RESULTS_AT + t), name: 'pop' as const, volume: 0.18 })),
]
