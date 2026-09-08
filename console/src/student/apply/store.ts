// Applications in progress. The student's own data, on their own device.
//
// Attached files are recorded by name, size and date — not contents. Browser
// storage is the wrong place for a passport scan, and pretending to hold one
// would be worse than saying plainly that it does not.
import { useEffect, useState } from 'react'
import type { DocStatus } from './documents'

/** Each time a document is replaced the previous one is kept. A student who
    uploads the wrong transcript should be able to see what they replaced. */
export type DocVersion = {
  fileName: string
  fileSize?: number
  addedAt: string
}

export type DocState = {
  status: DocStatus
  /** Newest first. */
  versions?: DocVersion[]
  expiresAt?: string
}

/** What happened to this application, so a student can see their own trail. */
export type HistoryEntry = {
  at: string
  what: string
  kind: 'created' | 'document' | 'statement' | 'status' | 'referee'
}

/** Where an application has got to. "unsuccessful" rather than "rejected":
    the word a person reads about their own application should not be a verdict
    on them. */
export type ApplicationStatus = 'draft' | 'submitted' | 'offer' | 'unsuccessful'

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: 'Not sent yet',
  submitted: 'Sent',
  offer: 'Offer received',
  unsuccessful: 'Unsuccessful',
}

export type Application = {
  courseId: string
  status: ApplicationStatus
  createdAt: string
  /** The student's own words, keyed by statement prompt. */
  answers: Record<string, string>
  /** Who will write the reference. Asked early because a late referee sinks
      more applications than a weak one. */
  referee: { name: string; email: string } | null
  history: HistoryEntry[]
  documents: Record<string, DocState>
}

const KEY = 'scrapal.student.applications'
const listeners = new Set<(applications: Application[]) => void>()

function read(): Application[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(parsed)) return []
    // Applications saved before these fields existed are brought forward
    // rather than dropped.
    return (parsed as Application[]).map((application) => ({
      ...application,
      status: application.status ?? 'draft',
      history: application.history ?? [],
      documents: Object.fromEntries(
        Object.entries(application.documents ?? {}).map(([id, doc]) => {
          const legacy = doc as DocState & { fileName?: string; fileSize?: number; addedAt?: string }
          if (legacy.versions) return [id, doc]
          return [id, {
            status: legacy.status,
            expiresAt: legacy.expiresAt,
            versions: legacy.fileName
              ? [{ fileName: legacy.fileName, fileSize: legacy.fileSize, addedAt: legacy.addedAt ?? application.createdAt }]
              : [],
          }]
        }),
      ),
    }))
  } catch {
    return []
  }
}

function write(applications: Application[]): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(applications))
  } catch {
    // The rest of the workspace still works without saved applications.
  }
  listeners.forEach((listener) => listener(applications))
}

/** Everything saved, outside React. The conversation needs to know what is
    already on the go before it can ask about it. */
export function listApplications(): Application[] {
  return read()
}

export function useApplications(): Application[] {
  const [applications, setApplications] = useState<Application[]>([])
  useEffect(() => {
    setApplications(read())
    listeners.add(setApplications)
    return () => { listeners.delete(setApplications) }
  }, [])
  return applications
}

export function startApplication(courseId: string): Application {
  const existing = read().find((application) => application.courseId === courseId)
  if (existing) return existing
  const now = new Date().toISOString()
  const created: Application = {
    courseId, status: 'draft', createdAt: now,
    answers: {}, documents: {}, referee: null,
    history: [{ at: now, what: 'Application started', kind: 'created' }],
  }
  write([...read(), created])
  return created
}

export function updateApplication(courseId: string, patch: Partial<Application>): void {
  write(read().map((application) => (
    application.courseId === courseId ? { ...application, ...patch } : application
  )))
}

/** Appends to the trail without letting it grow without bound. */
function note(application: Application, what: string, kind: HistoryEntry['kind']): HistoryEntry[] {
  return [...(application.history ?? []), { at: new Date().toISOString(), what, kind }].slice(-40)
}

