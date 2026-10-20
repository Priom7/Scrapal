// The narration, and the music making room for it. Each line plays at its
// place on the film's clock; the bed dips under every line and comes back up
// in the gaps, the way a mixer rides a fader under a voice.
import { Html5Audio, Sequence, staticFile } from 'remotion'
import { s } from '../timeline'
import type { Line, Voice } from '../vo'

export function Voiceover({ voice, volume = 1 }: { voice: Voice; volume?: number }) {
  return <>
    {voice.LINES.map((line) => (
      <Sequence key={line.id} from={line.from} durationInFrames={line.duration + s(0.3)} layout="none" name={`🎙 ${line.id}`}>
        <Html5Audio src={staticFile(`${voice.audio}/${line.id}.wav`)} volume={volume} />
      </Sequence>
    ))}
  </>
}

const ATTACK = s(0.18)
const RELEASE = s(0.6)

/** 0..1, how far the music should be pulled down at an absolute frame. */
export function duckAt(lines: Line[], frame: number) {
  let duck = 0
  for (const line of lines) {
    const start = line.from - ATTACK
    const end = line.from + line.duration
    if (frame < start || frame > end + RELEASE) continue
    const v = frame < line.from ? (frame - start) / ATTACK : frame <= end ? 1 : 1 - (frame - end) / RELEASE
    duck = Math.max(duck, v)
  }
  // Ease the ramps so the bed breathes rather than steps.
  return duck * duck * (3 - 2 * duck)
}
