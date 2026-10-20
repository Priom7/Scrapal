// The brand's signature line: a rounded gradient thread with a node at its
// head, lifted straight from the S mark. It connects a fact to its source,
// carries a topic across the privacy boundary, and wipes between scenes.
import { getLength, getPointAtLength } from '@remotion/paths'
import { useId } from 'react'
import { C } from '../theme'

export function Thread({
  d,
  from = 0,
  to,
  width = 10,
  colors = [C.blue, C.sky, C.mint],
  headNode = true,
  tailNode = false,
  nodeScale = 1.45,
  opacity = 1,
  particles = [],
}: {
  d: string
  /** Visible stretch of the path, as fractions of its length. */
  from?: number
  to: number
  width?: number
  colors?: readonly string[]
  headNode?: boolean
  tailNode?: boolean
  nodeScale?: number
  opacity?: number
  /** Positions (0..1) of small white data particles riding the thread. */
  particles?: number[]
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const length = getLength(d)
  const a = Math.max(0, Math.min(1, from))
  const b = Math.max(a, Math.min(1, to))
  if (b - a <= 0.0005) return null

  const at = (t: number) => getPointAtLength(d, t * length) ?? { x: 0, y: 0 }
  const start = at(0)
  const end = at(1)
  const head = at(b)
  const tail = at(a)

  return <g opacity={opacity}>
    <defs>
      <linearGradient id={`thread-${uid}`} gradientUnits="userSpaceOnUse" x1={start.x} y1={start.y} x2={end.x} y2={end.y}>
        {colors.map((color, index) => <stop key={index} offset={index / Math.max(1, colors.length - 1)} stopColor={color} />)}
      </linearGradient>
    </defs>
    <path
      d={d}
      fill="none"
      stroke={`url(#thread-${uid})`}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={`${(b - a) * length} ${length * 2}`}
      strokeDashoffset={-a * length}
    />
    {particles.filter((p) => p > a && p < b).map((p, index) => {
      const point = at(p)
      return <circle key={index} cx={point.x} cy={point.y} r={width * 0.38} fill="#fff" opacity={0.95} />
    })}
    {tailNode && <circle cx={tail.x} cy={tail.y} r={width * nodeScale} fill={colors[0]} />}
    {headNode && <circle cx={head.x} cy={head.y} r={width * nodeScale} fill={colorAt(colors, b)} />}
  </g>
}

/** The gradient's colour at a fraction along it, for the head node. */
function colorAt(colors: readonly string[], t: number) {
  const scaled = t * (colors.length - 1)
  const i = Math.min(colors.length - 2, Math.floor(scaled))
  const k = scaled - i
  const pa = hex(colors[i])
  const pb = hex(colors[i + 1])
  return `rgb(${pa.map((v, j) => Math.round(v + (pb[j] - v) * k)).join(', ')})`
}

function hex(value: string) {
  const h = value.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}
