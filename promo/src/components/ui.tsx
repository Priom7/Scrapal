// Product primitives at video scale. They follow the product's own rules —
// cards 20–24px radius, controls 16px, soft 1px borders, badges always carry a
// text label — sized up roughly 1.3× so they read on a 1080p frame.
import type { LucideIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { FPS } from '../timeline'
import { C, FONT, R, type Tokens } from '../theme'
import { useTokens } from './tokens'

export type Tone = 'neutral' | 'blue' | 'met' | 'close' | 'info' | 'error' | 'solid'

/** Badge and chip colours in the surrounding theme. */
export function tones(t: Tokens): Record<Tone, { color: string; background: string; border: string }> {
  return {
    neutral: { color: t.inkSoft, background: t.surface, border: t.line },
    blue: { color: t.blue, background: t.blueWash, border: t.blueLine },
    met: { color: t.successInk, background: t.metSoft, border: t.metLine },
    close: { color: t.warningInk, background: t.closeSoft, border: t.closeLine },
    info: { color: t.infoInk, background: t.infoWash, border: t.infoLine },
    error: { color: t.errorInk, background: t.errorWash, border: t.errorWash },
    solid: { color: t.onAccent, background: t.primary, border: t.primary },
  }
}

export function Badge({ tone = 'blue', icon: Icon, children, size = 15, style }: {
  tone?: Tone
  icon?: LucideIcon
  children: ReactNode
  size?: number
  style?: CSSProperties
}) {
  const t = tones(useTokens())[tone]
  return <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: `${size * 0.32}px ${size * 0.7}px`,
    borderRadius: R.pill, border: `1px solid ${t.border}`,
    color: t.color, background: t.background,
    font: `600 ${size}px/1.1 ${FONT}`, whiteSpace: 'nowrap',
    ...style,
  }}>
    {Icon && <Icon size={size + 1} strokeWidth={2} />}
    {children}
  </span>
}

export function Chip({ children, selected, tone = 'neutral', icon: Icon, size = 17, style }: {
  children: ReactNode
  selected?: number
  tone?: Tone
  icon?: LucideIcon
  size?: number
  style?: CSSProperties
}) {
  const tokens = useTokens()
  const t = tones(tokens)[tone]
  const on = selected ?? 0
  return <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: `${size * 0.55}px ${size * 0.95}px`,
    borderRadius: R.pill,
    border: `1.5px solid ${mix(t.border, tokens.primary, on)}`,
    color: mix(t.color, tokens.onAccent, on),
    background: mix(t.background, tokens.primary, on),
    font: `600 ${size}px/1 ${FONT}`, whiteSpace: 'nowrap',
    ...style,
  }}>
    {Icon && <Icon size={size + 1} strokeWidth={1.9} />}
    {children}
  </span>
}

export function Card({ children, style, padding = 26 }: { children: ReactNode; style?: CSSProperties; padding?: number }) {
  const t = useTokens()
  return <div style={{
    background: t.surface, border: `1px solid ${t.line}`, borderRadius: R.card,
    padding, boxShadow: t.shadow, ...style,
  }}>{children}</div>
}

export function Button({ children, icon: Icon, variant = 'primary', pressed = 0, size = 18, style }: {
  children: ReactNode
  icon?: LucideIcon
  variant?: 'primary' | 'secondary'
  /** 0..1, how far the button is pushed in by a click. */
  pressed?: number
  size?: number
  style?: CSSProperties
}) {
  const t = useTokens()
  const primary = variant === 'primary'
  return <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 9,
    height: size * 2.6, padding: `0 ${size * 1.15}px`,
    borderRadius: R.control,
    border: primary ? 0 : `1px solid ${t.line}`,
    color: primary ? t.onAccent : t.ink,
    background: primary ? mix(t.primary, t.primaryPressed, pressed) : t.surface,
    font: `600 ${size}px/1 ${FONT}`, whiteSpace: 'nowrap',
    transform: `translateY(${pressed}px) scale(${1 - pressed * 0.03})`,
    ...style,
  }}>
    {Icon && <Icon size={size + 2} strokeWidth={2} />}
    {children}
  </span>
}

export function Avatar({ initials, color, size = 56, style }: { initials: string; color: string; size?: number; style?: CSSProperties }) {
  return <span style={{
    display: 'grid', placeItems: 'center', flex: 'none',
    width: size, height: size, borderRadius: '50%',
    color: '#fff', background: color,
    font: `700 ${size * 0.36}px/1 ${FONT}`, letterSpacing: '0.02em',
    ...style,
  }}>{initials}</span>
}

/** An icon on a soft tile — the brand's "state mark" (brand.css .sc-state-mark). */
export function IconTile({ icon: Icon, size = 52, tone = 'blue', style }: { icon: LucideIcon; size?: number; tone?: Tone; style?: CSSProperties }) {
  const t = tones(useTokens())[tone]
  return <span style={{
    display: 'grid', placeItems: 'center', flex: 'none',
    width: size, height: size, borderRadius: size * 0.32,
    color: t.color, background: t.background, ...style,
  }}><Icon size={size * 0.5} strokeWidth={1.75} /></span>
}

/** The branded three-dot indicator (guidelines p.11): blue, sky, emerald,
    frame-driven so it renders identically every time. */
export function Dots({ frame, size = 12, style }: { frame: number; size?: number; style?: CSSProperties }) {
  const colors = [C.blue, C.sky, C.emerald]
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.4, ...style }}>
    {colors.map((color, index) => {
      const cycle = (((frame / FPS) - index * 0.14) / 1.05) % 1
      const phase = cycle < 0 ? cycle + 1 : cycle
      // 0% → 35% rise, 35% → 70% fall, then rest — as in brand.css @keyframes sc-dot.
      const k = phase < 0.35 ? phase / 0.35 : phase < 0.7 ? 1 - (phase - 0.35) / 0.35 : 0
      const eased = 0.5 - Math.cos(k * Math.PI) / 2
      return <span key={color} style={{
        width: size, height: size, borderRadius: '50%', background: color,
        opacity: 0.28 + 0.72 * eased,
        transform: `translateY(${-0.28 * size * 1.6 * eased}px) scale(${0.82 + 0.18 * eased})`,
      }} />
    })}
  </span>
}

/** Blend two #rrggbb colours; t = 0 gives a, 1 gives b. */
export function mix(a: string, b: string, t: number) {
  const pa = parse(a)
  const pb = parse(b)
  const k = Math.max(0, Math.min(1, t))
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * k))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

function parse(hex: string) {
  if (hex.startsWith('rgb')) return hex.match(/\d+/g)!.slice(0, 3).map(Number)
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}
