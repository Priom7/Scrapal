// Course intelligence, review queue. Extraction proposes; a person publishes.
// The record shows exactly what moved since the last publish, with the
// sentence that supports it; "Publish" makes it live and the toast offers
// Undo (console: "Published" / "Could not undo" mutations in App.tsx).
import { ArrowRight, Check, ExternalLink, Undo2, UserCheck } from 'lucide-react'
import { glide, pop, progress, rise } from '../../anim'
import { CONTENT } from '../../components/AppWindow'
import { Cursor, pressAt, type CursorKey } from '../../components/Cursor'
import type { Cue } from '../../components/Sfx'
import { useTokens } from '../../components/tokens'
import { Avatar, Badge, Button, IconTile } from '../../components/ui'
import { COURSE } from '../../data'
import { FPS, s } from '../../timeline'
import { FONT, MONO, R } from '../../theme'
import { vo } from '../film'

const PAD = 36
const INNER = CONTENT.width - PAD * 2
const CARD_TOP = 120

const DIFF_AT = vo('review.diff', 0.9) / FPS
const PUBLISH = vo('review.diff', 2.45) / FPS
const UNDO_HOVER = vo('review.diff', 3.35) / FPS
const PUBLISH_BUTTON = { x: PAD + INNER - 82, y: CARD_TOP + 494 }
const UNDO_BUTTON = { x: CONTENT.width - 24 - 70, y: CONTENT.height - 24 - 34 }

