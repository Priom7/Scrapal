// The film, end to end. Scenes sit on the bar grid from timeline.json; the
// backgrounds live here rather than in the scenes so their slow drift never
// jumps at a cut.
import { AbsoluteFill, Html5Audio, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { glide, progress } from './anim'
import { Background } from './components/Background'
import { Voiceover, duckAt } from './components/Voiceover'
import { STUDENT_VOICE } from './vo'
import { Brand } from './scenes/Brand'
import { Chaos, FOCUS } from './scenes/Chaos'
import { Montage } from './scenes/Montage'
import { Outro, type OutroProps } from './scenes/Outro'
import { Product } from './scenes/Product'
import { scene, s } from './timeline'

export type PromoProps = OutroProps

// Measured on a render: the voice lands ~3 dB above the music-only passages
// and ~11 dB above the bed beneath it. Remotion places the mono narration at
// -3 dB per channel, which VOICE makes back up.
const VOICE = 1.3
const MUSIC_FULL = 0.74
const MUSIC_UNDER_VOICE = 0.26

export function Promo({ cta, url }: PromoProps) {
  const frame = useCurrentFrame()
  const chaos = scene('chaos')
  const brand = scene('brand')
  const plan = scene('plan')
  const radar = scene('radar')
  const montage = scene('montage')
  const outro = scene('outro')

  // Light floods out of the point everything converged on.
  const flood = progress(frame, brand.from, s(0.8), glide)
  const radius = flood * 2300

  return <AbsoluteFill style={{ background: '#0a1016' }}>
    {frame < brand.from + s(0.9) && <Background frame={frame} tone="dark" />}
    {frame >= brand.from && <AbsoluteFill style={{
      clipPath: flood < 1 ? `circle(${radius}px at ${FOCUS.x}px ${FOCUS.y}px)` : undefined,
    }}>
      <Background frame={frame} />
    </AbsoluteFill>}
    {/* The edge of the light: a soft brand-blue rim on the opening circle. */}
    {flood > 0 && flood < 1 && <div style={{
      position: 'absolute', left: FOCUS.x - radius, top: FOCUS.y - radius, width: radius * 2, height: radius * 2,
      borderRadius: '50%', border: '3px solid rgba(63, 167, 232, 0.9)',
      boxShadow: '0 0 40px 10px rgba(70, 92, 255, 0.35), inset 0 0 40px 6px rgba(70, 92, 255, 0.25)',
      opacity: 1 - flood,
    }} />}

    <Sequence from={chaos.from} durationInFrames={chaos.duration} name="Chaos">
      <Chaos />
    </Sequence>
    <Sequence from={brand.from} durationInFrames={brand.duration} name="Brand">
      <Brand />
    </Sequence>
    <Sequence from={plan.from} durationInFrames={radar.from + radar.duration - plan.from} name="Product walkthrough">
      <Product />
    </Sequence>
    <Sequence from={montage.from} durationInFrames={montage.duration} name="Montage">
      <Montage />
    </Sequence>
    <Sequence from={outro.from} durationInFrames={outro.duration} name="Outro">
      <Outro cta={cta} url={url} />
    </Sequence>

    <Voiceover voice={STUDENT_VOICE} volume={VOICE} />
    {/* Synthesised by scripts/soundtrack.mjs on the same bar grid. Swap the file for
        a licensed track any time. It sits ~10 dB under the narration while a line
        plays and returns to full between lines. */}
    <Html5Audio src={staticFile('audio/music.wav')} volume={(f) => MUSIC_FULL - (MUSIC_FULL - MUSIC_UNDER_VOICE) * duckAt(STUDENT_VOICE.LINES, f)} />
  </AbsoluteFill>
}
