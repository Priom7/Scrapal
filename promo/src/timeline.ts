// One clock for picture and sound. Scenes are measured in bars of the
// soundtrack (120 BPM, 4/4 → one bar is two seconds), so every cut lands on a
// downbeat and scripts/soundtrack.mjs can build the music from the same file.
//
// Each film has its own timeline JSON (src/timeline.json for the student film,
// src/admin/timeline.json for the operator film); frame rate, size and tempo
// are shared, so components move the same way in both.
import timeline from './timeline.json'

export const FPS = timeline.fps
export const WIDTH = timeline.width
export const HEIGHT = timeline.height
export const BPM = timeline.bpm

/** Frames in one beat and one bar. */
export const BEAT = Math.round((60 / BPM) * FPS)
export const BAR = BEAT * timeline.beatsPerBar

export type SceneId = string
export type Scene = { id: SceneId; from: number; duration: number }
export type Timeline = {
  SCENES: Scene[]
  TOTAL: number
  scene: (id: SceneId) => Scene
}

export function createTimeline(data: { scenes: { id: string; bars: number }[] }): Timeline {
  let at = 0
  const SCENES = data.scenes.map((entry) => {
    const placed = { id: entry.id, from: at, duration: entry.bars * BAR }
    at += placed.duration
    return placed
  })
  return {
    SCENES,
    TOTAL: at,
    scene(id) {
      const found = SCENES.find((entry) => entry.id === id)
      if (!found) throw new Error(`No scene called ${id}`)
      return found
    },
  }
}

/** The student film's clock. */
export const STUDENT_TIMELINE = createTimeline(timeline)
export const { SCENES, TOTAL, scene } = STUDENT_TIMELINE

/** Seconds to frames, at the composition's frame rate. */
export const s = (seconds: number) => Math.round(seconds * FPS)
