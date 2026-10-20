// The operator film, end to end: one number — the £17,500 fee from the student
// film — followed from a university's page, through the console, to the answer
// a student sees. Same stage, brand moments and sound design as the student
// film; its own clock (timeline.json) and narration (vo/script.json).
import {
  BadgeCheck, Database, Globe2, Link2, MessageSquareQuote, Microscope, ScanText, UserCheck,
} from 'lucide-react'
import { AbsoluteFill, Html5Audio, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { glide, progress } from '../anim'
import { Background } from '../components/Background'
import { Voiceover, duckAt } from '../components/Voiceover'
import { Brand } from '../scenes/Brand'
import { FOCUS } from '../scenes/Chaos'
import { Montage, type Tile } from '../scenes/Montage'
import { Outro, type OutroProps } from '../scenes/Outro'
import { s } from '../timeline'
import { Console } from './Console'
import { ADMIN_VOICE, scene } from './film'
import { Opening } from './scenes/Opening'

export type AdminFilmProps = OutroProps

// Levels measured on the student film's render; the same voice and bed.
const VOICE = 1.3
const MUSIC_FULL = 0.74
const MUSIC_UNDER_VOICE = 0.26

/** The pipeline, crawl to answer (INTRO.md: crawl → extract → evidence → review → publish → index → retrieve → generate). */
const PIPELINE: Tile[] = [
  { icon: Globe2, title: 'Crawl', sub: 'Plans approved first' },
  { icon: ScanText, title: 'Extract', sub: 'Pages to typed facts' },
  { icon: Link2, title: 'Evidence', sub: 'Every value pinned' },
  { icon: UserCheck, title: 'Review', sub: 'A person decides' },
  { icon: BadgeCheck, title: 'Publish', sub: 'Versioned, with undo' },
  { icon: Database, title: 'Index', sub: 'Hybrid search' },
  { icon: Microscope, title: 'Retrieve', sub: 'Three lanes, fused' },
  { icon: MessageSquareQuote, title: 'Answer', sub: 'Cited, or withheld' },
]

const BRAND_MESSAGE = {
  lines: ['Every fact.', 'Every source.', 'Every decision, on record.'] as [string, string, string],
  support: 'The console behind Scrapal: crawl, extract, review and publish, with the evidence attached at every step.',
}

export function AdminFilm({ cta, url }: AdminFilmProps) {
  const frame = useCurrentFrame()
  const opening = scene('opening')
  const brand = scene('brand')
  const sources = scene('sources')
  const watch = scene('watch')
  const montage = scene('montage')
  const outro = scene('outro')

  const flood = progress(frame, brand.from, s(0.8), glide)
  const radius = flood * 2300

  return <AbsoluteFill style={{ background: '#0a1016' }}>
    {frame < brand.from + s(0.9) && <Background frame={frame} tone="dark" />}
    {frame >= brand.from && <AbsoluteFill style={{ clipPath: flood < 1 ? `circle(${radius}px at ${FOCUS.x}px ${FOCUS.y}px)` : undefined }}>
      <Background frame={frame} />
    </AbsoluteFill>}
    {flood > 0 && flood < 1 && <div style={{
      position: 'absolute', left: FOCUS.x - radius, top: FOCUS.y - radius, width: radius * 2, height: radius * 2,
      borderRadius: '50%', border: '3px solid rgba(63, 167, 232, 0.9)',
      boxShadow: '0 0 40px 10px rgba(70, 92, 255, 0.35), inset 0 0 40px 6px rgba(70, 92, 255, 0.25)', opacity: 1 - flood,
    }} />}

    <Sequence from={opening.from} durationInFrames={opening.duration} name="Opening"><Opening /></Sequence>
    <Sequence from={brand.from} durationInFrames={brand.duration} name="Brand">
      <Brand voice={ADMIN_VOICE} message={BRAND_MESSAGE} />
    </Sequence>
    <Sequence from={sources.from} durationInFrames={watch.from + watch.duration - sources.from} name="Console walkthrough"><Console /></Sequence>
    <Sequence from={montage.from} durationInFrames={montage.duration} name="Montage">
      <Montage tiles={PIPELINE} title="From crawl to answer." highlight="answer." voice={ADMIN_VOICE} />
    </Sequence>
    <Sequence from={outro.from} durationInFrames={outro.duration} name="Outro"><Outro cta={cta} url={url} voice={ADMIN_VOICE} /></Sequence>

    <Voiceover voice={ADMIN_VOICE} volume={VOICE} />
    <Html5Audio src={staticFile('audio/music-admin.wav')} volume={(f) => MUSIC_FULL - (MUSIC_FULL - MUSIC_UNDER_VOICE) * duckAt(ADMIN_VOICE.LINES, f)} />
  </AbsoluteFill>
}
