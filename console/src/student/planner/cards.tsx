import { useQuery } from '@tanstack/react-query'
import { Check, Copy, FileUp, Quote } from 'lucide-react'
import { api, type GalleryCourse } from '../../api'
import { ICON } from '../../lib'
import { linkTo } from '../../router'
import { SafeImage } from '../Avatar'
import { requiredDocuments } from '../apply/documents'
import { draftStatement, statementText } from '../apply/statement'
import { addDocumentVersion, applicationFor, readiness, setDocument, STATUS_LABELS, useApplications } from '../apply/store'
import { useToast } from '../../toast'
import { modelCost } from '../costs'
import { matchCourse } from '../match'
import { MatchPanel } from '../MatchPanel'
import type { StudentProfile } from '../profile'
import type { Card } from './types'

export function CardView({ card, courses, profile, onSend }: {
  card: Card
  courses: GalleryCourse[]
  profile: StudentProfile
  onSend: (text: string, display?: string) => void
}) {
  if (card.kind === 'courses') return <Courses card={card} courses={courses} profile={profile} onSend={onSend} />
  if (card.kind === 'costs') return <Costs courseId={card.courseId} courses={courses} />
  if (card.kind === 'application') return <ApplicationCard courseId={card.courseId} courses={courses} profile={profile} />
  if (card.kind === 'answer') return <AnswerCard question={card.question} />
  if (card.kind === 'drafts') return <DraftsCard courses={courses} profile={profile} onSend={onSend} />
  if (card.kind === 'documents') return <DocumentsCard courseId={card.courseId} courses={courses} />
  if (card.kind === 'statement') return <StatementCard courseId={card.courseId} courses={courses} profile={profile} />
  return null
}

/** The catalogue, in the thread. It scrolls sideways so a list of courses does
    not push the conversation off the screen. */
function Courses({ card, courses, profile, onSend }: {
  card: Extract<Card, { kind: 'courses' }>
  courses: GalleryCourse[]
  profile: StudentProfile
  onSend: (text: string, display?: string) => void
}) {
  const found = card.courseIds
    .map((id) => courses.find((course) => course.id === id))
    .filter((course): course is GalleryCourse => Boolean(course))

  return <div className="chat-catalogue">
    <ul className="chat-rail">
      {found.map((course) => {
        const fee = course.fees.find((item) => item.residency === 'international')?.amount
        return <li key={course.id}>
          <SafeImage
            className="rail-photo"
            src={course.image_url}
            alt=""
            fallback={<span className="rail-photo placeholder" style={{ background: course.institution.brand_color ?? undefined }} />}
          />
          <a {...linkTo(`/student/courses/${course.id}`)}>
            <strong>{course.title}</strong>
            <span>{course.institution.name}{course.institution.city ? `, ${course.institution.city}` : ''}</span>
          </a>
          <MatchPanel result={matchCourse(course, profile)} compact />
          <dl className="chat-figures">
            <div><dt>Tuition</dt><dd>{fee != null ? `£${fee.toLocaleString('en-GB')}` : 'Not stated'}</dd></div>
            <div><dt>Length</dt><dd>{course.durations[0] ?? 'Not stated'}</dd></div>
            <div><dt>Starts</dt><dd>{course.intake_months[0] ?? 'Not stated'}</dd></div>
          </dl>
          <button
            type="button"
            className="student-button"
            onClick={() => onSend(`apply:${course.id}`, `Start my application for ${course.title}`)}
          >
            Start this application
          </button>
        </li>
      })}
    </ul>
    <p className="rail-hint">Swipe for more · tap a course to read the full page</p>
  </div>
}

function Costs({ courseId, courses }: { courseId: string; courses: GalleryCourse[] }) {
  const course = courses.find((item) => item.id === courseId)
  if (!course) return null
  const cost = modelCost(course)
  return <div className="chat-costs">
    <ul>
      {cost.lines.map((line) => (
        <li key={line.id}>
          <span>{line.label}<em>{line.origin === 'course' ? 'from the university' : 'reference figure'}</em></span>
          <span className="chat-amount">£{line.amount.toLocaleString('en-GB')}</span>
        </li>
      ))}
    </ul>
    <p className="chat-total">
      <span>Over {cost.years === 1 ? 'one year' : `${cost.years} years`}</span>
      <strong>£{cost.total.toLocaleString('en-GB')}</strong>
    </p>
    <a className="student-link" {...linkTo('/student/money')}>Work out what you can cover</a>
  </div>
}

function ApplicationCard({ courseId, courses, profile }: {
  courseId: string
  courses: GalleryCourse[]
  profile: StudentProfile
}) {
  const applications = useApplications()
  const course = courses.find((item) => item.id === courseId)
  const application = applicationFor(applications, courseId)
  if (!course) return null

  const docs = requiredDocuments(course)
  const draft = draftStatement(course, profile, application?.answers ?? {})
  const state = readiness(application, docs.map((doc) => doc.id), draft.gaps)

  return <div className="chat-application">
    <strong>{course.title}</strong>
    <span>{course.institution.name}</span>
    <ul>
      <li><span>Documents</span><span className="chat-amount">{state.documentsDone} of {state.documentsTotal}</span></li>
      <li><span>Statement</span><span className="chat-amount">{draft.words} words, {draft.gaps} to fill</span></li>
    </ul>
    <a className="student-button" {...linkTo('/student/applications')}>Open the pack</a>
  </div>
}

