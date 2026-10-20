// Which theme a piece of product UI is drawn in. Wrap a window in
// <ThemeScope tokens={DARK}> and every primitive inside follows.
import { createContext, useContext, type ReactNode } from 'react'
import { LIGHT, type Tokens } from '../theme'

const Ctx = createContext<Tokens>(LIGHT)

export function ThemeScope({ tokens, children }: { tokens: Tokens; children: ReactNode }) {
  return <Ctx.Provider value={tokens}>{children}</Ctx.Provider>
}

export const useTokens = () => useContext(Ctx)
