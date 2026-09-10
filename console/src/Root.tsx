// Two products share one build: the operator console at "/" and the student app
// at "/student". They share the API client, the mock transport, the toast layer
// and the brand system; they deliberately do not share a layout, because they
// are for different people.
import type { ReactNode } from 'react'
import { NotFound, Splash } from './brand'
import { RouteAnnouncer } from './RouteAnnouncer'
import { navigate, useLocation } from './router'
import { StudentApp } from './student/StudentApp'

export function Root({ console: consoleApp }: { console: ReactNode }) {
  const path = useLocation().split('?')[0]

  // Mounted above the branch so it survives moving between the two products,
  // and so a route change is announced in both.
  const announcer = <RouteAnnouncer />

  if (path.startsWith('/student')) {
    return <><Splash />{announcer}<StudentApp /></>
  }
  // The console is a single-page tool at the root; anything else is a stale or
  // mistyped link and should say so plainly rather than silently showing the
  // wrong product.
  if (path !== '/' && path !== '') {
    return <>{announcer}<NotFound onHome={() => navigate('/')} /></>
  }

  return <><Splash />{announcer}{consoleApp}</>
}