/** Answering a question mid-conversation, from published pages only. */
function AnswerCard({ question }: { question: string }) {
  const search = useQuery({
    queryKey: ['student', 'ask', question],
    queryFn: () => api.search(question),
  })

  if (search.isLoading) return <p className="chat-thinking-note">Looking through the published pages…</p>
  const hits = search.data?.hits.slice(0, 3) ?? []

  if (!hits.length) {
    return <div className="chat-answer empty">
      {/* The same rule as everywhere else: no source, no answer. */}
      <p>I do not have a source for that. I can only answer from pages I have read, so I would rather say nothing than guess.</p>
    </div>
  }

  return <div className="chat-answer">
    <ul>
      {hits.map((hit) => (
        <li key={hit.chunk_id}>
          <blockquote><Quote size={ICON.xs} aria-hidden="true" /><p>{hit.excerpt}</p></blockquote>
          <a href={hit.url} target="_blank" rel="noreferrer">{hit.title} · {hit.heading}</a>
        </li>
      ))}
    </ul>
  </div>
}

/** Drafts already on the go, so a student can come back days later. */
function DraftsCard({ courses, profile, onSend }: {
  courses: GalleryCourse[]
  profile: StudentProfile
  onSend: (text: string, display?: string) => void
}) {
  const applications = useApplications()
  if (!applications.length) {
    return <p className="chat-thinking-note">You have not started one yet. Say “start my application” whenever you are ready.</p>
  }

  return <ul className="chat-drafts">
    {applications.map((application) => {
      const course = courses.find((item) => item.id === application.courseId)
      if (!course) return null
      const docs = requiredDocuments(course)
      const draft = draftStatement(course, profile, application.answers)
      const state = readiness(application, docs.map((doc) => doc.id), draft.gaps)
      return <li key={application.courseId}>
        <div>
          <strong>{course.title}</strong>
          <span>
            <b className={`draft-status ${application.status}`}>{STATUS_LABELS[application.status]}</b>
            {' · '}{course.institution.name} · {state.documentsDone}/{state.documentsTotal} documents · {draft.gaps} gap{draft.gaps === 1 ? '' : 's'}
          </span>
        </div>
        <button
          type="button"
          className="student-button"
          onClick={() => onSend(`resume:${application.courseId}`, `Continue ${course.title}`)}
        >
          Continue
        </button>
      </li>
    })}
  </ul>
}

/** Ticking documents off without leaving the conversation. */
function DocumentsCard({ courseId, courses }: { courseId: string; courses: GalleryCourse[] }) {
  const applications = useApplications()
  const course = courses.find((item) => item.id === courseId)
  const application = applicationFor(applications, courseId)
  if (!course) return null
  const docs = requiredDocuments(course)

  return <ul className="chat-docs">
    {docs.map((doc) => {
      const state = application?.documents[doc.id]
      const done = Boolean(state?.status && state.status !== 'missing')
      return <li key={doc.id} className={done ? 'done' : ''}>
        <button
          type="button"
          aria-pressed={done}
          aria-label={done ? `Mark ${doc.label} as not ready` : `Mark ${doc.label} as ready`}
          onClick={() => setDocument(courseId, doc.id, { ...state, status: done ? 'missing' : 'have' }, doc.label)}
        >
          {done ? <Check size={ICON.xs} /> : null}
        </button>
        <span>
          {doc.label}
          {doc.fromCourse && <em>from the university</em>}
          {state?.versions?.[0] && <b className="chat-doc-file">{state.versions[0].fileName}</b>}
        </span>
        <label className="chat-doc-attach">
          <FileUp size={ICON.xs} aria-hidden="true" />
          <span className="sr-only">Attach {doc.label}</span>
          <input
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              addDocumentVersion(courseId, doc.id, doc.label, {
                fileName: file.name, fileSize: file.size, addedAt: new Date().toISOString(),
              })
            }}
          />
        </label>
      </li>
    })}
  </ul>
}

/** The statement itself, in the thread, ready to copy into a portal. */
function StatementCard({ courseId, courses, profile }: {
  courseId: string
  courses: GalleryCourse[]
  profile: StudentProfile
}) {
  const applications = useApplications()
  const notify = useToast()
  const course = courses.find((item) => item.id === courseId)
  const application = applicationFor(applications, courseId)
  if (!course) return null

  const draft = draftStatement(course, profile, application?.answers ?? {})

  return <div className="chat-statement">
    {draft.sections.map((section) => (
      <div key={section.heading} className={section.needsYou ? 'needs-you' : ''}>
        <h4>{section.heading}</h4>
        <p>{section.body}</p>
      </div>
    ))}
    <div className="chat-statement-foot">
      <span>{draft.words} words · {draft.gaps} gap{draft.gaps === 1 ? '' : 's'} left</span>
      <button
        type="button"
        className="student-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(statementText(draft))
            notify({ title: 'Copied', detail: 'Your statement is on the clipboard.' })
          } catch {
            notify({ tone: 'error', title: 'Could not copy', detail: 'Open the pack and copy it from there.' })
          }
        }}
      >
        <Copy size={ICON.xs} aria-hidden="true" /> Copy statement
      </button>
    </div>
  </div>
}
