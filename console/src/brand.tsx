// The brand as components. Anything that shows the mark, a wait, an empty
// result or a failure goes through here, so those moments look the same
// wherever they happen — which is the whole point of having a brand system
// rather than a colour palette.
import { Home, SearchX, TriangleAlert } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { ICON } from './lib'

/** Master artwork paths. The mark is never redrawn in code — these files are
    the supplied assets, used as-is (guidelines p.02). */
export const BRAND = {
  logo: '/brand/scrapal-logo.svg',
  logoAnimated: '/brand/scrapal-logo-animated.svg',
  icon: '/brand/scrapal-icon.svg',
  iconAnimated: '/brand/scrapal-icon-animated.svg',
} as const

/** The full lock-up. Minimum digital size is 120px wide, enforced in CSS. */
export function Logo({ width = 145, plate, className = '' }: {
  width?: number
  /** On a dark surface the light artwork sits on its own plate rather than
      being recoloured. */
  plate?: boolean
  className?: string
}) {
  const img = <img className={`brand-logo ${className}`} src={BRAND.logo} alt="Scrapal" width={width} />
  return plate ? <span className="brand-plate">{img}</span> : img
}

/** Icon only. Minimum digital size is 48px. */
export function BrandIcon({ size = 48, animated, className = '' }: {
  size?: number
  animated?: boolean
  className?: string
}) {
  return <img
    className={`brand-icon ${className}`}
    src={animated ? BRAND.iconAnimated : BRAND.icon}
    alt=""
    width={size}
    height={size}
  />
}

/** The three-dot indicator. On its own it is decorative; give it a `label` and
    it announces the wait to a screen reader too. */
export function Dots({ label }: { label?: string }) {
  return <span className="sc-dots" role={label ? 'status' : undefined} aria-label={label}>
    <span /><span /><span />
  </span>
}

/** A short wait with a sentence saying what is being waited on. "Searching
    opportunities…" tells the reader something; "Loading…" does not
    (guidelines p.11). */
export function Loading({ children }: { children: ReactNode }) {
  return <p className="sc-loading" role="status">
    <Dots />
    <span>{children}</span>
  </p>
}

export function Skeleton({ width, height = 12, radius }: {
  width?: number | string
  height?: number | string
  radius?: number
}) {
  return <span
    className="sc-skeleton"
    aria-hidden="true"
    style={{ width: width ?? '100%', height, borderRadius: radius }}
  />
}

/** Use a skeleton when the shape of what is coming is already known. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return <div className="sc-skeleton-card" aria-hidden="true">
    <div className="sc-skeleton-row">
      <Skeleton width={44} height={44} radius={14} />
      <div className="sc-skeleton-lines">
        <Skeleton width="62%" height={13} />
        <Skeleton width="38%" height={10} />
      </div>
    </div>
    {Array.from({ length: lines }, (_, index) => (
      <Skeleton key={index} width={index === lines - 1 ? '55%' : '100%'} height={10} />
    ))}
  </div>
}

/** Nothing to show, and it is not a failure. Always offers the way out. */
export function EmptyState({ icon, title, children, actions }: {
  icon?: ReactNode
  title: string
  children?: ReactNode
  actions?: ReactNode
}) {
  return <div className="sc-state">
    <span className="sc-state-mark">{icon ?? <SearchX size={ICON.xl} aria-hidden="true" />}</span>
    <h2>{title}</h2>
    {children && <p>{children}</p>}
    {actions && <div className="sc-state-actions">{actions}</div>}
  </div>
}

/** Something went wrong. Describe it calmly and offer the next best action —
    never a raw stack or an error code on its own (guidelines p.11). */
export function ErrorState({ title = 'Something went wrong', children, actions }: {
  title?: string
  children?: ReactNode
  actions?: ReactNode
}) {
  return <div className="sc-state error" role="alert">
    <span className="sc-state-mark"><TriangleAlert size={ICON.xl} aria-hidden="true" /></span>
    <h2>{title}</h2>
    {children && <p>{children}</p>}
    {actions && <div className="sc-state-actions">{actions}</div>}
  </div>
}

/** A failure that belongs to one panel rather than the whole page. */
export function ErrorBanner({ children }: { children: ReactNode }) {
  return <p className="sc-error-banner" role="alert">
    <TriangleAlert size={ICON.sm} aria-hidden="true" />
    <span>{children}</span>
  </p>
}

/** The 404 page (guidelines p.11): the numerals, one calm sentence, one way
    back. No error iconography — a mistyped link is not a fault. */
export function NotFound({ onHome, children }: {
  onHome: () => void
  children?: ReactNode
}) {
  return <main className="sc-notfound">
    <p className="sc-404">404</p>
    <h1>Page not found</h1>
    <p className="sc-notfound-text">
      {children ?? 'The page you are looking for may have moved or no longer exists.'}
    </p>
    <button type="button" className="sc-primary" onClick={onHome}>
      <Home size={ICON.sm} aria-hidden="true" /> Back to home
    </button>
  </main>
}

/** Shown while the shell boots, then faded out. It is deliberately brief: a
    splash that outstays its welcome is just a delay. */
export function Splash({ tagline = 'Knowledge opens doors.' }: { tagline?: string }) {
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const fade = window.setTimeout(() => setLeaving(true), 620)
    const remove = window.setTimeout(() => setGone(true), 980)
    return () => { window.clearTimeout(fade); window.clearTimeout(remove) }
  }, [])

  if (gone) return null
  return <div className={`sc-splash ${leaving ? 'leaving' : ''}`} aria-hidden="true">
    <BrandIcon size={92} animated />
    <p>{tagline}</p>
  </div>
}
