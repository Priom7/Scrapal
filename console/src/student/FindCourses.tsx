import { Bookmark, BookmarkCheck, Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { GalleryCourse } from '../api'
import { ICON } from '../lib'
import { linkTo } from '../router'
import { useToast } from '../toast'
import { MatchPanel } from './MatchPanel'
import { matchCourse, matchRank } from './match'
import { describeProfile, hasAnything, type StudentProfile } from './profile'
import { isSaved, toggleSaved, useSaved } from './saved'

const LEVELS = ['Undergraduate', 'Postgraduate']

export function FindCourses({ courses, loading, error, profile, savedOnly }: {
  courses: GalleryCourse[]
  loading: boolean
  error?: string
  profile: StudentProfile
  savedOnly: boolean
}) {
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<string>()
  const [country, setCountry] = useState<string>()
  const saved = useSaved()
  const notify = useToast()

  const countries = useMemo(
    () => [...new Set(courses.map((course) => course.institution.country_code).filter(Boolean))] as string[],
    [courses],
  )

  const results = useMemo(() => {
    const text = query.trim().toLowerCase()
    return courses
      .filter((course) => !savedOnly || saved.includes(course.id))
      .filter((course) => !level || course.level === level)
      .filter((course) => !country || course.institution.country_code === country)
      .filter((course) => !text
        || `${course.title} ${course.institution.name} ${course.award ?? ''}`.toLowerCase().includes(text))
      .map((course) => ({ course, result: matchCourse(course, profile) }))
      // Courses a student can act on come first. Nothing is hidden — a course
      // they miss on one requirement is often still the right course.
      .sort((a, b) => matchRank(a.result) - matchRank(b.result))
  }, [courses, query, level, country, savedOnly, saved, profile])

  const profiled = hasAnything(profile)

  return <div className="find">
    {!savedOnly && <p className="find-sub">
      Search {courses.length} published courses. Every fee, requirement and start date below was
      read from the university&rsquo;s own page.
    </p>}

    {/* Always say what results are being measured against, so the verdicts are
        never mysterious. */}
    <ProfileStrip profile={profile} profiled={profiled} />

    {!savedOnly && <div className="find-controls">
      <label className="find-search">
        <Search size={ICON.sm} aria-hidden="true" />
        <span className="sr-only">Search courses</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Subject, university, or award"
        />
      </label>
      <div className="find-filters">
        <SlidersHorizontal size={ICON.sm} aria-hidden="true" />
        <Choice label="Any level" value={level} options={LEVELS} onChange={setLevel} name="Level" />
        <Choice label="Anywhere" value={country} options={countries} onChange={setCountry} name="Country" />
      </div>
    </div>}

    {error && <p className="student-error">{error}</p>}

    {loading
      ? <p className="find-count">Loading courses…</p>
      : <p className="find-count" aria-live="polite">
          {results.length === 0
            ? 'No courses match'
            : `${results.length} course${results.length === 1 ? '' : 's'}`}
          {profiled && results.length > 0 && ', best matches first'}
        </p>}

    {!loading && results.length === 0 && (
      <div className="student-empty">
        <h2>{savedOnly ? 'Nothing saved yet' : 'Nothing matches that search'}</h2>
        <p>
          {savedOnly
            ? 'Save a course from the results and it will wait here for you to compare later.'
            : 'Try a broader subject, or clear a filter. Widening the search never hides courses you could get into.'}
        </p>
      </div>
    )}

    <ul className="course-list">
      {results.map(({ course, result }) => (
        <li key={course.id}>
          <CourseCard
            course={course}
            result={result}
            saved={isSaved(saved, course.id)}
            onSave={() => {
              const nowSaved = toggleSaved(course.id)
              notify({
                key: `saved-${course.id}`,
                tone: nowSaved ? 'success' : 'info',
                title: nowSaved ? 'Saved' : 'Removed from saved',
                detail: course.title,
                onUndo: () => toggleSaved(course.id),
              })
            }}
          />
        </li>
      ))}
    </ul>
  </div>
}

function ProfileStrip({ profile, profiled }: { profile: StudentProfile; profiled: boolean }) {
  const link = linkTo('/student/profile')
  if (!profiled) {
    return <div className="profile-strip invite">
      <div>
        <strong>Tell us four things and we will tell you where you stand</strong>
        <span>Your grades, English scores, budget and start date. Stored on this device only.</span>
      </div>
      <a className="student-button" {...link}>Add your details</a>
    </div>
  }
  return <div className="profile-strip">
    <div>
      <strong>Matching against your details</strong>
      <span>{describeProfile(profile)}</span>
    </div>
    <a className="student-link" {...link}>Edit</a>
  </div>
}

function Choice({ label, value, options, onChange, name }: {
  label: string
  value?: string
  options: string[]
  onChange: (value?: string) => void
  name: string
}) {
  return <label className="find-choice">
    <span className="sr-only">{name}</span>
    <select value={value ?? ''} onChange={(event) => onChange(event.target.value || undefined)}>
      <option value="">{label}</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  </label>
}

function CourseCard({ course, result, saved, onSave }: {
  course: GalleryCourse
  result: ReturnType<typeof matchCourse>
  saved: boolean
  onSave: () => void
}) {
  const link = linkTo(`/student/courses/${course.id}`)
  const fee = course.fees.find((item) => item.residency === 'international')?.amount
  return <article className="course-card">
    <div className="course-top">
      <div className="course-id">
        <h2><a {...link}>{course.title}</a></h2>
        <p>{course.institution.name}{course.institution.city ? `, ${course.institution.city}` : ''}</p>
      </div>
      <button
        type="button"
        className={`save-toggle ${saved ? 'on' : ''}`}
        onClick={onSave}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${course.title} from saved` : `Save ${course.title}`}
      >
        {saved ? <BookmarkCheck size={ICON.md} /> : <Bookmark size={ICON.md} />}
      </button>
    </div>

    <MatchPanel result={result} />

    <dl className="course-figures">
      <div><dt>Tuition</dt><dd>{fee != null ? `£${fee.toLocaleString('en-GB')}` : 'Not stated'}</dd></div>
      <div><dt>Length</dt><dd>{course.durations[0] ?? 'Not stated'}</dd></div>
      <div><dt>Starts</dt><dd>{course.intake_months[0] ?? 'Not stated'}</dd></div>
      <div><dt>Award</dt><dd>{course.award ?? 'Not stated'}</dd></div>
    </dl>
  </article>
}
