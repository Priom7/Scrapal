import { Globe2, Plus } from 'lucide-react'
import { ICON, Tone, toneFor } from './lib'

/** The only status pill in the console. */
export function Status({ status, warnings = 0 }: { status: string; warnings?: number }) {
  const label = status === 'completed' && warnings ? `completed · ${warnings} warning${warnings === 1 ? '' : 's'}` : status.replaceAll('_', ' ')
  return <span className={`status tone-${warnings ? 'wait' : toneFor(status)}`}><i aria-hidden="true" />{label}</span>
}

/** The only progress bar in the console. */
export function Meter({ value, tone = 'active', label }: { value: number; tone?: Tone; label?: string }) {
  const percent = Math.max(0, Math.min(100, Math.round(value)))
  return <span className={`meter tone-${tone}`} role="img" aria-label={label ?? `${percent}% complete`}><i style={{ width: `${percent}%` }} /></span>
}

export function Empty({ icon: Icon, title, text, action, onAction }: { icon: typeof Globe2; title: string; text: string; action?: string; onAction?: () => void }) {
  return <section className="empty"><Icon aria-hidden="true" /><h2>{title}</h2><p>{text}</p>{action && <button className="button primary" onClick={onAction}><Plus size={ICON.sm} aria-hidden="true" />{action}</button>}</section>
}
