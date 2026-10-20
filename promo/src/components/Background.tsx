// The stage. Cloud with the soft blue and mint haze the guidelines' pages sit
// on, drifting slowly so a held frame still breathes. Glows are plain radial
// gradients rather than blurred shapes: they cost nothing to render.
import { AbsoluteFill } from 'remotion'
import { C } from '../theme'
import { FPS } from '../timeline'

export function Background({ frame, tone = 'light', grid = true }: {
  frame: number
  tone?: 'light' | 'dark'
  grid?: boolean
}) {
  const t = frame / FPS
  const drift = (speed: number, amount: number, phase = 0) => Math.sin(t * speed + phase) * amount

  if (tone === 'dark') {
    return <AbsoluteFill style={{ background: C.darkPaper }}>
      <AbsoluteFill style={{
        background: `radial-gradient(60% 70% at ${70 + drift(0.22, 6)}% ${10 + drift(0.3, 5)}%, rgba(70, 92, 255, 0.22), transparent 70%)`,
      }} />
      <AbsoluteFill style={{
        background: `radial-gradient(50% 60% at ${12 + drift(0.18, 5, 2)}% ${95 + drift(0.25, 4)}%, rgba(32, 201, 152, 0.12), transparent 70%)`,
      }} />
      <AbsoluteFill style={{
        background: 'radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(0, 0, 0, 0.45) 100%)',
      }} />
    </AbsoluteFill>
  }

  return <AbsoluteFill style={{ background: C.paper }}>
    <AbsoluteFill style={{
      background: `radial-gradient(55% 75% at ${82 + drift(0.2, 5)}% ${-4 + drift(0.27, 6)}%, rgba(70, 92, 255, 0.16), rgba(70, 92, 255, 0.05) 45%, transparent 72%)`,
    }} />
    <AbsoluteFill style={{
      background: `radial-gradient(45% 60% at ${4 + drift(0.17, 4, 1)}% ${104 + drift(0.23, 5, 2)}%, rgba(66, 207, 160, 0.16), transparent 70%)`,
    }} />
    <AbsoluteFill style={{
      background: `radial-gradient(40% 50% at ${48 + drift(0.12, 10, 3)}% ${60 + drift(0.15, 8)}%, rgba(63, 167, 232, 0.06), transparent 70%)`,
    }} />
    {grid && <AbsoluteFill style={{
      backgroundImage: 'radial-gradient(circle, rgba(16, 24, 32, 0.075) 1.2px, transparent 1.6px)',
      backgroundSize: '34px 34px',
      backgroundPosition: `${(t * 6) % 34}px ${(t * 3) % 34}px`,
      WebkitMaskImage: 'radial-gradient(70% 70% at 50% 45%, black 20%, transparent 85%)',
      maskImage: 'radial-gradient(70% 70% at 50% 45%, black 20%, transparent 85%)',
    }} />}
  </AbsoluteFill>
}
