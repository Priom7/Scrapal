// Two products share one build: the operator console at "/" and the student app
// at "/student". They share the API client, the mock transport and the toast
// layer; they deliberately do not share a visual identity, because they are for
// different people.
import type { ReactNode } from 'react'
import { useLocation } from './router'
import { StudentApp } from './student/StudentApp'

export function Root({ console: consoleApp }: { console: ReactNode }) {
  const path = useLocation()
  return path.startsWith('/student') ? <StudentApp /> : <>{consoleApp}</>
}
