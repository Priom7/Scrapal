// "Plan your study" — the chat-first planner (student/planner). Scrapal leads,
// one question at a time, always with tappable answers; each answer fills the
// plan strip; the shortlist arrives inline, closest match first. The lines are
// the planner script's own.
//
// The scene opens on Amara, the student the film follows, as the narrator
// introduces her; her card then docks into the plan she is about to fill.
import { ArrowUp, Check, GraduationCap, MapPin, Target, TriangleAlert } from 'lucide-react'
import { Img, staticFile } from 'remotion'
import { exit, glide, map, pop, progress, rise, typed } from '../../anim'
import { CONTENT } from '../../components/AppWindow'
import { Cursor, pressAt, type CursorKey } from '../../components/Cursor'
import type { Cue } from '../../components/Sfx'
import { Avatar, Dots, mix } from '../../components/ui'
import { PERSONA, SHORTLIST, STUDENT } from '../../data'
import { FPS, s } from '../../timeline'
import { vo } from '../../vo'
import { C, FONT, R, SHADOW } from '../../theme'

const COL_X = 101
const COL_W = 640
const INDENT = 50
const VIEW_TOP = 86
const VIEW_H = 508
const GAP = 14
const TYPING_H = 54

type ChipSpec = [label: string, width: number]
type Item =
  | { kind: 'scrapal'; at: number; h: number; text: string }
  | { kind: 'user'; at: number; h: number; text: string }
  | { kind: 'chips'; at: number; h: number; chips: ChipSpec[]; pick?: number; pickAt?: number }
  | { kind: 'cards'; at: number; h: number }

// Seconds into the scene. The questions run under "Scrapal asks one question
// at a time, and her plan fills in as she answers"; the shortlist lands on
// "In seconds, she has a shortlist."
const ASKS = vo('plan.asks') / FPS
const SHORT = vo('plan.shortlist') / FPS
const CLICK = { subject: ASKS + 0.95, level: ASKS + 2.3, input: ASKS + 3.15, send: ASKS + 4.25, card: SHORT + 2.8 }
const TYPE_FROM = CLICK.input + 0.1
const REPLY = 'UK, starting September 2027'
/** When Amara's card leaves the middle of the window for the plan strip. */
const DOCK_AT = ASKS - 0.6

const ITEMS: Item[] = [
  { kind: 'scrapal', at: DOCK_AT - 0.1, h: 112, text: 'Hi. I can help you work out where you could study, what it would cost, and whether you would get in. Nothing you tell me leaves this device.' },
  { kind: 'scrapal', at: ASKS + 0.05, h: 56, text: 'What do you want to study?' },
  { kind: 'chips', at: ASKS + 0.25, h: 90, pick: 0, pickAt: CLICK.subject, chips: [['Data Science', 150], ['Business Management', 214], ['Cyber Security', 160], ['Nursing', 104], ['Not sure yet', 136]] },
  { kind: 'user', at: CLICK.subject + 0.15, h: 56, text: STUDENT.subject },
  { kind: 'scrapal', at: CLICK.subject + 0.7, h: 56, text: 'Is this your first degree, or a master’s?' },
  { kind: 'chips', at: CLICK.subject + 0.85, h: 40, pick: 1, pickAt: CLICK.level, chips: [['First degree', 140], ['Master’s', 112], ['Not sure yet', 136]] },
  { kind: 'user', at: CLICK.level + 0.15, h: 56, text: STUDENT.level },
  { kind: 'scrapal', at: CLICK.level + 0.55, h: 84, text: 'Anywhere in particular? I have courses in the UK, Ireland and New Zealand so far.' },
  { kind: 'chips', at: CLICK.level + 0.7, h: 40, chips: [['United Kingdom', 170], ['Ireland', 100], ['New Zealand', 148], ['Anywhere', 118]] },
  { kind: 'user', at: CLICK.send + 0.15, h: 56, text: REPLY },
  { kind: 'scrapal', at: SHORT - 0.3, h: 56, text: 'Here are three that fit, closest match first.' },
  { kind: 'cards', at: SHORT, h: 3 * 104 + 2 * 10 },
]

