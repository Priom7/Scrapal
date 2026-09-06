// Closes an open popover on an outside click or Escape.
import { useEffect, useRef } from 'react'

export function useDismiss(onDismiss: () => void, active: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!active) return
    const click = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss()
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onDismiss() }
    document.addEventListener('mousedown', click)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', click)
      document.removeEventListener('keydown', escape)
    }
  }, [active, onDismiss])
  return ref
}
