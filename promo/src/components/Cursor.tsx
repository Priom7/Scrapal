// A pointer that moves like a person's: it glides between targets, slows as it
// arrives, and presses with a brand-blue ripple. Scenes read `pressAt` to make
// the thing under it respond on the same frame.
import { glide, map } from '../anim'
import { C } from '../theme'

export type CursorKey = { f: number; x: number; y: number; click?: boolean }

export function cursorAt(keys: CursorKey[], frame: number) {
  if (frame <= keys[0].f) return { x: keys[0].x, y: keys[0].y }
  for (let i = 1; i < keys.length; i++) {
    const k0 = keys[i - 1]
    const k1 = keys[i]
    if (frame <= k1.f) {
      const t = glide((frame - k0.f) / Math.max(1, k1.f - k0.f))
      // A slight arc reads as a hand, a straight line as a robot.
      const arc = Math.sin(t * Math.PI) * Math.min(40, Math.hypot(k1.x - k0.x, k1.y - k0.y) * 0.12)
      return { x: k0.x + (k1.x - k0.x) * t, y: k0.y + (k1.y - k0.y) * t - arc }
    }
  }
  const last = keys[keys.length - 1]
  return { x: last.x, y: last.y }
}

/** 0..1 press depth for a click at `at`: down fast, up gently. */
export function pressAt(frame: number, at: number) {
  if (frame < at || frame > at + 14) return 0
  return frame < at + 4 ? (frame - at) / 4 : 1 - (frame - at - 4) / 10
}

export function Cursor({ keys, frame, opacity = 1, scale = 1 }: {
  keys: CursorKey[]
  frame: number
  opacity?: number
  scale?: number
}) {
  const { x, y } = cursorAt(keys, frame)
  const clicks = keys.filter((key) => key.click).map((key) => key.f)
  const press = Math.max(0, ...clicks.map((at) => pressAt(frame, at)))
  const ripple = clicks
    .map((at) => frame - at)
    .filter((age) => age >= 0 && age < 26)
    .map((age) => ({ r: map(age, [0, 26], [6, 34]), o: map(age, [0, 26], [0.55, 0]) }))

  return <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity }}>
    {ripple.map((ring, index) => (
      <div key={index} style={{
        position: 'absolute', left: x - ring.r, top: y - ring.r,
        width: ring.r * 2, height: ring.r * 2, borderRadius: '50%',
        border: `3px solid ${C.blue}`, opacity: ring.o,
      }} />
    ))}
    <svg
      width={30 * scale}
      height={38 * scale}
      viewBox="0 0 30 38"
      style={{
        position: 'absolute', left: x - 3 * scale, top: y - 2 * scale,
        transform: `scale(${1 - press * 0.12})`, transformOrigin: '3px 2px',
        filter: 'drop-shadow(0 3px 6px rgba(16, 24, 32, 0.28))',
      }}
    >
      <path
        d="M3 2 L3 29 L9.6 22.6 L14.2 33.4 L19.2 31.2 L14.6 20.6 L23.6 20.6 Z"
        fill="#ffffff"
        stroke={C.navy}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  </div>
}