const typingFrom = (item: Item) => (item.kind === 'scrapal' ? item.at - 0.45 : item.at)

function grow(item: Item, frame: number) {
  return progress(frame, s(typingFrom(item)), 16)
}

function heightOf(item: Item, frame: number) {
  const g = grow(item, frame)
  if (item.kind !== 'scrapal') return item.h * g
  return map(frame, [s(item.at), s(item.at) + 12], [TYPING_H, item.h]) * g
}

function topOf(index: number, frame: number) {
  let y = 0
  for (let i = 0; i < index; i++) y += heightOf(ITEMS[i], frame) + GAP * grow(ITEMS[i], frame)
  return y
}

function scrollAt(frame: number) {
  return Math.max(0, topOf(ITEMS.length, frame) - VIEW_H)
}

/** Centre of chip `chip` in item `index`, in content coordinates, as it sits at `frame`. */
function chipCentre(index: number, chip: number, frame: number) {
  const item = ITEMS[index] as Extract<Item, { kind: 'chips' }>
  let x = COL_X + INDENT
  let y = 0
  for (let i = 0; i < chip; i++) {
    x += item.chips[i][1] + 10
    if (x + item.chips[i + 1][1] > COL_X + COL_W) { x = COL_X + INDENT; y += 50 }
  }
  return { x: x + item.chips[chip][1] / 2, y: VIEW_TOP + topOf(index, frame) - scrollAt(frame) + y + 20 }
}

export function Plan({ frame }: { frame: number }) {
  const scroll = scrollAt(frame)
  const subjectChip = chipCentre(2, 0, s(CLICK.subject))
  const levelChip = chipCentre(5, 1, s(CLICK.level))
  const cardsTop = VIEW_TOP + topOf(11, s(CLICK.card)) - scrollAt(s(CLICK.card))

  const cursorIn = ASKS + 0.3
  const keys: CursorKey[] = [
    { f: s(cursorIn), x: 880, y: 760 },
    { f: s(CLICK.subject - 0.17), x: subjectChip.x + 8, y: subjectChip.y + 6 },
    { f: s(CLICK.subject), x: subjectChip.x + 8, y: subjectChip.y + 6, click: true },
    { f: s(CLICK.level - 0.15), x: levelChip.x + 6, y: levelChip.y + 6 },
    { f: s(CLICK.level), x: levelChip.x + 6, y: levelChip.y + 6, click: true },
    { f: s(CLICK.input - 0.12), x: 330, y: 642 },
    { f: s(CLICK.input), x: 330, y: 642, click: true },
    { f: s(CLICK.send - 0.14), x: COL_X + COL_W - 28, y: 640 },
    { f: s(CLICK.send), x: COL_X + COL_W - 28, y: 640, click: true },
    { f: s(CLICK.card - 0.3), x: COL_X + COL_W - 120, y: cardsTop + 2 * 114 + 52 },
    { f: s(CLICK.card), x: COL_X + COL_W - 120, y: cardsTop + 2 * 114 + 52, click: true },
  ]

  const typedText = frame >= s(CLICK.send) ? '' : typed(REPLY, frame, s(TYPE_FROM), 32)
  const sendPress = pressAt(frame, s(CLICK.send))

  return <div style={{ position: 'absolute', inset: 0, fontFamily: FONT }}>
    <PlanStrip frame={frame} />

    {/* The conversation, scrolled so the newest line sits above the input. */}
    <div style={{
      position: 'absolute', left: 0, right: 0, top: VIEW_TOP, height: VIEW_H, overflow: 'hidden',
      WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, black 28px, black 100%)',
      maskImage: 'linear-gradient(to bottom, transparent 0, black 28px, black 100%)',
    }}>
      <div style={{ position: 'absolute', left: COL_X, width: COL_W, top: 0, transform: `translateY(${-scroll}px)` }}>
        {ITEMS.map((item, index) => {
          const h = heightOf(item, frame)
          if (h <= 0.5) return null
          return <div key={index} style={{ height: h, marginBottom: GAP * grow(item, frame), position: 'relative' }}>
            <ItemView item={item} frame={frame} />
          </div>
        })}
      </div>
    </div>

    {/* Input — "Type your answer, or tap one above" */}
    <div style={{ position: 'absolute', left: COL_X, width: COL_W, top: CONTENT.height - 24 - 64, height: 64, display: 'flex', gap: 12 }}>
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', padding: '0 22px',
        borderRadius: R.input, background: C.surface, boxShadow: SHADOW.lift,
        border: `1.5px solid ${frame >= s(CLICK.input) && frame < s(CLICK.send) ? C.blue : C.line}`,
        font: `400 19px/1 ${FONT}`, color: typedText ? C.ink : C.inkFaint,
      }}>
        {typedText || 'Type your answer, or tap one above'}
        {frame >= s(CLICK.input) && frame < s(CLICK.send) && Math.floor(frame / 16) % 2 === 0 && (
          <span style={{ width: 2, height: 24, marginLeft: 2, background: C.blue }} />
        )}
      </div>
      <span style={{
        width: 64, height: 64, borderRadius: '50%', display: 'grid', placeItems: 'center',
        background: typedText.length ? C.blue : mix(C.blue, C.cloud, 0.55), color: '#fff',
        transform: `scale(${1 - sendPress * 0.08})`,
      }}><ArrowUp size={26} strokeWidth={2.2} /></span>
    </div>

    <Persona frame={frame} />
    <Cursor keys={keys} frame={frame} opacity={progress(frame, s(cursorIn), 10)} />
  </div>
}

