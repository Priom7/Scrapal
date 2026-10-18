// One course page across two beats, so the page never reloads between them:
//   Match (0–8s)    — student/MatchPanel: one verdict per requirement, the gap
//                     named, no mystery score.
//   Evidence (8–16s) — every figure opens onto where it was read: the page, the
//                     wording, when it was checked. A thread ties the number on
//                     the page to the words on the source.
import {
  Check, Clock, ExternalLink, Globe, History, ShieldCheck, TriangleAlert, X,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Img, staticFile } from 'remotion'
import { exit, glide, keyframes, pop, progress, rise } from '../../anim'
import { CONTENT } from '../../components/AppWindow'
import { Cursor, pressAt, type CursorKey } from '../../components/Cursor'
import type { Cue } from '../../components/Sfx'
import { Thread } from '../../components/Thread'
import { Avatar, Badge, Dots } from '../../components/ui'
import { COURSE, REQUIREMENTS } from '../../data'
import { FPS, s, scene } from '../../timeline'
import { vo } from '../../vo'
import { C, FONT, R, SHADOW } from '../../theme'

const PAD = 36
const INNER = CONTENT.width - PAD * 2
const FACTS_TOP = 108
const MATCH_TOP = 228
const ROW_H = 64
const CLOSE_ROW_H = 92

/** When the evidence beat starts, in seconds from the top of this page. */
export const EVIDENCE_AT = (scene('evidence').from - scene('match').from) / FPS
/** A frame in this page's clock for a moment in the evidence beat's narration. */
const ev = (id: string, offsetSeconds = 0) => s(EVIDENCE_AT) + vo(id, offsetSeconds)
/** "...and exactly what's missing": about two and a half seconds into its line. */
const MISSING = () => vo('match.missing', 2.5)
const CLICK_TUITION = EVIDENCE_AT + vo('evidence.source', 0.1) / FPS
const DRAWER = { left: CONTENT.width - 24 - 404, top: 16, width: 404, height: CONTENT.height - 32 }

export function CoursePage({ frame }: { frame: number }) {
  // The camera inside the app: push in on the requirement that needs attention,
  // then pull back out before the evidence beat.
  const zoom = keyframes(frame, [[MISSING(), 1], [MISSING() + s(0.8), 1.12], [MISSING() + s(2.6), 1.12], [MISSING() + s(3.3), 1]])
  const closeRowY = MATCH_TOP + 96 + ROW_H * 2 + CLOSE_ROW_H / 2

  const drawer = progress(frame, s(CLICK_TUITION + 0.1), s(0.55), glide)
  const tuitionHot = progress(frame, s(CLICK_TUITION - 0.2), 8)

  const keys: CursorKey[] = [
    { f: s(CLICK_TUITION - 0.8), x: 700, y: 640 },
    { f: s(CLICK_TUITION - 0.18), x: PAD + 92, y: FACTS_TOP + 66 },
    { f: s(CLICK_TUITION), x: PAD + 92, y: FACTS_TOP + 66, click: true },
    { f: s(CLICK_TUITION + 0.95), x: PAD + 110, y: FACTS_TOP + 74 },
    { f: s(CLICK_TUITION + 1.65), x: 230, y: 760 },
  ]
  const cursorOpacity = Math.min(progress(frame, s(CLICK_TUITION - 0.8), 10), 1 - progress(frame, s(CLICK_TUITION + 1.35), 14, exit))

  return <div style={{ position: 'absolute', inset: 0, fontFamily: FONT }}>
    <div style={{
      position: 'absolute', inset: 0,
      transform: `scale(${zoom})`, transformOrigin: `400px ${closeRowY}px`,
    }}>
      <Header frame={frame} />
      <Facts frame={frame} hot={tuitionHot} press={pressAt(frame, s(CLICK_TUITION))} />
      <MatchPanel frame={frame} dim={drawer} />
    </div>

    {drawer > 0 && <Drawer frame={frame} p={drawer} />}

    {/* The thread from the figure to the words it was read from. */}
    <svg width={CONTENT.width} height={CONTENT.height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      <Thread
        d={`M ${PAD + 148} ${FACTS_TOP + 62} C ${PAD + 300} ${FACTS_TOP + 62}, ${DRAWER.left - 80} ${284}, ${DRAWER.left + 40} ${284}`}
        to={progress(frame, ev('evidence.source', 1.45), s(0.7), glide)}
        from={progress(frame, ev('evidence.silence', 2.7), s(0.6), exit)}
        width={5}
        tailNode
        nodeScale={1.5}
        particles={[0, 1, 2].map((i) => ((frame - ev('evidence.source', 2.2)) / s(1.4) + i / 3) % 1).filter(() => frame > ev('evidence.source', 2.2))}
      />
    </svg>

    <Cursor keys={keys} frame={frame} opacity={cursorOpacity} />
  </div>
}

function Header({ frame }: { frame: number }) {
  const p = progress(frame, s(0.05), 22)
  return <div style={{ position: 'absolute', left: PAD, top: 22, display: 'flex', alignItems: 'center', gap: 18, ...rise(p, 18) }}>
    <Avatar initials={COURSE.initials} color={COURSE.color} size={64} style={{ borderRadius: 18 }} />
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={{ color: C.inkFaint, font: `500 16px/1 ${FONT}` }}>{COURSE.institution} · {COURSE.city}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: C.ink, font: `700 32px/1 ${FONT}`, letterSpacing: '-0.025em' }}>{COURSE.title}</span>
        <Badge tone="blue" size={14}>Postgraduate</Badge>
      </span>
    </div>
  </div>
}

