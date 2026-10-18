// Two beats on one page.
//   Check a claim (0–4.6s): paste what an agent said; Scrapal compares it with
//     what the university published and shows the wording (student/claims.ts —
//     "conflicting" is a difference, never an accusation).
//   Change watch (4.6–8s): only Scrapal keeps the earlier crawl, so it can say
//     what moved on a saved course (student/ChangeWatch.tsx).
import { ArrowDownRight, BellRing, CircleAlert, Globe } from 'lucide-react'
import { glide, pop, progress, rise, typed } from '../../anim'
import { CONTENT } from '../../components/AppWindow'
import { Cursor, pressAt, type CursorKey } from '../../components/Cursor'
import type { Cue } from '../../components/Sfx'
import { Button, Dots, IconTile } from '../../components/ui'
import { COURSE } from '../../data'
import { FPS, s } from '../../timeline'
import { vo } from '../../vo'
import { C, FONT, R, SHADOW } from '../../theme'

const PAD = 36
const INNER = CONTENT.width - PAD * 2
const CLAIM = 'My agent said tuition at Northbridge is £12,000 a year.'
/** The claim is typed as the narrator quotes the agent; the check runs on "Scrapal checks". */
const AGENT = vo('check.agent') / FPS
const CLICK = vo('check.published', -0.3) / FPS
const VERDICT = vo('check.published', 0.5) / FPS
/** "...and flags it when a page changes". */
export const WATCH_AT = vo('check.published', 2.75) / FPS