/** Amara, introduced, then folded into her plan. */
function Persona({ frame }: { frame: number }) {
  const meet = vo('plan.meet')
  const appear = pop(frame, meet, { damping: 15, stiffness: 150 })
  const goal = progress(frame, meet + s(1.45), s(0.5))
  const dock = progress(frame, s(DOCK_AT), s(0.6), glide)
  if (appear <= 0.001 || dock >= 1) return null

  // From the middle of the window to the avatar at the head of the plan strip.
  const from = { x: CONTENT.width / 2, y: 330 }
  const to = { x: 40 + 19, y: 18 + 26 }
  const x = from.x + (to.x - from.x) * dock
  const y = from.y + (to.y - from.y) * dock
  const scale = (0.86 + 0.14 * appear) * (1 - dock * 0.92)

  return <>
    {/* The chat steps back while she is introduced. */}
    <div style={{ position: 'absolute', inset: 0, background: C.paper, opacity: 0.72 * Math.min(1, appear) * (1 - dock) }} />
    <div style={{
      position: 'absolute', left: x, top: y, width: 460,
      transform: `translate(-50%, -50%) scale(${scale})`, opacity: Math.min(1, appear * 1.4) * (1 - progress(frame, s(DOCK_AT + 0.35), s(0.25), exit)),
      padding: 28, borderRadius: R.card, background: C.surface, border: `1px solid ${C.line}`, boxShadow: SHADOW.liftHigh,
      display: 'grid', gap: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <Avatar initials={PERSONA.initials} color={C.blue} size={84} style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.sky} 60%, ${C.mint})`, fontSize: 34 }} />
        <div style={{ display: 'grid', gap: 8 }}>
          <span style={{ color: C.inkFaint, font: `600 14px/1 ${FONT}`, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Meet</span>
          <span style={{ color: C.ink, font: `700 36px/1 ${FONT}`, letterSpacing: '-0.03em' }}>{PERSONA.name}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.inkSoft, font: `500 16px/1 ${FONT}` }}>
            <MapPin size={16} /> {PERSONA.from}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {PERSONA.facts.map((fact, index) => (
          <span key={fact} style={{ ...rise(progress(frame, meet + s(0.35 + index * 0.12), 14), 8), display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 13px', borderRadius: R.pill, background: C.surface2, color: C.inkSoft, font: `600 15px/1 ${FONT}` }}>
            {index === 0 && <GraduationCap size={15} />}{fact}
          </span>
        ))}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 14,
        background: C.blueWash, color: C.blue, font: `600 18px/1.2 ${FONT}`, ...rise(goal, 10),
      }}>
        <Target size={20} strokeWidth={2} /> Wants a master’s in Data Science
      </div>
    </div>
  </>
}

function PlanStrip({ frame }: { frame: number }) {
  const slots = [
    { empty: 'Subject', value: STUDENT.subject, at: CLICK.subject + 0.2 },
    { empty: 'Level', value: STUDENT.level, at: CLICK.level + 0.2 },
    { empty: 'Where', value: STUDENT.country, at: CLICK.send + 0.2 },
    { empty: 'When', value: STUDENT.intake, at: CLICK.send + 0.32 },
  ]
  return <div style={{
    position: 'absolute', left: 40, right: 40, top: 18, height: 52,
    display: 'flex', alignItems: 'center', gap: 10,
  }}>
    {(() => {
      const docked = pop(frame, s(DOCK_AT + 0.5), { damping: 12, stiffness: 200 })
      return <span style={{ display: 'flex', alignItems: 'center', gap: 9, marginRight: 4 }}>
        <Avatar initials={PERSONA.initials} color={C.blue} size={38} style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.sky} 60%, ${C.mint})`, transform: `scale(${docked})` }} />
        <span style={{ color: C.inkFaint, font: `600 15px/1 ${FONT}`, whiteSpace: 'nowrap', opacity: Math.min(1, docked) }}>{PERSONA.name}’s plan</span>
      </span>
    })()}
    {slots.map((slot) => {
      const filled = pop(frame, s(slot.at), { damping: 13, stiffness: 190 })
      const on = Math.min(1, filled)
      return <span key={slot.empty} style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        height: 36, padding: '0 12px', borderRadius: R.pill, whiteSpace: 'nowrap',
        border: `1.5px ${on > 0.5 ? 'solid' : 'dashed'} ${on > 0.5 ? '#d9dfff' : C.line}`,
        background: on > 0.5 ? C.blueWash : 'transparent',
        color: on > 0.5 ? C.blue : C.inkFaint,
        font: `600 15px/1 ${FONT}`,
        transform: `scale(${0.9 + 0.1 * filled})`,
      }}>
        {on > 0.5 && <Check size={15} strokeWidth={2.6} />}
        {on > 0.5 ? slot.value : slot.empty}
      </span>
    })}
  </div>
}

