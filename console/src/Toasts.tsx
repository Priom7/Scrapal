// Every action in this console changed something and said nothing. This is the
// one place that answers "did that work?" — named after the action that caused
// it, and offering the way back where an action is hard to reverse.
import { Check, CircleAlert, Info, Undo2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { ICON } from './lib'
import { ToastContext, type ToastInput, type ToastTone } from './toast'

type Toast = ToastInput & { id: string; tone: ToastTone }

/** Failures stay until dismissed: a message you cannot finish reading is not
    feedback. Anything offering an undo waits longer than a bare confirmation. */
function lifetime(toast: Toast): number | null {
  if (toast.tone === 'error') return null
  return toast.onUndo ? 9000 : 5000
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const schedule = useCallback((toast: Toast) => {
    const ms = lifetime(toast)
    if (ms == null) return
    timers.current.set(toast.id, setTimeout(() => dismiss(toast.id), ms))
  }, [dismiss])

  const notify = useCallback((input: ToastInput) => {
    const id = input.key ?? `toast-${Math.random().toString(36).slice(2)}`
    const toast: Toast = { ...input, id, tone: input.tone ?? 'success' }
    const existing = timers.current.get(id)
    if (existing) clearTimeout(existing)
    // Repeating an action replaces its notice rather than stacking copies.
    setToasts((current) => [...current.filter((item) => item.id !== id), toast].slice(-3))
    schedule(toast)
  }, [schedule])

  // Hovering or focusing a toast pauses its countdown, so an undo stays
  // reachable while someone is reaching for it.
  const hold = (id: string) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
  }
  const release = (toast: Toast) => {
    if (!timers.current.has(toast.id)) schedule(toast)
  }

  const value = useMemo(() => notify, [notify])

  return <ToastContext.Provider value={value}>
    {children}
    <div className="toast-region" aria-live="polite" aria-relevant="additions">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            className={`toast ${toast.tone}`}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            layout
            initial={{ opacity: 0, y: 12, scale: .98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: .98, transition: { duration: .12 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            onMouseEnter={() => hold(toast.id)}
            onMouseLeave={() => release(toast)}
            onFocusCapture={() => hold(toast.id)}
            onBlurCapture={() => release(toast)}
          >
            <span className="toast-mark" aria-hidden="true">
              {toast.tone === 'success' ? <Check size={ICON.sm} />
                : toast.tone === 'error' ? <CircleAlert size={ICON.sm} />
                  : <Info size={ICON.sm} />}
            </span>
            <div className="toast-copy">
              <strong>{toast.title}</strong>
              {toast.detail && <span>{toast.detail}</span>}
            </div>
            {toast.onUndo && (
              <button
                type="button"
                className="toast-undo"
                onClick={() => { toast.onUndo?.(); dismiss(toast.id) }}
              >
                <Undo2 size={ICON.xs} aria-hidden="true" /> Undo
              </button>
            )}
            <button
              type="button"
              className="toast-close"
              onClick={() => dismiss(toast.id)}
              aria-label={`Dismiss: ${toast.title}`}
            >
              <X size={ICON.xs} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  </ToastContext.Provider>
}
