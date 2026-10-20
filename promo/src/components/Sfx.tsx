// Sound effects, placed on the frame the picture does the thing. Each scene
// exports its cues next to the timings they belong to; this renders them.
import { Html5Audio, Sequence, staticFile } from 'remotion'

export type SfxName =
  | 'click' | 'pop' | 'pop-hi' | 'pop-low' | 'typing' | 'whoosh' | 'whoosh-soft'
  | 'highlight' | 'thread' | 'notify' | 'success' | 'shimmer' | 'alert' | 'count' | 'gather'

export type Cue = {
  /** Frame, relative to whatever the cues are rendered inside. */
  at: number
  name: SfxName
  volume?: number
  /** Cut the sound after this many frames (typing runs). */
  length?: number
}

export function Cues({ cues, offset = 0 }: { cues: Cue[]; offset?: number }) {
  return <>
    {cues.map((cue, index) => (
      <Sequence key={index} from={Math.round(cue.at + offset)} durationInFrames={cue.length} layout="none" name={`♪ ${cue.name}`}>
        <Html5Audio src={staticFile(`audio/sfx/${cue.name}.wav`)} volume={cue.volume ?? 0.5} />
      </Sequence>
    ))}
  </>
}