function ItemView({ item, frame }: { item: Item; frame: number }) {
  if (item.kind === 'scrapal') {
    const shown = frame >= s(item.at)
    const p = progress(frame, s(item.at), 14)
    return <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{
        width: 38, height: 38, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center',
        background: C.surface, border: `1px solid ${C.line}`,
      }}>
        <Img src={staticFile('brand/scrapal-icon.svg')} style={{ width: 24 }} />
      </span>
      <div style={{
        maxWidth: 540, padding: shown ? '14px 18px' : '16px 18px', borderRadius: '6px 18px 18px 18px',
        background: C.surface, border: `1px solid ${C.line}`, boxShadow: SHADOW.lift,
        color: C.ink, font: `400 19px/1.45 ${FONT}`,
      }}>
        {shown ? <span style={{ opacity: p }}>{item.text}</span> : <Dots frame={frame} size={10} />}
      </div>
    </div>
  }

  if (item.kind === 'user') {
    const p = pop(frame, s(item.at), { damping: 15, stiffness: 200 })
    return <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{
        padding: '14px 18px', borderRadius: '18px 18px 6px 18px',
        background: C.blue, color: '#fff', font: `500 19px/1.45 ${FONT}`,
        transform: `scale(${0.85 + 0.15 * p})`, transformOrigin: 'right bottom', opacity: Math.min(1, p * 1.5),
      }}>{item.text}</div>
    </div>
  }

  if (item.kind === 'chips') {
    const picked = item.pickAt != null && frame >= s(item.pickAt)
    return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, paddingLeft: INDENT }}>
      {item.chips.map(([label, width], index) => {
        const p = pop(frame, s(item.at + index * 0.06), { damping: 14, stiffness: 200 })
        const isPick = item.pick === index
        const on = isPick && item.pickAt != null ? progress(frame, s(item.pickAt), 8) : 0
        const press = isPick && item.pickAt != null ? pressAt(frame, s(item.pickAt)) : 0
        return <span key={label} style={{
          width, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: R.pill,
          border: `1.5px solid ${mix('#d9dfff', C.blue, on)}`,
          background: mix(C.surface, C.blue, on),
          color: mix(C.blue, '#ffffff', on),
          font: `600 17px/1 ${FONT}`, whiteSpace: 'nowrap',
          opacity: Math.min(1, p * 1.4) * (picked && !isPick ? 0.45 : 1),
          transform: `scale(${(0.8 + 0.2 * p) * (1 - press * 0.06)})`,
        }}>{label}</span>
      })}
    </div>
  }

  // The shortlist, inline — the same card the planner renders.
  return <div style={{ display: 'grid', gap: 10 }}>
    {SHORTLIST.map((course, index) => {
      const p = progress(frame, s(item.at + index * 0.14), 22)
      const press = index === 2 ? pressAt(frame, s(CLICK.card)) : 0
      const chosen = index === 2 ? progress(frame, s(CLICK.card), 10) : 0
      const met = course.verdict === 'met'
      return <div key={course.title} style={{
        ...rise(p, 24),
        height: 104, display: 'flex', alignItems: 'center', gap: 18, padding: '0 22px',
        borderRadius: R.panel, background: C.surface,
        border: `1.5px solid ${mix(C.line, C.blue, chosen)}`,
        boxShadow: chosen > 0 ? `0 0 0 ${4 * chosen}px rgba(70, 92, 255, 0.14), ${SHADOW.lift}` : SHADOW.lift,
        transform: `${rise(p, 24).transform} scale(${1 - press * 0.02})`,
      }}>
        <Avatar initials={course.initials} color={course.color} size={54} style={{ borderRadius: 15 }} />
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 6 }}>
          <span style={{ color: C.inkFaint, font: `500 15px/1 ${FONT}` }}>{course.institution} · {course.city}</span>
          <span style={{ color: C.ink, font: `700 20px/1.1 ${FONT}`, letterSpacing: '-0.01em' }}>{course.title}</span>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 6,
            color: met ? C.successInk : C.warningInk, font: `600 15px/1 ${FONT}`,
          }}>
            {met ? <Check size={16} strokeWidth={2.6} /> : <TriangleAlert size={16} strokeWidth={2.2} />}
            {course.headline}
          </span>
        </div>
        <div style={{ textAlign: 'right', display: 'grid', gap: 6 }}>
          <span style={{ color: C.inkFaint, font: `500 14px/1 ${FONT}` }}>Tuition</span>
          <span style={{ color: C.ink, font: `700 20px/1 ${FONT}` }}>{course.tuition}</span>
        </div>
      </div>
    })}
  </div>
}

export const PLAN_CUES: Cue[] = [
  { at: 0, name: 'whoosh', volume: 0.32 },
  ...ITEMS.filter((item) => item.kind === 'scrapal').map((item) => ({ at: s(item.at), name: 'pop' as const, volume: 0.26 })),
  ...ITEMS.filter((item) => item.kind === 'chips').map((item) => ({ at: s(item.at), name: 'pop-hi' as const, volume: 0.12 })),
  ...ITEMS.filter((item) => item.kind === 'user').map((item) => ({ at: s(item.at), name: 'pop-hi' as const, volume: 0.2 })),
  ...Object.values(CLICK).map((t) => ({ at: s(t), name: 'click' as const, volume: 0.45 })),
  { at: s(TYPE_FROM), name: 'typing', volume: 0.3, length: s(0.9) },
  ...[0, 1, 2].map((i) => ({ at: s(SHORT + i * 0.14), name: 'pop' as const, volume: 0.18 })),
  { at: vo('plan.meet'), name: 'pop', volume: 0.3 },
  { at: s(DOCK_AT), name: 'whoosh-soft', volume: 0.22 },
]
