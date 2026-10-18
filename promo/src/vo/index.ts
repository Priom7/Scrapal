// The voiceover as data the picture can follow. Every line sits at `at`
// seconds into its scene (script.json); its length comes from durations.json,
// which tts/generate.py writes. Scenes key their beats off `vo('plan.asks')`
// rather than hand-typed seconds, so if a line is re-recorded or re-worded,
// the picture moves with it.
//
// Each film builds its own voice with createVoice(); the exports at the bottom
// are the student film's.
import { FPS, STUDENT_TIMELINE, type SceneId, type Timeline } from '../timeline'
import durations from './durations.json'
import script from './script.json'

export type Line = {
  id: string
  scene: SceneId
  text: string
  /** Frame, relative to the start of its scene, where the line starts. */
  at: number
  /** Spoken length in frames. */
  duration: number
  /** Absolute frame in the film. */
  from: number
}

export type Voice = {
  /** Folder under public/ holding one WAV per line. */
  audio: string
  LINES: Line[]
  line: (id: string) => Line
  /** Scene-local frame where a line starts, plus an optional offset in seconds. */
  vo: (id: string, offsetSeconds?: number) => number
  /** Scene-local frame where a line ends, plus an optional offset in seconds. */
  voEnd: (id: string, offsetSeconds?: number) => number
}

type Script = { lines: { id: string; scene: string; at: number; text: string }[] }

export function createVoice({ script: source, durations: lengths, timeline, audio }: {
  script: Script
  durations: Record<string, number>
  timeline: Timeline
  audio: string
}): Voice {
  const LINES: Line[] = source.lines.map((raw) => {
    const at = Math.round(raw.at * FPS)
    return {
      id: raw.id,
      scene: raw.scene,
      text: raw.text,
      at,
      duration: Math.round((lengths[raw.id] ?? 0) * FPS),
      from: timeline.scene(raw.scene).from + at,
    }
  })

  const line = (id: string) => {
    const found = LINES.find((entry) => entry.id === id)
    if (!found) throw new Error(`No voiceover line called ${id}`)
    return found
  }

  // A line that overlaps the next, or runs past the end of its scene, is an
  // edit error, not a style choice: fail loudly so it never reaches a render.
  const problems: string[] = []
  LINES.forEach((entry, index) => {
    const next = LINES[index + 1]
    const end = entry.from + entry.duration
    const sceneEnd = timeline.scene(entry.scene).from + timeline.scene(entry.scene).duration
    if (entry.duration && end > sceneEnd + Math.round(0.4 * FPS)) problems.push(`${entry.id} runs ${((end - sceneEnd) / FPS).toFixed(2)}s past its scene`)
    if (next && entry.duration && end + Math.round(0.12 * FPS) > next.from) problems.push(`${entry.id} runs into ${next.id}`)
  })
  if (problems.length) throw new Error(`Voiceover timing: ${problems.join('; ')}`)

  return {
    audio,
    LINES,
    line,
    vo: (id, offsetSeconds = 0) => line(id).at + Math.round(offsetSeconds * FPS),
    voEnd: (id, offsetSeconds = 0) => line(id).at + line(id).duration + Math.round(offsetSeconds * FPS),
  }
}

export const STUDENT_VOICE = createVoice({ script, durations, timeline: STUDENT_TIMELINE, audio: 'audio/vo' })
export const { LINES, line, vo, voEnd } = STUDENT_VOICE
