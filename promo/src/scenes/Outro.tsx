// 1:44–1:52 — the end card. The mark draws once more, the wordmark follows,
// then the line the brand closes on and a call to action. The lock-up sits in
// generous clear space, at full size, on Cloud (guidelines p.02).
import { ArrowRight } from 'lucide-react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { exit, glide, progress } from '../anim'
import { LOCKUP_RATIO, LOGO_REVEAL_SECONDS, Logo } from '../brand/Logo'
import { Cues } from '../components/Sfx'
import { Button } from '../components/ui'
import { s } from '../timeline'
import { STUDENT_VOICE, type Voice } from '../vo'
import { C, FONT } from '../theme'
import { GATHER } from './Montage'

const WIDTH = 800
const MARK_OFFSET = 317 / 905

export type OutroProps = {
  /** The button label on the end card. */
  cta: string
  /** A web address shown beside the button; hidden when empty. */
  url: string
}

export function Outro({ cta, url, voice = STUDENT_VOICE }: OutroProps & { voice?: Voice }) {
  const { vo, voEnd } = voice
  const frame = useCurrentFrame()
  const revealAt = s(0.05)
  const shift = 1 - progress(frame, revealAt + s(0.95), s(0.85), glide)
  // "Scrapal." is said as the wordmark completes; the tagline appears with its line.
  const settleUp = progress(frame, vo('outro.tagline', -0.6), s(0.8), glide)
  const tagline = progress(frame, vo('outro.tagline', -0.05), s(0.6))
  const action = progress(frame, voEnd('outro.tagline', 0.2), s(0.6))
  const fadeOut = progress(frame, s(7.35), s(0.6), exit)

  const cy = GATHER.y - settleUp * 40
  return <AbsoluteFill style={{ fontFamily: FONT, opacity: 1 - fadeOut }}>
    <div style={{
      position: 'absolute', left: 960 - WIDTH / 2, top: cy - WIDTH / LOCKUP_RATIO / 2,
      transform: `translateX(${shift * MARK_OFFSET * WIDTH}px)`,
    }}>
      <Logo frame={frame - revealAt} width={WIDTH} idleFrom={s(LOGO_REVEAL_SECONDS + 0.4)} />
    </div>

    <p style={{
      position: 'absolute', left: 0, right: 0, top: cy + 190, margin: 0, textAlign: 'center',
      color: C.inkSoft, font: `500 40px/1 ${FONT}`, letterSpacing: '-0.015em',
      opacity: tagline, transform: `translateY(${(1 - tagline) * 16}px)`,
    }}>Knowledge opens doors.</p>

    <div style={{
      position: 'absolute', left: 0, right: 0, top: cy + 270, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 22,
      opacity: action, transform: `translateY(${(1 - action) * 16}px)`,
    }}>
      <Button icon={ArrowRight} size={22} style={{ flexDirection: 'row-reverse', height: 60, padding: '0 28px' }}>{cta}</Button>
      {url && <span style={{ color: C.ink, font: `600 26px/1 ${FONT}`, letterSpacing: '-0.01em' }}>{url}</span>}
    </div>
    <Cues cues={[
      { at: s(0.1), name: 'shimmer', volume: 0.3 },
      { at: s(1.0), name: 'whoosh-soft', volume: 0.24 },
      { at: voEnd('outro.tagline', 0.2), name: 'pop', volume: 0.2 },
    ]} />
  </AbsoluteFill>
}
