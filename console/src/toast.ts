// The context and hook live apart from the component so the provider file
// exports components only, which is what fast refresh needs.
import { createContext, useContext } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export type ToastInput = {
  /** What happened, in the past tense of the button that caused it. */
  title: string
  detail?: string
  tone?: ToastTone
  /** Shown as an Undo button. Reverting is the caller's job. */
  onUndo?: () => void
  /** Replaces an existing toast instead of stacking a duplicate. */
  key?: string
}

export const ToastContext = createContext<(input: ToastInput) => void>(() => {})

export function useToast(): (input: ToastInput) => void {
  return useContext(ToastContext)
}
