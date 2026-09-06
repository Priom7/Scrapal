// Theme has to live outside either app: it is stamped on <html>, and both the
// console and the student workspace need to read and change it. It previously
// lived inside App, which only mounts on the console route — so the student
// workspace could never go dark and had no toggle.
import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'scrapal-theme'
const listeners = new Set<(theme: Theme) => void>()

function preferred(): Theme {
  const saved = globalThis.localStorage?.getItem(KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

let current: Theme = preferred()

export function applyTheme(theme: Theme): void {
  current = theme
  document.documentElement.dataset.theme = theme
  try {
    globalThis.localStorage?.setItem(KEY, theme)
  } catch {
    // A blocked storage API still leaves the theme applied for this visit.
  }
  listeners.forEach((listener) => listener(theme))
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(current)
  useEffect(() => {
    // Stamp on mount so the attribute is set whichever app rendered first.
    applyTheme(current)
    listeners.add(setTheme)
    return () => { listeners.delete(setTheme) }
  }, [])
  return [theme, applyTheme]
}
