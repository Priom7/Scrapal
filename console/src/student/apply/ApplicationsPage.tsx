import {
  ArrowLeft, Banknote, Check, Clock, Copy, Eye, FileText, FileUp, History,
  LayoutGrid, List, Paperclip, PenLine, Send, Trash2, TriangleAlert, UserCheck, X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { GalleryCourse } from '../../api'
import { ICON } from '../../lib'
import { navigate } from '../../router'
import { useToast } from '../../toast'
import { SafeImage } from '../Avatar'
import { courseYears } from '../costs'
import { matchCourse } from '../match'
import { MatchScore } from '../MatchPanel'
import { OverflowMenu } from '../OverflowMenu'
import type { StudentProfile } from '../profile'
import { expiryWarning, requiredDocuments, type RequiredDoc } from './documents'
import { draftStatement, PROMPTS, statementText } from './statement'
import {
  addDocumentVersion, readiness, removeApplication, restoreApplication, setAnswer,
  setDocument, setStatus, STATUS_LABELS, useApplications,
  type Application, type ApplicationStatus,
} from './store'

const STAGES: ApplicationStatus[] = ['draft', 'submitted', 'offer', 'unsuccessful']

export function ApplicationsPage({ courses, loading, profile }: {
  courses: GalleryCourse[]
  loading: boolean
  profile: StudentProfile
}) {
  const applications = useApplications()
  const [openId, setOpenId] = useState<string>()
  const [view, setView] = useState<'list' | 'board'>(() =>
    (localStorage.getItem('scrapal.student.appview') as 'list' | 'board') ?? 'list')

  const chooseView = (next: 'list' | 'board') => {
    setView(next)
    localStorage.setItem('scrapal.student.appview', next)
  }

  if (loading) return <p className="find-count">Loading…</p>

  if (!applications.length) {
    return <div className="student-empty">
      <h2>No applications started</h2>
      <p>
        Ask Scrapal to get a course ready and it will build the document list from that
        university’s own requirements, then draft the statement around what you tell it.
      </p>
      <button type="button" className="student-button" onClick={() => navigate('/student')}>
        Talk to Scrapal
      </button>
    </div>
  }

  const current = applications.find((item) => item.courseId === openId)
  const currentCourse = current && courses.find((item) => item.id === current.courseId)

  if (current && currentCourse) {
    return <div className="applications">
      <button type="button" className="student-back" onClick={() => setOpenId(undefined)}>
        <ArrowLeft size={ICON.sm} aria-hidden="true" /> All applications
      </button>
      <Pack application={current} course={currentCourse} profile={profile} />
    </div>
  }

  return <div className="applications">
    <div className="app-toolbar">
      <p className="money-lead">
        Everything you have started, and how far along each one is.
      </p>
      <div className="view-switch" role="group" aria-label="How to show your applications">
        <button type="button" aria-pressed={view === 'list'} onClick={() => chooseView('list')}>
          <List size={ICON.xs} aria-hidden="true" /> List
        </button>
        <button type="button" aria-pressed={view === 'board'} onClick={() => chooseView('board')}>
          <LayoutGrid size={ICON.xs} aria-hidden="true" /> Board
        </button>
      </div>
    </div>

    {view === 'list'
      ? <ul className="application-cards">
          {applications.map((application) => {
            const course = courses.find((item) => item.id === application.courseId)
            if (!course) return null
            return <li key={application.courseId}>
              <ApplicationCard
                application={application}
                course={course}
                profile={profile}
                onOpen={() => setOpenId(application.courseId)}
              />
            </li>
          })}
        </ul>
      : <Board applications={applications} courses={courses} profile={profile} onOpen={setOpenId} />}
  </div>
}

/** A stage board. Dragging is the quick way; every card also carries move
    controls, because a board you can only operate by dragging is unusable with
    a keyboard and awkward on a phone. */
function Board({ applications, courses, profile, onOpen }: {
  applications: Application[]
  courses: GalleryCourse[]
  profile: StudentProfile
  onOpen: (courseId: string) => void
}) {
  const notify = useToast()
  const [dragging, setDragging] = useState<string>()
  const [over, setOver] = useState<ApplicationStatus>()

  const move = (courseId: string, to: ApplicationStatus) => {
    const application = applications.find((item) => item.courseId === courseId)
    if (!application || application.status === to) return
    const from = application.status
    setStatus(courseId, to)
    const course = courses.find((item) => item.id === courseId)
    notify({
      title: `Moved to ${STATUS_LABELS[to].toLowerCase()}`,
      detail: course?.title,
      onUndo: () => setStatus(courseId, from),
    })
  }

  return <div className="board">
    {STAGES.map((stage) => {
      const inStage = applications.filter((application) => application.status === stage)
      return <section
        key={stage}
        className={`board-column ${over === stage ? 'over' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setOver(stage) }}
        onDragLeave={() => setOver((current) => (current === stage ? undefined : current))}
        onDrop={(event) => {
          event.preventDefault()
          setOver(undefined)
          const id = event.dataTransfer.getData('text/plain') || dragging
          if (id) move(id, stage)
        }}
      >
        <header>
          <h2>{STATUS_LABELS[stage]}</h2>
          <span>{inStage.length}</span>
        </header>
        <ul>
          {inStage.map((application) => {
            const course = courses.find((item) => item.id === application.courseId)
            if (!course) return null
            const index = STAGES.indexOf(stage)
            return <li key={application.courseId}>
              <BoardCard
                application={application}
                course={course}
                profile={profile}
                dragging={dragging === application.courseId}
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', application.courseId)
                  event.dataTransfer.effectAllowed = 'move'
                  setDragging(application.courseId)
                }}
                onDragEnd={() => setDragging(undefined)}
                onOpen={() => onOpen(application.courseId)}
                onMove={(direction) => {
                  const next = STAGES[index + direction]
                  if (next) move(application.courseId, next)
                }}
                canBack={index > 0}
                canForward={index < STAGES.length - 1}
              />
            </li>
          })}
          {inStage.length === 0 && <li className="board-empty">Nothing here</li>}
        </ul>
      </section>
    })}
  </div>
}

function BoardCard({ application, course, profile, dragging, onDragStart, onDragEnd, onOpen, onMove, canBack, canForward }: {
  application: Application
  course: GalleryCourse
  profile: StudentProfile
  dragging: boolean
  onDragStart: (event: React.DragEvent) => void
  onDragEnd: () => void
  onOpen: () => void
  onMove: (direction: -1 | 1) => void
  canBack: boolean
  canForward: boolean
}) {
  const docs = requiredDocuments(course)
  const draft = draftStatement(course, profile, application.answers)
  const state = readiness(application, docs.map((doc) => doc.id), draft.gaps)
  const attached = Object.values(application.documents).filter((doc) => doc.versions?.length).length

  return <article
    className={`board-card ${dragging ? 'dragging' : ''}`}
    draggable
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
  >
    <button type="button" className="board-open" onClick={onOpen}>
      <strong>{course.title}</strong>
      <span>{course.institution.name}</span>
    </button>
    <dl>
      <div><dt><FileText size={ICON.xs} aria-hidden="true" /></dt><dd>{state.documentsDone}/{state.documentsTotal}</dd></div>
      <div><dt><Paperclip size={ICON.xs} aria-hidden="true" /></dt><dd>{attached}</dd></div>
      <div><dt><PenLine size={ICON.xs} aria-hidden="true" /></dt><dd>{draft.gaps}</dd></div>
    </dl>
    <div className="board-move">
      <button type="button" disabled={!canBack} onClick={() => onMove(-1)} aria-label={`Move ${course.title} back a stage`}>←</button>
      <button type="button" disabled={!canForward} onClick={() => onMove(1)} aria-label={`Move ${course.title} on a stage`}>→</button>
    </div>
  </article>
}

function ApplicationCard({ application, course, profile, onOpen }: {
  application: Application
  course: GalleryCourse
  profile: StudentProfile
  onOpen: () => void
}) {
  const notify = useToast()
  const docs = requiredDocuments(course)
  const draft = draftStatement(course, profile, application.answers)
  const state = readiness(application, docs.map((doc) => doc.id), draft.gaps)
  const attached = Object.values(application.documents).filter((doc) => doc.versions?.length).length
  const match = matchCourse(course, profile)
  const complete = Math.round(
    ((state.documentsDone / Math.max(1, state.documentsTotal)) * 0.6
      + (draft.gaps === 0 ? 1 : Math.max(0, 1 - draft.gaps / 4)) * 0.4) * 100,
  )

  return <article className="application-card">
    <SafeImage
      className="application-banner"
      src={course.institution.banner_url}
      alt=""
      fallback={<span className="application-banner placeholder" style={{ background: course.institution.brand_color ?? undefined }} />}
    />
    <div className="application-body">
      <header>
        <div>
          <h2><button type="button" onClick={onOpen}>{course.title}</button></h2>
          <p>{course.institution.name}{course.institution.city ? `, ${course.institution.city}` : ''}</p>
        </div>
        <div className="app-head-actions">
          <span className={`app-status ${application.status}`}>{STATUS_LABELS[application.status]}</span>
          <OverflowMenu
            label={`More options for ${course.title}`}
            items={[
              ...(application.status === 'draft' ? [{
                label: 'Mark as sent',
                icon: <Send size={ICON.sm} aria-hidden="true" />,
                onSelect: () => {
                  setStatus(application.courseId, 'submitted')
                  notify({ title: 'Marked as sent', detail: `${course.title}. Tell Scrapal when you hear back.` })
                },
              }] : []),
              {
                label: 'Work out the full cost',
                icon: <Banknote size={ICON.sm} aria-hidden="true" />,
                onSelect: () => navigate('/student/money'),
              },
              {
                label: 'Remove this application',
                icon: <Trash2 size={ICON.sm} aria-hidden="true" />,
                danger: true,
                onSelect: () => {
                  const snapshot = application
                  removeApplication(application.courseId)
                  notify({
                    tone: 'info',
                    title: 'Application removed',
                    detail: course.title,
                    onUndo: () => restoreApplication(snapshot),
                  })
                },
              },
            ]}
          />
        </div>
      </header>

      <div className="app-progress" role="img" aria-label={`${complete} per cent complete`}>
        <span style={{ width: `${complete}%` }} />
      </div>

      <dl className="app-stats">
        <div><dt>Complete</dt><dd>{complete}%</dd></div>
        <div><dt>Documents</dt><dd>{state.documentsDone}<small> / {state.documentsTotal}</small></dd></div>
        <div><dt>Attached</dt><dd>{attached}</dd></div>
        <div><dt>Statement</dt><dd>{draft.gaps}<small> gap{draft.gaps === 1 ? '' : 's'}</small></dd></div>
        <div className="app-match"><dt>Match</dt><dd><MatchScore result={match} size="small" /></dd></div>
      </dl>

      <button type="button" className="student-button primary" onClick={onOpen}>Open this application</button>
    </div>
  </article>
}

/* ------------------------------------------------------------------ pack */

function Pack({ application, course, profile }: {
  application: Application
  course: GalleryCourse
  profile: StudentProfile
}) {
  const docs = useMemo(() => requiredDocuments(course), [course])
  const draft = useMemo(
    () => draftStatement(course, profile, application.answers),
    [course, profile, application.answers],
  )
  const state = readiness(application, docs.map((doc) => doc.id), draft.gaps)

  return <>
    <header className="pack-head">
      <p className="pack-course">{course.title} · {course.institution.name}</p>
      <p className={`pack-status ${state.ready ? 'ready' : ''}`}>
        {state.ready
          ? 'Everything is ready to copy across.'
          : `${state.documentsDone} of ${state.documentsTotal} documents · ${draft.gaps} gap${draft.gaps === 1 ? '' : 's'} left in your statement`}
      </p>
      <label className="pack-stage">
        Where it stands
        <select
          value={application.status}
          onChange={(event) => setStatus(application.courseId, event.target.value as ApplicationStatus)}
        >
          {STAGES.map((key) => <option key={key} value={key}>{STATUS_LABELS[key]}</option>)}
        </select>
      </label>
    </header>

    <Documents application={application} course={course} docs={docs} />
    <Statement application={application} course={course} profile={profile} />
    {application.referee && (
      <section className="money-block">
        <h2><UserCheck size={ICON.sm} aria-hidden="true" /> Your referee</h2>
        <p className="money-note">{application.referee.name}{application.referee.email ? ` · ${application.referee.email}` : ''}</p>
      </section>
    )}
    <ActivityLog application={application} />
  </>
}

function Documents({ application, course, docs }: {
  application: Application
  course: GalleryCourse
  docs: RequiredDoc[]
}) {
  const notify = useToast()
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})
  const [showVersions, setShowVersions] = useState<string>()
  const endsAt = new Date(new Date().setFullYear(new Date().getFullYear() + courseYears(course)))

  return <section className="money-block">
    <h2><FileText size={ICON.sm} aria-hidden="true" /> What this university asks for</h2>
    <ul className="doc-list">
      {docs.map((doc) => {
        const state = application.documents[doc.id]
        const versions = state?.versions ?? []
        const done = Boolean(state?.status && state.status !== 'missing')
        const warning = doc.expires ? expiryWarning(state?.expiresAt ?? null, endsAt) : null
        return <li key={doc.id} className={done ? 'done' : ''}>
          <button
            type="button"
            className="doc-tick"
            aria-pressed={done}
            aria-label={done ? `Mark ${doc.label} as not ready` : `Mark ${doc.label} as ready`}
            onClick={() => setDocument(application.courseId, doc.id, {
              ...state, status: done ? 'missing' : 'have',
            }, doc.label)}
          >
            {done ? <Check size={ICON.xs} /> : null}
          </button>
          <div className="doc-body">
            <strong>
              {doc.label}
              {doc.fromCourse && <span className="origin-tag course">from the university</span>}
            </strong>
            <span className="doc-why">{doc.why}</span>

            {versions.length > 0 && (
              <div className="doc-versions">
                <span className="doc-file">
                  <Paperclip size={ICON.xs} aria-hidden="true" />
                  {versions[0].fileName}
                  {versions[0].fileSize ? ` · ${Math.round(versions[0].fileSize / 1024)} KB` : ''}
                </span>
                {versions.length > 1 && (
                  <button
                    type="button"
                    className="student-link"
                    aria-expanded={showVersions === doc.id}
                    onClick={() => setShowVersions(showVersions === doc.id ? undefined : doc.id)}
                  >
                    <History size={ICON.xs} aria-hidden="true" />
                    {versions.length - 1} earlier version{versions.length === 2 ? '' : 's'}
                  </button>
                )}
                {showVersions === doc.id && (
                  <ol className="version-list">
                    {versions.slice(1).map((version) => (
                      <li key={`${version.fileName}-${version.addedAt}`}>
                        <span>{version.fileName}</span>
                        <time dateTime={version.addedAt}>{new Date(version.addedAt).toLocaleDateString('en-GB')}</time>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            {doc.expires && (
              <label className="doc-expiry">
                Expires
                <input
                  type="date"
                  value={state?.expiresAt ?? ''}
                  onChange={(event) => setDocument(application.courseId, doc.id, {
                    ...state, status: state?.status ?? 'have', expiresAt: event.target.value || undefined,
                  })}
                />
              </label>
            )}
            {warning && <p className="doc-warning"><TriangleAlert size={ICON.xs} aria-hidden="true" /> {warning}</p>}
          </div>
          <button type="button" className="doc-attach" onClick={() => fileInputs.current[doc.id]?.click()}>
            <FileUp size={ICON.xs} aria-hidden="true" /> {versions.length ? 'Replace' : 'Attach'}
          </button>
          <input
            ref={(element) => { fileInputs.current[doc.id] = element }}
            type="file"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              addDocumentVersion(application.courseId, doc.id, doc.label, {
                fileName: file.name, fileSize: file.size, addedAt: new Date().toISOString(),
              })
              notify({
                title: versions.length ? 'Replaced' : 'Attached',
                detail: versions.length ? `${doc.label}. The previous file is kept.` : `${file.name} recorded against ${doc.label}.`,
              })
              event.target.value = ''
            }}
          />
        </li>
      })}
    </ul>
    <p className="money-note">
      Scrapal records the file name and date so you know what you have, and does not keep the file
      itself. Upload the document to the university’s own portal when you apply.
    </p>
  </section>
}

function Statement({ application, course, profile }: {
  application: Application
  course: GalleryCourse
  profile: StudentProfile
}) {
  const notify = useToast()
  const [preview, setPreview] = useState(false)
  const draft = draftStatement(course, profile, application.answers)
  const text = statementText(draft)

  return <section className="money-block">
    <div className="statement-head">
      <h2><PenLine size={ICON.sm} aria-hidden="true" /> Your personal statement</h2>
      <div className="statement-actions">
        <button type="button" className="student-button" onClick={() => setPreview(true)}>
          <Eye size={ICON.xs} aria-hidden="true" /> Preview
        </button>
        <button
          type="button"
          className="student-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              notify({ title: 'Copied', detail: 'Your statement is on the clipboard.' })
            } catch {
              notify({ tone: 'error', title: 'Could not copy', detail: 'Select the text and copy it manually.' })
            }
          }}
        >
          <Copy size={ICON.xs} aria-hidden="true" /> Copy all
        </button>
      </div>
    </div>

    <p className="money-warn">
      <TriangleAlert size={ICON.xs} aria-hidden="true" />
      This is a scaffold in your own words, not a finished statement. Everything in [brackets] is
      yours to write. Never let anyone add achievements you do not have — universities check, and a
      fabricated statement ends an application.
    </p>

    {PROMPTS.map((prompt) => (
      <label key={prompt.id} className="statement-prompt">
        {prompt.question}
        <textarea
          rows={2}
          defaultValue={application.answers[prompt.id] ?? ''}
          placeholder={prompt.hint}
          onBlur={(event) => setAnswer(application.courseId, prompt.id, event.target.value)}
        />
      </label>
    ))}

    <div className="statement-draft">
      {draft.sections.map((section) => (
        <div key={section.heading} className={section.needsYou ? 'needs-you' : ''}>
          <h3>{section.heading}</h3>
          <p>{section.body}</p>
        </div>
      ))}
    </div>
    <p className="cost-source">{draft.words} words written, {draft.gaps} gap{draft.gaps === 1 ? '' : 's'} left.</p>

    {/* Preview shows it the way a university would read it: one block, no
        headings, no editing furniture. */}
    {preview && (
      <div className="preview-layer">
        <button className="preview-backdrop" onClick={() => setPreview(false)} aria-label="Close preview" />
        <div className="preview-sheet" role="dialog" aria-modal="true" aria-label="Statement preview">
          <header>
            <h3>As the university will read it</h3>
            <button type="button" onClick={() => setPreview(false)} aria-label="Close preview"><X size={ICON.sm} /></button>
          </header>
          <div className="preview-body">
            {text.split('\n\n').map((paragraph) => <p key={paragraph.slice(0, 24)}>{paragraph}</p>)}
          </div>
          <footer>
            <span>{draft.words} words · {draft.gaps} gap{draft.gaps === 1 ? '' : 's'} still in brackets</span>
          </footer>
        </div>
      </div>
    )}
  </section>
}

function ActivityLog({ application }: { application: Application }) {
  const entries = [...(application.history ?? [])].reverse()
  if (!entries.length) return null
  return <section className="money-block">
    <h2><History size={ICON.sm} aria-hidden="true" /> What you have done so far</h2>
    <ol className="activity-log">
      {entries.map((entry) => (
        <li key={`${entry.at}-${entry.what}`} className={entry.kind}>
          <span className="activity-mark" aria-hidden="true"><Clock size={ICON.xs} /></span>
          <span className="activity-what">{entry.what}</span>
          <time dateTime={entry.at}>
            {new Date(entry.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </time>
        </li>
      ))}
    </ol>
  </section>
}
