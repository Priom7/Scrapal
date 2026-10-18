// 0:10–0:20 — the light comes up and the mark draws itself under the first
// line of narration; once the voice has finished, the brand's core message
// (guidelines p.02) in the hero banner pattern (p.05): one dominant line, one
// highlighted line, one short supporting sentence. Words on screen never
// compete with words being spoken.
//
// The message is a prop, so each film closes its brand moment on its own
// banner while the reveal stays identical.
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { exit, glide, map, progress } from '../anim'
import { LOCKUP_RATIO, LOGO_REVEAL_SECONDS, Logo } from '../brand/Logo'
import { Cues, type Cue } from '../components/Sfx'
import { s } from '../timeline'
import { STUDENT_VOICE, type Voice } from '../vo'
import { C, FONT } from '../theme'
import { FOCUS } from './Chaos'

const REVEAL_AT = 0.15
const BIG = 880
const SMALL = 400
/** The mark's centre sits 317 viewBox units left of the lockup's centre. */
const MARK_OFFSET = 317 / 905

export type BrandMessage = {
  /** Three banner lines; the last is the one set in brand blue. */
  lines: [string, string, string]
  support: string
}

/** The brand's core message (guidelines p.02). */
const CORE: BrandMessage = {
  lines: ['Discover People.', 'Opportunities.', 'A Brighter Research Future.'],
  support: 'Scrapal helps students and researchers find the right people, funding and opportunities to turn knowledge into impact.',
}

export function Brand({ voice = STUDENT_VOICE, lineId = 'brand.one', message = CORE, leaveAt = 9.5 }: {
  voice?: Voice
  /** The narration line the logo draws under; the message follows it. */
  lineId?: string
  message?: BrandMessage
  /** Seconds into the scene at which everything clears for the next one. */
  leaveAt?: number
}) {
  const frame = useCurrentFrame()
  const logoFrame = frame - s(REVEAL_AT)

  // While the mark draws it is centred alone; it makes room as the wordmark arrives.
  const wordmarkStart = s(REVEAL_AT + 0.95)
  const shift = 1 - progress(frame, wordmarkStart, s(0.85), glide)

  // Then the lock-up steps up and back to make room for the message.
  const messageAt = voice.voEnd(lineId, 0.05)
  const lift = progress(frame, messageAt - s(0.25), s(0.9), glide)
  const width = BIG + (SMALL - BIG) * lift
  const cy = FOCUS.y + (238 - FOCUS.y) * lift
  const leave = progress(frame, s(leaveAt), s(0.45), exit)

  const lines = message.lines.map((text, index) => ({
    text, at: messageAt + s(0.15 + index * 0.3), color: index === 2 ? C.blue : C.ink,
  }))
  const support = progress(frame, messageAt + s(1.5), s(0.7))

  return <AbsoluteFill style={{ fontFamily: FONT }}>
    <div style={{
      position: 'absolute', left: 960 - width / 2, top: cy - width / LOCKUP_RATIO / 2,
      transform: `translateX(${shift * MARK_OFFSET * width}px) translateY(${-leave * 30}px)`,
      opacity: 1 - leave,
    }}>
      <Logo frame={logoFrame} width={width} idleFrom={s(LOGO_REVEAL_SECONDS + 0.3)} />
    </div>


    <div style={{
      position: 'absolute', left: 0, right: 0, top: 392, textAlign: 'center',
      opacity: 1 - leave, transform: `translateY(${-leave * 40}px)`,
    }}>
      <h1 style={{ margin: 0, font: `700 104px/1.02 ${FONT}`, letterSpacing: '-0.042em' }}>
        {lines.map((line) => {
          const p = progress(frame, line.at, s(0.6))
          return <span key={line.text} style={{ display: 'block', overflow: 'hidden', paddingBottom: 12, marginBottom: -12 }}>
            <span style={{
              display: 'block', color: line.color,
              transform: `translateY(${(1 - p) * 105}%)`, opacity: Math.min(1, p * 1.6),
            }}>{line.text}</span>
          </span>
        })}
      </h1>
      <p style={{
        margin: '40px auto 0', maxWidth: 1020, color: C.inkSoft,
        font: `400 32px/1.45 ${FONT}`, letterSpacing: '-0.01em',
        opacity: support, transform: `translateY(${(1 - support) * 16}px)`,
      }}>
        {message.support}
      </p>
    </div>

    {/* A hairline thread under the message, drawn left to right as it lands. */}
    <div style={{
      position: 'absolute', left: 960 - 160, top: 905, width: 320, height: 4, borderRadius: 4,
      background: `linear-gradient(90deg, ${C.blue}, ${C.sky}, ${C.mint})`,
      transform: `scaleX(${map(frame, [messageAt + s(1.6), messageAt + s(2.4)], [0, 1], glide)})`, transformOrigin: 'left',
      opacity: 1 - leave,
    }} />
    <Cues cues={cues(messageAt)} />
  </AbsoluteFill>
}

function cues(messageAt: number): Cue[] {
  return [
    { at: s(REVEAL_AT + 0.05), name: 'shimmer', volume: 0.3 },
    { at: s(REVEAL_AT + 0.95), name: 'whoosh-soft', volume: 0.28 },
    ...[0.15, 0.45, 0.75].map((t) => ({ at: messageAt + s(t), name: 'whoosh-soft' as const, volume: 0.18 })),
  ]
}
