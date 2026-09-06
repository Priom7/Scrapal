import { ArrowLeft, Bookmark, BookmarkCheck, ExternalLink, Quote } from 'lucide-react'
import { useState } from 'react'
import type { GalleryCourse } from '../api'
import { ICON } from '../lib'
import { linkTo } from '../router'
import { useToast } from '../toast'
import { MatchPanel } from './MatchPanel'
import { matchCourse } from './match'
import { hasAnything, type StudentProfile } from './profile'
import { isSaved, toggleSaved, useSaved } from './saved'

type FigureKey = 'fees' | 'durations' | 'intake_months' | 'entry_requirements'

export function CoursePage({ id, courses, loading, profile }: {
  id: string
  courses: GalleryCourse[]
  loading: boolean
  profile: StudentProfile
}) {
  const back = linkTo('/student/find')
  const profileLink = linkTo('/student/profile')
  const saved = useSaved()
  const notify = useToast()
  const [receipt, setReceipt] = useState<FigureKey>()

  const course = courses.find((item) => item.id === id)

  if (loading) return <p className="find-count">Loading course…</p>
  if (!course) {
    return <div className="student-empty">
      <h2>That course is not published</h2>
      <p>
        It may have been withdrawn, or the link may be out of date. Every course still available
        is on the search page.
      </p>
      <a className="student-button" {...back}>Back to search</a>
    </div>
  }

  const result = matchCourse(course, profile)
  const isOn = isSaved(saved, course.id)
  const shown = receipt ? course.evidence?.fields?.[receipt]?.[0] : undefined
  const fee = course.fees.find((item) => item.residency === 'international')?.amount

  const figures: { key: FigureKey; label: string; value: string }[] = [
    { key: 'fees', label: 'Tuition, international', value: fee != null ? `£${fee.toLocaleString('en-GB')}` : 'Not stated' },
    { key: 'durations', label: 'Length', value: course.durations[0] ?? 'Not stated' },
    { key: 'intake_months', label: 'Starts', value: course.intake_months.join(', ') || 'Not stated' },
  ]

  return <article className="course-page">
    <a className="student-back" {...back}><ArrowLeft size={ICON.sm} aria-hidden="true" /> All courses</a>

    <header className="course-head">
      <p className="course-inst">{course.institution.name}{course.institution.city ? `, ${course.institution.city}` : ''}</p>
      <h1>{course.title}</h1>
      <p className="course-award">{[course.award, course.level, ...course.study_modes].filter(Boolean).join(' · ')}</p>
      <button
        type="button"
        className={`student-button ${isOn ? 'saved' : ''}`}
        onClick={() => {
          const nowSaved = toggleSaved(course.id)
          notify({
            key: `saved-${course.id}`,
            tone: nowSaved ? 'success' : 'info',
            title: nowSaved ? 'Saved' : 'Removed from saved',
            detail: course.title,
            onUndo: () => toggleSaved(course.id),
          })
        }}
        aria-pressed={isOn}
      >
        {isOn ? <BookmarkCheck size={ICON.sm} /> : <Bookmark size={ICON.sm} />}
        {isOn ? 'Saved' : 'Save this course'}
      </button>
    </header>

    <MatchPanel result={result} detailed />
    {!hasAnything(profile) && (
      <p className="match-invite">
        <a {...profileLink}>Add your grades, English scores and budget</a> to see which of these you
        already meet.
      </p>
    )}

    <section className="course-figures-block">
      <h2>The numbers, and where they came from</h2>
      <dl className="figure-rows">
        {figures.map((figure) => {
          const evidence = course.evidence?.fields?.[figure.key]?.[0]
          const open = receipt === figure.key
          return <div key={figure.key}>
            <dt>{figure.label}</dt>
            <dd>
              <button
                type="button"
                className={`figure-value ${evidence ? 'cited' : ''}`}
                disabled={!evidence}
                aria-expanded={evidence ? open : undefined}
                onClick={() => setReceipt(open ? undefined : figure.key)}
              >
                {figure.value}
              </button>
            </dd>
          </div>
        })}
      </dl>
      {shown
        ? <blockquote className="receipt-quote">
            <Quote size={ICON.xs} aria-hidden="true" />
            <p>{shown.excerpt}</p>
            <cite>Read from {new URL(shown.source_url ?? course.source_url).hostname}</cite>
          </blockquote>
        : <p className="receipt-hint">Tap a figure to read the sentence it came from.</p>}
    </section>

    {course.course_content && <section className="course-prose">
      <h2>About this course</h2>
      <p>{course.course_content}</p>
    </section>}

    {course.modules.length > 0 && <section className="course-prose">
      <h2>What you will study</h2>
      <ul className="module-list">{course.modules.map((module) => <li key={module}>{module}</li>)}</ul>
    </section>}

    {course.careers && <section className="course-prose">
      <h2>Where it leads</h2>
      <p>{course.careers}</p>
    </section>}

    <a className="student-source" href={course.source_url} target="_blank" rel="noreferrer">
      Read the university&rsquo;s own course page <ExternalLink size={ICON.xs} aria-hidden="true" />
    </a>
  </article>
}
