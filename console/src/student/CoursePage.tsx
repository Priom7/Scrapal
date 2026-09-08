import {
  ArrowLeft, Banknote, Bookmark, BookmarkCheck, BookOpen, Briefcase,
  CalendarDays, Copy, ExternalLink, FileText, GraduationCap, Quote, Share2,
} from 'lucide-react'
import { useState } from 'react'
import type { GalleryCourse } from '../api'
import { ICON } from '../lib'
import { linkTo, navigate } from '../router'
import { useToast } from '../toast'
import { SafeImage } from './Avatar'
import { ChangeWatch } from './ChangeWatch'
import { copyText } from './clipboard'
import { OverflowMenu } from './OverflowMenu'
import { MatchScore } from './MatchPanel'
import { matchCourse, type RequirementCheck } from './match'
import { hasAnything, type StudentProfile } from './profile'
import { isSaved, savedAt, toggleSaved, useSavedEntries } from './saved'
import { Loading } from '../brand'

type FigureKey = 'fees' | 'durations' | 'intake_months'

const SECTIONS = [
  { id: 'match', label: 'Where you stand', icon: GraduationCap },
  { id: 'figures', label: 'The numbers', icon: Banknote },
  { id: 'about', label: 'About', icon: BookOpen },
  { id: 'modules', label: 'What you study', icon: FileText },
  { id: 'careers', label: 'Where it leads', icon: Briefcase },
]