export function Check({ frame }: { frame: number }) {
  const text = typed(CLAIM, frame, s(AGENT + 0.05), 44)
  const checking = frame >= s(CLICK + 0.1) && frame < s(VERDICT)
  const verdict = progress(frame, s(VERDICT), 22)
  const highlight = progress(frame, s(VERDICT + 0.5), s(0.45), glide)
  const watch = pop(frame, s(WATCH_AT + 0.2), { damping: 16, stiffness: 150 })
  const watchRow = progress(frame, s(WATCH_AT + 0.75), s(0.5), glide)

  const keys: CursorKey[] = [
    { f: s(CLICK - 0.85), x: 600, y: 620 },
    { f: s(CLICK - 0.15), x: PAD + 90, y: 268 },
    { f: s(CLICK), x: PAD + 90, y: 268, click: true },
    { f: s(CLICK + 0.85), x: 520, y: 700 },
  ]

  const recede = progress(frame, s(WATCH_AT + 0.1), s(0.5))

  return <div style={{ position: 'absolute', inset: 0, fontFamily: FONT }}>
    <div style={{ position: 'absolute', inset: 0, opacity: 1 - recede * 0.45, filter: recede > 0 ? `saturate(${1 - recede * 0.4})` : undefined }}>
    <p style={{
      position: 'absolute', left: PAD, top: 22, width: 640, margin: 0,
      color: C.inkSoft, font: `400 18px/1.5 ${FONT}`, ...rise(progress(frame, 0, 18), 12),
    }}>
      Paste what an agent, a counsellor or a friend told you. Scrapal checks it against the pages universities actually published.
    </p>

    <div style={{
      position: 'absolute', left: PAD, top: 108, width: INNER, height: 118, padding: '18px 20px',
      borderRadius: R.input, background: C.surface, boxShadow: SHADOW.lift,
      border: `1.5px solid ${frame > s(AGENT - 0.1) && frame < s(CLICK) ? C.blue : C.line}`,
      color: text ? C.ink : C.inkFaint, font: `400 20px/1.5 ${FONT}`,
      ...rise(progress(frame, s(0.1), 18), 12),
    }}>
      {text || 'They told me…'}
      {frame > s(AGENT - 0.1) && frame < s(CLICK) && Math.floor(frame / 16) % 2 === 0 && (
        <span style={{ display: 'inline-block', width: 2, height: 24, marginLeft: 2, verticalAlign: -4, background: C.blue }} />
      )}
    </div>

    <div style={{ position: 'absolute', left: PAD, top: 244, display: 'flex', alignItems: 'center', gap: 16 }}>
      <Button pressed={pressAt(frame, s(CLICK))} size={17}>Check this</Button>
      {checking && <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.inkSoft, font: `500 17px/1 ${FONT}` }}>
        <Dots frame={frame} size={10} /> Checking published pages…
      </span>}
    </div>

    {/* The verdict, with the published wording to judge it by. */}
    <div style={{
      position: 'absolute', left: PAD, top: 316, width: INNER, padding: '22px 24px',
      borderRadius: R.card, background: C.surface, border: `1px solid ${C.line}`, boxShadow: SHADOW.lift,
      display: 'grid', gap: 16, ...rise(verdict, 20),
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <IconTile icon={CircleAlert} tone="close" size={46} />
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ color: C.warningInk, font: `700 22px/1.1 ${FONT}` }}>Different from what was published</span>
          <span style={{ color: C.inkFaint, font: `500 15px/1 ${FONT}` }}>{COURSE.institution} · Fees and funding</span>
        </div>
      </div>
      <blockquote style={{
        margin: 0, padding: '14px 18px', borderLeft: `3px solid ${C.blue}`, borderRadius: '4px 12px 12px 4px',
        background: C.surface2, color: C.ink, font: `400 19px/1.5 ${FONT}`,
      }}>
        “Tuition for international students is{' '}
        <span style={{
          fontWeight: 700, padding: '1px 3px', margin: '0 -3px', borderRadius: 4,
          backgroundImage: 'linear-gradient(rgba(70, 92, 255, 0.22), rgba(70, 92, 255, 0.22))',
          backgroundRepeat: 'no-repeat', backgroundSize: `${highlight * 100}% 100%`,
        }}>£17,500</span>{' '}for the full course.”
      </blockquote>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.blue, font: `600 15px/1 ${FONT}` }}>
        <Globe size={16} /> {COURSE.source.split('/')[0]} · read 2 days ago
      </span>
    </div>

    </div>

    {/* Change watch: a saved course moved. */}
    <div style={{
      position: 'absolute', right: 24, top: 18, width: 470, padding: '18px 20px',
      borderRadius: R.card, background: C.surface, border: `1px solid ${C.line}`, boxShadow: SHADOW.liftHigh,
      display: 'grid', gap: 14,
      opacity: Math.min(1, watch * 1.4), transform: `translateY(${(1 - watch) * -40}px) scale(${0.94 + 0.06 * watch})`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <IconTile icon={BellRing} size={42} />
        <div style={{ display: 'grid', gap: 5 }}>
          <span style={{ color: C.ink, font: `700 18px/1 ${FONT}` }}>Changed since you saved it</span>
          <span style={{ color: C.inkFaint, font: `500 14px/1 ${FONT}` }}>{COURSE.title} · {COURSE.institution}</span>
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12,
        background: C.warningWash, color: C.ink, font: `500 17px/1 ${FONT}`,
        clipPath: `inset(0 ${100 - watchRow * 100}% 0 0 round 12px)`,
      }}>
        <ArrowDownRight size={18} color={C.warningInk} strokeWidth={2.4} />
        Application deadline:
        <span style={{ color: C.inkFaint, textDecoration: 'line-through' }}>30 June</span>
        <span style={{ color: C.warningInk, fontWeight: 700 }}>15 June</span>
      </div>
      <span style={{ color: C.inkFaint, font: `400 14px/1.4 ${FONT}`, opacity: watchRow }}>
        Compared against the version Scrapal read 3 days ago.
      </span>
    </div>

    <Cursor keys={keys} frame={frame} opacity={Math.min(progress(frame, s(CLICK - 0.85), 10), 1 - progress(frame, s(CLICK + 0.65), 12))} />
  </div>
}

export const CHECK_CUES: Cue[] = [
  { at: s(AGENT + 0.05), name: 'typing', volume: 0.28, length: s(1.25) },
  { at: s(CLICK), name: 'click', volume: 0.45 },
  { at: s(VERDICT), name: 'alert', volume: 0.22 },
  { at: s(VERDICT + 0.5), name: 'highlight', volume: 0.2 },
  { at: s(WATCH_AT + 0.2), name: 'notify', volume: 0.38 },
]
