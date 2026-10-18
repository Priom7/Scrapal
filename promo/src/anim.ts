// The motion language. The brand gives one curve — --sc-ease, a soft
// ease-out — and the guidelines ask for "roundish, polished, optimistic". So
// things arrive quickly and settle gently; nothing snaps, nothing bounces hard.
import type { CSSProperties } from 'react'
import { Easing, interpolate, spring } from 'remotion'
import { FPS } from './timeline'

/** --sc-ease: cubic-bezier(0.22, 0.61, 0.36, 1). */
export const ease = Easing.bezier(0.22, 0.61, 0.36, 1)
/** For things that travel between two places (cursor, camera). */
export const glide = Easing.bezier(0.65, 0, 0.35, 1)
/** Exits accelerate away. */
export const exit = Easing.bezier(0.55, 0, 0.75, 0.2)

/** 0 → 1 over [start, start + duration], clamped. */
export function progress(frame: number, start: number, duration: number, easing = ease) {
  if (duration <= 0) return frame >= start ? 1 : 0
  return interpolate(frame, [start, start + duration], [0, 1], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
}

/** Remotion's spring() steps through every frame up to the one asked for, so a
    spring read 70 seconds into the film would simulate 4,000 steps. Every
    spring here has settled long before five seconds; past that, ask for five. */
const SETTLED = FPS * 5
const springFrame = (frame: number, delay: number) => Math.min(frame - delay, SETTLED)

/** A settled spring: arrives with a hint of overshoot, never a wobble. */
export function pop(frame: number, delay = 0, { damping = 14, stiffness = 170, mass = 0.9 } = {}) {
  return spring({ frame: springFrame(frame, delay), fps: FPS, config: { damping, stiffness, mass } })
}

/** A spring with no overshoot, for large surfaces that must feel weighty. */
export function settle(frame: number, delay = 0, durationInFrames?: number) {
  return spring({ frame: springFrame(frame, delay), fps: FPS, config: { damping: 200 }, durationInFrames })
}

/** Linear map with clamping on both sides — the one we almost always want. */
export function map(value: number, input: [number, number], output: [number, number], easing?: (t: number) => number) {
  return interpolate(value, input, output, { easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
}

/** Fade + rise, the default entrance for text and cards. */
export function rise(p: number, distance = 28): CSSProperties {
  return { opacity: p, transform: `translate3d(0, ${(1 - p) * distance}px, 0)` }
}

/** Visible window for an element that enters and leaves inside a scene. */
export function life(frame: number, inAt: number, outAt: number, fade = 14) {
  return Math.min(progress(frame, inAt, fade), 1 - progress(frame, outAt, fade, exit))
}

/** Keyframed value: [[frame, value], ...] with the brand ease between keys. */
export function keyframes(frame: number, keys: [number, number][], easing = glide) {
  if (frame <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    const [f1, v1] = keys[i]
    const [f0, v0] = keys[i - 1]
    if (frame <= f1) return interpolate(frame, [f0, f1], [v0, v1], { easing })
  }
  return keys[keys.length - 1][1]
}

/** A string that types itself: n characters by frame, at `cps` per second. */
export function typed(text: string, frame: number, start: number, cps = 32) {
  const count = Math.max(0, Math.floor(((frame - start) / FPS) * cps))
  return text.slice(0, Math.min(text.length, count))
}

/** Seeded pseudo-random, so every render of a frame is identical. */
export function rand(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}