export function Review({ frame }: { frame: number }) {
  const t = useTokens()
  const published = progress(frame, s(PUBLISH), 10)
  const counts = [
    { n: 92, label: 'All courses' },
    { n: published > 0.5 ? 65 : 64, label: 'Published' },
    { n: published > 0.5 ? 23 : 24, label: 'Need review', active: true },
    { n: 4, label: 'Rejected' },
  ]
  const required = Math.max(0, Math.sin((frame - vo('review.person', 1.6)) / 9)) * (1 - published) * (frame > vo('review.person', 1.6) ? 1 : 0)

  const keys: CursorKey[] = [
    { f: s(PUBLISH - 1.0), x: 520, y: 720 },
    { f: s(PUBLISH - 0.2), x: PUBLISH_BUTTON.x, y: PUBLISH_BUTTON.y },
    { f: s(PUBLISH), x: PUBLISH_BUTTON.x, y: PUBLISH_BUTTON.y, click: true },
    { f: s(UNDO_HOVER - 0.1), x: UNDO_BUTTON.x, y: UNDO_BUTTON.y },
  ]

  return <div style={{ position: 'absolute', inset: 0, fontFamily: FONT }}>
    {/* Tally — the console's course-tally strip. */}
    <div style={{ position: 'absolute', left: PAD, top: 22, width: INNER, height: 80, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderRadius: R.card, border: `1px solid ${t.line}`, background: t.surface, overflow: 'hidden', ...rise(progress(frame, 0, 16), 10) }}>
      {counts.map((count, index) => <div key={count.label} style={{
        display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 20px', alignSelf: 'stretch', alignContent: 'center', flexWrap: 'wrap',
        paddingTop: 26, borderLeft: index ? `1px solid ${t.line}` : undefined,
        boxShadow: count.active ? `inset 0 -3px ${t.blue}` : undefined, background: count.active ? t.blueWash : undefined,
      }}>
        <span style={{ color: t.ink, font: `700 26px/1 ${FONT}`, fontVariantNumeric: 'tabular-nums' }}>{count.n}</span>
        <span style={{ color: t.inkSoft, font: `500 16px/1 ${FONT}` }}>{count.label}</span>
      </div>)}
    </div>

    {/* The record under review */}
    <div style={{ position: 'absolute', left: PAD, top: CARD_TOP, width: INNER, padding: '20px 22px', borderRadius: R.card, background: t.surface, border: `1px solid ${t.line}`, display: 'grid', gap: 16, ...rise(progress(frame, vo('review.person', -0.2), 20), 18) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Avatar initials={COURSE.initials} color={COURSE.color} size={50} style={{ borderRadius: 14 }} />
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ color: t.ink, font: `700 21px/1 ${FONT}` }}>{COURSE.title}</span>
          <span style={{ color: t.inkSoft, font: `500 14.5px/1 ${FONT}` }}>{COURSE.institution} · {COURSE.city}</span>
        </div>
        <span style={{ marginLeft: 'auto', boxShadow: required > 0 ? `0 0 0 ${5 * required}px rgba(240, 183, 78, 0.14)` : undefined, borderRadius: 99 }}>
          {published > 0.5 ? <Badge tone="met" icon={Check} size={13.5}>Published</Badge> : <Badge tone="close" icon={UserCheck} size={13.5}>Required operator review</Badge>}
        </span>
      </div>

      <div style={{ borderRadius: R.panel, border: `1px solid ${t.line}`, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: t.surface2, color: t.inkSoft, font: `600 13.5px/1 ${FONT}` }}>Changed since the last publish</div>
        {[
          ['tuition_international', '£16,900', '£17,500'],
          ['application_deadline', '30 June', '15 June'],
        ].map(([field, was, now], index) => {
          const p = progress(frame, s(DIFF_AT + index * 0.45), s(0.4), glide)
          return <div key={field} style={{
            display: 'grid', gridTemplateColumns: '230px 1fr', alignItems: 'center', height: 50, padding: '0 16px',
            borderTop: `1px solid ${t.line}`, background: `rgba(240, 183, 78, ${0.06 * p})`,
          }}>
            <span style={{ color: t.inkFaint, font: `500 14px/1 ${MONO}` }}>{field}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, font: `700 18px/1 ${FONT}` }}>
              <span style={{ color: t.inkFaint, textDecoration: p > 0.3 ? 'line-through' : 'none' }}>{was}</span>
              <ArrowRight size={16} color={t.inkFaint} style={{ opacity: p }} />
              <span style={{ color: t.warningInk, opacity: p, transform: `translateX(${(1 - p) * -10}px)` }}>{now}</span>
            </span>
          </div>
        })}
      </div>

      <blockquote style={{ margin: 0, padding: '12px 16px', borderLeft: `3px solid ${t.blue}`, borderRadius: '4px 12px 12px 4px', background: t.surface2, color: t.ink, font: `400 16.5px/1.5 ${FONT}` }}>
        “Tuition for international students is <b>£17,500</b> for the full course (2027/28 entry).”
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, color: t.blue, font: `600 13.5px/1 ${FONT}` }}>Open captured source <ExternalLink size={13} /></span>
      </blockquote>

      <div style={{ display: 'grid', gap: 7 }}>
        <span style={{ color: t.inkSoft, font: `600 13.5px/1 ${FONT}` }}>Review note</span>
        <span style={{ display: 'flex', alignItems: 'center', height: 44, padding: '0 14px', borderRadius: R.input, background: t.paper, border: `1px solid ${t.line}`, color: t.ink, font: `400 15.5px/1 ${FONT}` }}>
          Fee rose for 2027/28 entry. Matches the captured page.
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Button variant="secondary" size={15}>Reject record</Button>
        <Button icon={published > 0.5 ? Check : undefined} size={15} pressed={pressAt(frame, s(PUBLISH))}>{published > 0.5 ? 'Published' : 'Publish'}</Button>
      </div>
    </div>

    {/* Published — with Undo, because publishing changes what students see. */}
    {(() => {
      const toast = pop(frame, s(PUBLISH + 0.2), { damping: 16, stiffness: 160 })
      if (toast <= 0.01) return null
      const hover = progress(frame, s(UNDO_HOVER), 8)
      return <div style={{
        position: 'absolute', right: 24, bottom: 24, width: 470, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center',
        borderRadius: R.panel, background: t.surface2, border: `1px solid ${t.metLine}`, boxShadow: t.shadowHigh,
        opacity: Math.min(1, toast * 1.4), transform: `translateY(${(1 - toast) * 30}px)`,
      }}>
        <IconTile icon={Check} tone="met" size={38} />
        <span style={{ flex: 1, display: 'grid', gap: 5 }}>
          <span style={{ color: t.ink, font: `700 15.5px/1 ${FONT}` }}>Published</span>
          <span style={{ color: t.inkSoft, font: `400 13.5px/1.3 ${FONT}` }}>MSc Data Science is live for students.</span>
        </span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 12,
          border: `1.5px solid ${hover > 0.5 ? t.blue : t.line}`, background: hover > 0.5 ? t.blueWash : 'transparent',
          color: hover > 0.5 ? t.blue : t.ink, font: `600 14.5px/1 ${FONT}`,
        }}><Undo2 size={15} /> Undo</span>
      </div>
    })()}

    <Cursor keys={keys} frame={frame} opacity={progress(frame, s(PUBLISH - 1.0), 10)} />
  </div>
}

export function reviewCues(): Cue[] {
  return [
    ...[0, 1].map((index) => ({ at: s(DIFF_AT + index * 0.45), name: 'highlight' as const, volume: 0.16 })),
    { at: s(PUBLISH), name: 'click', volume: 0.3 },
    { at: s(PUBLISH + 0.2), name: 'success', volume: 0.22 },
  ]
}