export function CoursePage({ id, courses, loading, profile }: {
  id: string
  courses: GalleryCourse[]
  loading: boolean
  profile: StudentProfile
}) {
  const back = linkTo('/student/find')
  const entries = useSavedEntries()
  const saved = entries.map((entry) => entry.id)
  const notify = useToast()
  const [receipt, setReceipt] = useState<FigureKey>()
  const [here, setHere] = useState('match')

  const course = courses.find((item) => item.id === id)

  if (loading) return <Loading>Opening this course…</Loading>
  if (!course) {
    return <div className="student-empty">
      <h2>That course is not published</h2>
      <p>It may have been withdrawn, or the link may be out of date.</p>
      <a className="student-button" {...back}>Back to search</a>
    </div>
  }

  const result = matchCourse(course, profile)
  const isOn = isSaved(saved, course.id)
  const shown = receipt ? course.evidence?.fields?.[receipt]?.[0] : undefined
  const fee = course.fees.find((item) => item.residency === 'international')?.amount

  const figures: { key: FigureKey; label: string; value: string; icon: typeof Banknote }[] = [
    { key: 'fees', label: 'Tuition', value: fee != null ? `£${fee.toLocaleString('en-GB')}` : 'Not stated', icon: Banknote },
    { key: 'durations', label: 'Length', value: course.durations[0] ?? 'Not stated', icon: CalendarDays },
    { key: 'intake_months', label: 'Starts', value: course.intake_months.join(', ') || 'Not stated', icon: CalendarDays },
  ]

  const jump = (sectionId: string) => {
    document.getElementById(`course-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setHere(sectionId)
  }

  const save = () => {
    const now = toggleSaved(course.id)
    notify({
      key: `saved-${course.id}`,
      tone: now ? 'success' : 'info',
      title: now ? 'Saved' : 'Removed from saved',
      detail: course.title,
      onUndo: () => toggleSaved(course.id),
    })
  }

  return <article className="course-detail">
    <div className="detail-banner">
      <SafeImage
        src={course.institution.banner_url}
        alt=""
        fallback={<span className="banner-fill" style={{ background: course.institution.brand_color ?? undefined }} />}
      />
      <a className="detail-back" {...back}><ArrowLeft size={ICON.sm} aria-hidden="true" /> All courses</a>
      <div className="detail-title">
        <p className="detail-inst">
          <GraduationCap size={ICON.xs} aria-hidden="true" />
          {course.institution.name}{course.institution.city ? `, ${course.institution.city}` : ''}
        </p>
        <h1>{course.title}</h1>
        <div className="detail-chips">
          {[course.award, course.level, ...course.study_modes].filter(Boolean).slice(0, 4)
            .map((chip) => <span key={String(chip)}>{chip}</span>)}
        </div>
      </div>
    </div>

    <div className="detail-actions">
      <button type="button" className={`student-button ${isOn ? 'saved' : ''}`} onClick={save} aria-pressed={isOn}>
        {isOn ? <BookmarkCheck size={ICON.sm} /> : <Bookmark size={ICON.sm} />}
        {isOn ? 'Saved' : 'Save'}
      </button>
      <a className="student-button" href={course.source_url} target="_blank" rel="noreferrer">
        <ExternalLink size={ICON.sm} aria-hidden="true" /> University page
      </a>

      <OverflowMenu items={[
        {
          label: 'Copy link to this course',
          icon: <Share2 size={ICON.sm} aria-hidden="true" />,
          onSelect: () => copyText(window.location.href, 'Link copied', 'Share it with whoever is helping you decide.', notify),
        },
        {
          label: 'Copy the key details',
          icon: <Copy size={ICON.sm} aria-hidden="true" />,
          onSelect: () => copyText(
            `${course.title} — ${course.institution.name}\n${figures.map((figure) => `${figure.label}: ${figure.value}`).join('\n')}\n${course.source_url}`,
            'Details copied', 'Fees, length and start dates.', notify,
          ),
        },
        {
          label: 'Work out the full cost',
          icon: <Banknote size={ICON.sm} aria-hidden="true" />,
          onSelect: () => navigate('/student/money'),
        },
      ]} />
    </div>

    <nav className="detail-nav" aria-label="Sections of this course">
      {SECTIONS.map(({ id: sectionId, label, icon: Icon }) => (
        <button
          key={sectionId}
          type="button"
          className={here === sectionId ? 'on' : ''}
          onClick={() => jump(sectionId)}
        >
          <Icon size={ICON.xs} aria-hidden="true" /> {label}
        </button>
      ))}
    </nav>

    <section className="detail-section" id="course-match">
      <h2><GraduationCap size={ICON.sm} aria-hidden="true" /> Where you stand</h2>
      <div className="key-strip-student">
        {result.checks.map((check) => <KeyFact key={check.id} check={check} />)}
      </div>
      <div className="detail-score"><MatchScore result={result} /></div>
      {!hasAnything(profile) && (
        <p className="match-invite">
          <a {...linkTo('/student/profile')}>Add your grades, English scores and budget</a> to see which of these you meet.
        </p>
      )}
    </section>

    <ChangeWatch recordId={course.id} since={savedAt(entries, course.id)} />

    <section className="detail-section" id="course-figures">
      <h2><Banknote size={ICON.sm} aria-hidden="true" /> The numbers, and where they came from</h2>
      <dl className="figure-rows">
        {figures.map((figure) => {
          const evidence = course.evidence?.fields?.[figure.key]?.[0]
          const open = receipt === figure.key
          return <div key={figure.key}>
            <dt><figure.icon size={ICON.xs} aria-hidden="true" /> {figure.label}</dt>
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

    {course.course_content && (
      <section className="detail-section" id="course-about">
        <h2><BookOpen size={ICON.sm} aria-hidden="true" /> About this course</h2>
        <p>{course.course_content}</p>
      </section>
    )}

    {course.modules.length > 0 && (
      <section className="detail-section" id="course-modules">
        <h2><FileText size={ICON.sm} aria-hidden="true" /> What you will study</h2>
        <ul className="module-list">{course.modules.map((module) => <li key={module}>{module}</li>)}</ul>
      </section>
    )}

    {course.careers && (
      <section className="detail-section" id="course-careers">
        <h2><Briefcase size={ICON.sm} aria-hidden="true" /> Where it leads</h2>
        <p>{course.careers}</p>
      </section>
    )}
  </article>
}

function KeyFact({ check }: { check: RequirementCheck }) {
  return <div className={`key-fact-student ${check.verdict}`}>
    <dt>{check.label}</dt>
    <dd>{check.verdict === 'met' ? (check.short || check.asks) : (check.gap || check.asks)}</dd>
  </div>
}