function Facts({ frame, hot, press }: { frame: number; hot: number; press: number }) {
  const p = progress(frame, s(0.2), 22)
  const facts = [
    ['Tuition', COURSE.tuition],
    ['Length', COURSE.length],
    ['Starts', COURSE.starts],
    ['Study mode', COURSE.mode],
  ]
  return <div style={{
    position: 'absolute', left: PAD, top: FACTS_TOP, width: INNER, height: 96,
    display: 'grid', gridTemplateColumns: '1fr 0.8fr 1.3fr 1fr',
    borderRadius: R.panel, background: C.surface, border: `1px solid ${C.line}`, boxShadow: SHADOW.lift,
    ...rise(p, 18),
  }}>
    {facts.map(([label, value], index) => (
      <div key={label} style={{
        position: 'relative', padding: '20px 24px', display: 'grid', gap: 10, alignContent: 'start',
        borderLeft: index ? `1px solid ${C.line}` : undefined,
      }}>
        <span style={{ color: C.inkFaint, font: `500 14px/1 ${FONT}` }}>{label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.ink, font: `700 23px/1 ${FONT}`, letterSpacing: '-0.01em' }}>
          {index === 0
            ? <span style={{
              padding: '3px 6px', margin: '-3px -6px', borderRadius: 8,
              background: `rgba(70, 92, 255, ${0.1 * hot})`,
              borderBottom: `2px dotted rgba(70, 92, 255, ${0.25 + 0.75 * hot})`,
              transform: `scale(${1 - press * 0.04})`,
            }}>{value}</span>
            : value}
          {/* Solid dot: read from the university's page (the product's provenance mark). */}
          {index === 0 && <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.blue }} />}
        </span>
      </div>
    ))}
  </div>
}

