// Faces in the conversation. Scrapal wears the product's own mark; the student
// wears their own picture. A chat between two blank circles is a form with
// speech bubbles drawn on it.
import { useState, type ReactNode } from 'react'

/** An image that quietly gives up rather than leaving a broken frame. The
    placeholder services below are network-dependent and this app is built to
    work offline. */
export function SafeImage({ src, alt, className, fallback }: {
  src?: string | null
  alt: string
  className?: string
  fallback: ReactNode
}) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <>{fallback}</>
  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
}

export function ScrapalAvatar({ size = 30 }: { size?: number }) {
  return <span className="avatar scrapal-avatar" style={{ width: size, height: size }}>
    <img src="/scrapal_logo.svg" alt="" aria-hidden="true" />
  </span>
}

export function StudentAvatar({ src, name, size = 30 }: {
  src?: string | null
  name?: string | null
  size?: number
}) {
  const initials = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'You'

  return <span className="avatar student-avatar" style={{ width: size, height: size }}>
    <SafeImage
      src={src}
      alt=""
      fallback={<span className="avatar-initials">{initials}</span>}
    />
  </span>
}
