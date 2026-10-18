// "Your applications" (student/apply). The pack for one course: what this
// university asks for, each document's state, and a personal statement that
// arranges what the student actually said, quotes what the university actually
// published, and leaves every remaining gap marked for her (statement.ts:
// "this never invents anything about the student").
import {
  BookOpenCheck, CalendarClock, FileBadge, FileText, Globe, Languages, PenLine, ShieldCheck, UserCheck, type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { pop, progress, rise } from '../../anim'
import { CONTENT } from '../../components/AppWindow'
import type { Cue } from '../../components/Sfx'
import { Avatar, Badge, IconTile } from '../../components/ui'
import { COURSE } from '../../data'
import { vo, voEnd } from '../../vo'
import { C, FONT, R, SHADOW } from '../../theme'

const PAD = 36
const INNER = CONTENT.width - PAD * 2
const LEFT_W = 356
const RIGHT_X = PAD + LEFT_W + 20
const RIGHT_W = INNER - LEFT_W - 20

type Tone = 'met' | 'close' | 'blue' | 'neutral'
const DOCS: { icon: LucideIcon; label: string; state: string; tone: Tone }[] = [
  { icon: FileBadge, label: 'Passport', state: 'Ready', tone: 'met' },
  { icon: BookOpenCheck, label: 'Academic transcript', state: 'Ready', tone: 'met' },
  { icon: FileText, label: 'Degree certificate', state: 'Ready', tone: 'met' },
  // The half-band gap from the match scene, now with a plan.
  { icon: Languages, label: 'IELTS result', state: 'Retake booked', tone: 'close' },
  { icon: PenLine, label: 'Personal statement', state: 'Drafting', tone: 'blue' },
  { icon: UserCheck, label: 'Reference letter', state: 'Requested', tone: 'neutral' },
]

export function Apply({ frame }: { frame: number }) {
  const packAt = vo('apply.pack')
  const docsAt = vo('apply.docs')
  // "...and a personal statement in her own words" arrives about 40% into the line.
  const statementAt = docsAt + Math.round((voEnd('apply.docs') - docsAt) * 0.42)
  const neverAt = voEnd('apply.docs', -1.15)

  return <div style={{ position: 'absolute', inset: 0, fontFamily: FONT }}>
    {/* The course, and the deadline that moved in the last scene. */}
    <div style={{ position: 'absolute', left: PAD, right: PAD, top: 22, height: 46, display: 'flex', alignItems: 'center', gap: 12, ...rise(progress(frame, packAt - 12, 18), 10) }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, height: 46, padding: '0 16px 0 8px', borderRadius: R.pill, background: C.surface, border: `1px solid ${C.line}` }}>
        <Avatar initials={COURSE.initials} color={COURSE.color} size={32} style={{ borderRadius: 10 }} />
        <span style={{ color: C.ink, font: `600 17px/1 ${FONT}` }}>{COURSE.title} · {COURSE.institution}</span>
      </span>
      <span style={{ marginLeft: 'auto' }}><Badge tone="close" icon={CalendarClock} size={15}>Apply by 15 June</Badge></span>
    </div>

    {/* What this university asks for */}
    <div style={{
      position: 'absolute', left: PAD, top: 88, width: LEFT_W, padding: '20px 20px 10px',
      borderRadius: R.card, background: C.surface, border: `1px solid ${C.line}`, boxShadow: SHADOW.lift,
      ...rise(progress(frame, packAt, 22), 20),
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 }}>
        <span style={{ color: C.ink, font: `700 19px/1.1 ${FONT}` }}>What Northbridge asks for</span>
      </div>
      {DOCS.map((doc, index) => {
        const row = progress(frame, packAt + 8 + index * 6, 16)
        const state = pop(frame, docsAt + index * 9, { damping: 13, stiffness: 200 })
        return <div key={doc.label} style={{
          height: 72, display: 'flex', alignItems: 'center', gap: 12,
          borderTop: `1px solid ${C.line}`, opacity: row, transform: `translateX(${(1 - row) * -12}px)`,
        }}>
          <IconTile icon={doc.icon} size={40} tone={state > 0.5 ? (doc.tone === 'neutral' ? 'blue' : doc.tone) : 'blue'} />
          <span style={{ flex: 1, color: C.ink, font: `600 16.5px/1.2 ${FONT}` }}>{doc.label}</span>
          <span style={{ opacity: Math.min(1, state * 1.5), transform: `scale(${0.7 + 0.3 * state})` }}>
            <Badge tone={doc.tone} size={13.5}>{doc.state}</Badge>
          </span>
        </div>
      })}
    </div>

    {/* The statement: her words, their words, and the gap that is hers to fill. */}
    <div style={{
      position: 'absolute', left: RIGHT_X, top: 88, width: RIGHT_W, padding: '20px 22px',
      borderRadius: R.card, background: C.surface, border: `1px solid ${C.line}`, boxShadow: SHADOW.lift,
      display: 'grid', gap: 16, ...rise(progress(frame, statementAt - 10, 22), 20),
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 9, color: C.ink, font: `700 19px/1.1 ${FONT}` }}>
        <PenLine size={19} strokeWidth={2} color={C.blue} /> Your personal statement
      </span>

      <Section title="Why this course" p={progress(frame, statementAt, 18)}>
        <blockquote style={{ margin: 0, padding: '10px 14px', borderLeft: `3px solid ${C.mint}`, borderRadius: '4px 10px 10px 4px', background: C.successWash, color: C.ink, font: `400 16.5px/1.5 ${FONT}` }}>
          “I want to build models that help small businesses plan ahead.”
        </blockquote>
        <Source color={C.successInk}>Your words, from the chat</Source>
      </Section>

      <Section title="What you have done" p={progress(frame, statementAt + 14, 18)}>
        <span style={{
          display: 'block', padding: '12px 14px', borderRadius: 10,
          border: `1.5px dashed ${C.amber}`, background: C.warningWash,
          color: C.warningInk, font: `500 16px/1.45 ${FONT}`,
          boxShadow: `0 0 0 ${4 * Math.max(0, Math.sin((frame - statementAt) / 9))}px rgba(228, 167, 44, 0.12)`,
        }}>[ A project, a job or a module you did well in ]</span>
        <Source color={C.warningInk}>Only you can write this</Source>
      </Section>

      <Section title="Why Northbridge" p={progress(frame, statementAt + 28, 18)}>
        <blockquote style={{ margin: 0, padding: '10px 14px', borderLeft: `3px solid ${C.blue}`, borderRadius: '4px 10px 10px 4px', background: C.surface2, color: C.ink, font: `400 16.5px/1.5 ${FONT}` }}>
          “Every student completes an industry project with a partner organisation.”
        </blockquote>
        <Source color={C.blue} icon={Globe}>From Northbridge’s course page</Source>
      </Section>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
        <span style={{ color: C.inkFaint, font: `500 14.5px/1 ${FONT}`, whiteSpace: 'nowrap' }}>118 words · 1 gap left</span>
        <span style={{ opacity: Math.min(1, pop(frame, neverAt) * 1.4), transform: `scale(${0.6 + 0.4 * pop(frame, neverAt, { damping: 11, stiffness: 200 })})` }}>
          <Badge tone="met" icon={ShieldCheck} size={14.5}>Never invented</Badge>
        </span>
      </div>
    </div>
  </div>
}

function Section({ title, p, children }: { title: string; p: number; children: ReactNode }) {
  return <div style={{ display: 'grid', gap: 8, ...rise(p, 12) }}>
    <span style={{ color: C.inkFaint, font: `600 13px/1 ${FONT}`, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{title}</span>
    {children}
  </div>
}

function Source({ children, color, icon: Icon }: { children: ReactNode; color: string; icon?: LucideIcon }) {
  return <span style={{ display: 'flex', alignItems: 'center', gap: 6, color, font: `600 13.5px/1 ${FONT}` }}>
    {Icon && <Icon size={14} />}{children}
  </span>
}

export function applyCues(): Cue[] {
  const docsAt = vo('apply.docs')
  return [
    { at: vo('apply.pack'), name: 'whoosh-soft', volume: 0.22 },
    ...DOCS.map((_, index) => ({ at: docsAt + index * 9, name: 'pop-hi' as const, volume: 0.13 })),
    { at: voEnd('apply.docs', -1.15), name: 'success', volume: 0.24 },
  ]
}