function MatchPanel({ frame, dim }: { frame: number; dim: number }) {
  const p = progress(frame, s(0.4), 24)
  const highlight = progress(frame, MISSING() - s(0.15), s(0.6))
  const underline = progress(frame, MISSING() + s(0.5), s(0.6), glide)
  // Focus: the row that needs attention lifts, the rest step back, then settle.
  const focus = Math.min(progress(frame, MISSING() + s(0.1), s(0.6)), 1 - progress(frame, MISSING() + s(2.6), s(0.6)))
  return <div style={{
    position: 'absolute', left: PAD, top: MATCH_TOP, width: INNER,
    padding: '24px 26px 14px', borderRadius: R.card,
    background: C.surface, border: `1px solid ${C.line}`, boxShadow: SHADOW.lift,
    ...rise(p, 22), opacity: p * (1 - dim * 0.35),
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 18, borderBottom: `1px solid ${C.line}` }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <span style={{ color: C.inkFaint, font: `600 14px/1 ${FONT}`, letterSpacing: '0.04em', textTransform: 'uppercase' }}>How you match this course</span>
        <span style={{ color: C.ink, font: `700 25px/1.1 ${FONT}`, letterSpacing: '-0.015em' }}>You are close: 1 requirement to go</span>
      </div>
      <Badge tone="close" size={15}>3 of 4 met</Badge>
    </div>
    {REQUIREMENTS.map((req, index) => {
      const at = vo('match.grades', 0.45 + index * 0.25) / FPS
      const rowP = progress(frame, s(at), 18)
      const icon = pop(frame, s(at + 0.08), { damping: 11, stiffness: 220 })
      const close = req.verdict === 'close'
      return <div key={req.label} style={{
        position: 'relative', height: close ? CLOSE_ROW_H : ROW_H,
        display: 'grid', gridTemplateColumns: '40px 168px 1fr', alignItems: close ? 'start' : 'center',
        paddingTop: close ? 18 : 0,
        borderBottom: index < REQUIREMENTS.length - 1 ? `1px solid ${C.line}` : undefined,
        ...rise(rowP, 12),
        opacity: rowP * (close ? 1 : 1 - focus * 0.5),
        transform: `${rise(rowP, 12).transform} scale(${close ? 1 + focus * 0.03 : 1})`,
        transformOrigin: '30% 50%',
        zIndex: close ? 1 : 0,
      }}>
        {close && <span style={{
          position: 'absolute', left: -12, right: -12, top: 6, bottom: 6, borderRadius: 14,
          background: C.closeSoft, clipPath: `inset(0 ${100 - highlight * 100}% 0 0 round 14px)`,
          boxShadow: focus > 0 ? `0 ${12 * focus}px ${32 * focus}px rgba(149, 97, 0, ${0.16 * focus})` : undefined,
        }} />}
        <span style={{
          position: 'relative', width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center',
          color: close ? C.warningInk : C.successInk, background: close ? '#f7e3bb' : C.metSoft,
          transform: `scale(${icon})`,
        }}>
          {close ? <TriangleAlert size={16} strokeWidth={2.3} /> : <Check size={17} strokeWidth={2.8} />}
        </span>
        <span style={{ position: 'relative', color: C.inkFaint, font: `500 16px/1.3 ${FONT}`, paddingTop: close ? 4 : 0 }}>{req.label}</span>
        <span style={{ position: 'relative', display: 'grid', gap: 7, paddingTop: close ? 2 : 0 }}>
          <span style={{
            color: close ? C.warningInk : C.inkSoft, whiteSpace: 'nowrap',
            font: `${close ? 700 : 400} 18px/1.3 ${FONT}`,
          }}>
            {req.detail}
            {close && <span style={{
              display: 'block', height: 3, marginTop: 4, borderRadius: 3, background: C.amber,
              width: `${underline * 100}%`,
            }} />}
          </span>
          {close && req.asks && <span style={{ color: C.inkFaint, font: `400 15px/1 ${FONT}` }}>Asks for: {req.asks}</span>}
        </span>
      </div>
    })}
  </div>
}

function Drawer({ frame, p }: { frame: number; p: number }) {
  const t = (seconds: number) => s(EVIDENCE_AT + seconds)
  const highlight = progress(frame, ev('evidence.source', 2.05), s(0.5), glide)
  const confidence = progress(frame, ev('evidence.source', 2.5), s(0.8))
  // The question is asked as the narrator says "when there's no source"; the
  // answer lands on "Scrapal says so".
  const q = pop(frame, ev('evidence.silence', -0.5), { damping: 15, stiffness: 190 })
  const a = progress(frame, ev('evidence.silence', 1.1), 14)
  const typingA = frame >= ev('evidence.silence', -0.1) && frame < ev('evidence.silence', 1.1)
  const parts = COURSE.excerpt

  const row = (Icon: typeof Clock, text: string, at: number, extra?: ReactNode) => {
    const r = progress(frame, t(at), 16)
    return <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.inkSoft, font: `500 16px/1.2 ${FONT}`, ...rise(r, 10) }}>
      <Icon size={18} strokeWidth={1.9} color={C.inkFaint} />{text}{extra}
    </div>
  }

  return <div style={{
    position: 'absolute', ...DRAWER, padding: 26,
    display: 'flex', flexDirection: 'column', gap: 16,
    borderRadius: R.card, background: C.surface, border: `1px solid ${C.line}`, boxShadow: SHADOW.liftHigh,
    transform: `translateX(${(1 - p) * (DRAWER.width + 40)}px)`, opacity: Math.min(1, p * 2),
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ color: C.ink, font: `700 21px/1 ${FONT}`, letterSpacing: '-0.01em' }}>Where this came from</span>
      <X size={20} color={C.inkFaint} />
    </div>
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={{ color: C.inkFaint, font: `500 15px/1 ${FONT}` }}>Tuition · international students</span>
      <span style={{ color: C.ink, font: `700 40px/1 ${FONT}`, letterSpacing: '-0.03em' }}>{COURSE.tuition}</span>
    </div>
    <span style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12,
      color: C.blue, background: C.blueWash, font: `600 14.5px/1.2 ${FONT}`,
    }}>
      <Globe size={16} strokeWidth={2} style={{ flex: 'none' }} />
      <span style={{ flex: 1 }}>{COURSE.source}</span>
      <ExternalLink size={15} strokeWidth={2} style={{ flex: 'none' }} />
    </span>
    <blockquote style={{
      margin: 0, padding: '14px 16px', borderLeft: `3px solid ${C.blue}`, borderRadius: '4px 12px 12px 4px',
      background: C.surface2, color: C.ink, font: `400 18px/1.55 ${FONT}`,
    }}>
      “{parts[0]}
      <span style={{
        fontWeight: 700, padding: '1px 3px', margin: '0 -3px', borderRadius: 4,
        backgroundImage: 'linear-gradient(rgba(70, 92, 255, 0.22), rgba(70, 92, 255, 0.22))',
        backgroundRepeat: 'no-repeat', backgroundSize: `${highlight * 100}% 100%`,
      }}>{parts[1]}</span>
      {parts[2]}”
    </blockquote>
    <div style={{ display: 'grid', gap: 12 }}>
      {row(Clock, 'Read 2 days ago', 3.2)}
      {row(ShieldCheck, 'Confidence: high', 3.35, <span style={{ marginLeft: 'auto', width: 110, height: 8, borderRadius: 8, background: C.surface2, overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${confidence * 97}%`, background: C.emerald, borderRadius: 8 }} />
      </span>)}
      {row(History, 'Unchanged since 12 September', 3.5)}
    </div>

    {/* Evidence or silence: with no source, Scrapal says so. */}
    <div style={{ marginTop: 'auto', display: 'grid', gap: 10, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
      <div style={{ justifySelf: 'end', opacity: Math.min(1, q * 1.4), transform: `scale(${0.85 + 0.15 * q})`, transformOrigin: 'right bottom',
        padding: '10px 14px', borderRadius: '14px 14px 4px 14px', background: C.blue, color: '#fff', font: `500 16px/1.3 ${FONT}` }}>
        Is the scholarship guaranteed?
      </div>
      {(typingA || a > 0) && <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        <span style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center', border: `1px solid ${C.line}` }}>
          <Img src={staticFile('brand/scrapal-icon.svg')} style={{ width: 19 }} />
        </span>
        <span style={{ padding: '10px 14px', borderRadius: '4px 14px 14px 14px', border: `1px solid ${C.line}`, color: C.ink, font: `400 16px/1.4 ${FONT}` }}>
          {typingA ? <Dots frame={frame} size={8} /> : <span style={{ opacity: a }}>I don’t have a source for that, so I won’t guess.</span>}
        </span>
      </div>}
    </div>
  </div>
}

export const COURSE_CUES: Cue[] = [
  ...REQUIREMENTS.map((req, index) => ({ at: vo('match.grades', 0.45 + index * 0.25), name: req.verdict === 'close' ? 'pop-low' as const : 'pop-hi' as const, volume: 0.14 })),
  { at: MISSING() - s(0.15), name: 'highlight', volume: 0.2 },
  { at: MISSING() + s(0.1), name: 'whoosh-soft', volume: 0.12 },
  { at: s(CLICK_TUITION), name: 'click', volume: 0.26 },
  { at: s(CLICK_TUITION + 0.1), name: 'whoosh-soft', volume: 0.22 },
  { at: ev('evidence.source', 1.45), name: 'thread', volume: 0.26 },
  { at: ev('evidence.source', 2.05), name: 'highlight', volume: 0.22 },
  { at: ev('evidence.silence', -0.5), name: 'pop-hi', volume: 0.18 },
  { at: ev('evidence.silence', 1.1), name: 'pop', volume: 0.2 },
]