export function setAnswer(courseId: string, promptId: string, text: string): void {
  const application = read().find((item) => item.courseId === courseId)
  if (!application) return
  if ((application.answers[promptId] ?? '') === text) return
  updateApplication(courseId, {
    answers: { ...application.answers, [promptId]: text },
    history: note(application, text ? `Answered “${promptId}”` : `Cleared “${promptId}”`, 'statement'),
  })
}

/** Adds a new version of a document, keeping what it replaced. */
export function addDocumentVersion(courseId: string, docId: string, label: string, version: DocVersion): void {
  const application = read().find((item) => item.courseId === courseId)
  if (!application) return
  const current = application.documents[docId]
  const versions = [version, ...(current?.versions ?? [])]
  updateApplication(courseId, {
    documents: { ...application.documents, [docId]: { ...current, status: 'attached', versions } },
    history: note(
      application,
      versions.length > 1 ? `Replaced ${label} (version ${versions.length})` : `Attached ${label}`,
      'document',
    ),
  })
}

export function setReferee(courseId: string, referee: Application['referee']): void {
  const application = read().find((item) => item.courseId === courseId)
  if (!application) return
  updateApplication(courseId, {
    referee,
    history: referee ? note(application, `Referee set to ${referee.name}`, 'referee') : application.history,
  })
}

export function removeApplication(courseId: string): void {
  write(read().filter((application) => application.courseId !== courseId))
}

/** Puts a removed application back, exactly as it was. Undo has to restore the
    work, not start a fresh draft. */
export function restoreApplication(application: Application): void {
  const others = read().filter((item) => item.courseId !== application.courseId)
  write([...others, application])
}

export function setStatus(courseId: string, status: ApplicationStatus): void {
  const application = read().find((item) => item.courseId === courseId)
  if (!application || application.status === status) return
  updateApplication(courseId, {
    status,
    history: note(application, `Moved to ${STATUS_LABELS[status].toLowerCase()}`, 'status'),
  })
}

export function setDocument(courseId: string, docId: string, state: DocState, label?: string): void {
  const application = read().find((item) => item.courseId === courseId)
  if (!application) return
  const was = application.documents[docId]?.status ?? 'missing'
  const changed = was !== state.status && label
  updateApplication(courseId, {
    documents: { ...application.documents, [docId]: state },
    history: changed
      ? note(application, state.status === 'missing' ? `Unticked ${label}` : `Ticked off ${label}`, 'document')
      : application.history,
  })
}

/** Reads one application outside React, for the planner engine. */
export function readApplication(courseId: string): Application | undefined {
  return read().find((application) => application.courseId === courseId)
}

export function applicationFor(applications: Application[], courseId: string): Application | undefined {
  return applications.find((application) => application.courseId === courseId)
}

/** How close this is to being ready to send. */
export function readiness(application: Application | undefined, requiredIds: string[], gaps: number) {
  const documents = application?.documents ?? {}
  const done = requiredIds.filter((id) => documents[id]?.status && documents[id].status !== 'missing').length
  return {
    documentsDone: done,
    documentsTotal: requiredIds.length,
    statementGaps: gaps,
    ready: done === requiredIds.length && gaps === 0,
  }
}

/** One percentage, used by every surface that shows one. Documents carry most
    of the weight because they are the part a student cannot write their way
    out of; the statement closes the rest as its gaps are filled. Kept here
    rather than in a component so the chat and the applications page can never
    quote different numbers for the same application. */
export function completion(state: ReturnType<typeof readiness>, gaps: number): number {
  const documents = state.documentsTotal === 0 ? 1 : state.documentsDone / state.documentsTotal
  const statement = gaps === 0 ? 1 : Math.max(0, 1 - gaps / 4)
  return Math.round((documents * 0.6 + statement * 0.4) * 100)
}

/** How many files are recorded against this application. */
export function attachedCount(application: Application): number {
  return Object.values(application.documents).filter((doc) => doc.versions?.length).length
}

/** When the student last did anything to this application. */
export function lastTouched(application: Application): string | undefined {
  return application.history?.[application.history.length - 1]?.at
}
