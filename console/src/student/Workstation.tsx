import { ArrowRight, Bookmark, Coins, GraduationCap } from 'lucide-react'
import type { GalleryCourse } from '../api'
import { ICON } from '../lib'
import { linkTo } from '../router'
import { modelCost } from './costs'
import { fundingPosition } from './funding'
import { matchCourse } from './match'
import { hasAnything, hasFunding, type StudentProfile } from './profile'
import { useSaved } from './saved'

/** The workstation home. Panels are a list so a later section — applications,
    documents, a planner — is an entry here rather than a restructure. */
export function Workstation({ courses, loading, profile }: {
  courses: GalleryCourse[]
  loading: boolean
  profile: StudentProfile
}) {
  const saved = useSaved()
  const mine = courses.filter((course) => saved.includes(course.id))
  const find = linkTo('/student/find')
  const money = linkTo('/student/money')
  const you = linkTo('/student/profile')

  const costed = mine.map((course) => ({ course, cost: modelCost(course, { flights: profile.flights ?? undefined }) }))
  const cheapest = costed.slice().sort((a, b) => a.cost.total - b.cost.total)[0]
  const position = cheapest
    ? fundingPosition(profile.funding, cheapest.cost.total)
    : null

  return <div className="workstation">
    <p className="ws-lead">Everything you have saved, checked and worked out, in one place.</p>

    <div className="ws-panels">
      <section className="ws-panel">
        <header>
          <span className="ws-icon" aria-hidden="true"><Bookmark size={ICON.sm} /></span>
          <h2>Courses you saved</h2>
        </header>
        {loading
          ? <p className="ws-quiet">Loading…</p>
          : mine.length === 0
            ? <>
                <p className="ws-quiet">Nothing saved yet. Save a course and it becomes the start of a plan.</p>
                <a className="student-button" {...find}>Find courses <ArrowRight size={ICON.xs} aria-hidden="true" /></a>
              </>
            : <>
                <p className="ws-figure">{mine.length}</p>
                <ul className="ws-list">
                  {mine.slice(0, 3).map((course) => {
                    const result = matchCourse(course, profile)
                    const unmet = result.checks.filter((check) => check.verdict === 'unmet').length
                    return <li key={course.id}>
                      <strong>{course.title}</strong>
                      <span>{unmet === 0 ? 'Nothing blocking you' : `${unmet} requirement${unmet === 1 ? '' : 's'} to sort out`}</span>
                    </li>
                  })}
                </ul>
                {mine.length > 3 && <a className="student-link" {...linkTo('/student/saved')}>See all {mine.length}</a>}
              </>}
      </section>

      <section className="ws-panel">
        <header>
          <span className="ws-icon" aria-hidden="true"><Coins size={ICON.sm} /></span>
          <h2>Money</h2>
        </header>
        {!cheapest
          ? <p className="ws-quiet">Save a course and this works out what it costs across the whole degree, not just year one.</p>
          : !hasFunding(profile)
            ? <>
                <p className="ws-quiet">
                  Your cheapest saved course comes to <strong>£{cheapest.cost.total.toLocaleString('en-GB')}</strong> over
                  {' '}{cheapest.cost.years === 1 ? 'one year' : `${cheapest.cost.years} years`}.
                </p>
                <a className="student-button" {...money}>Work out what you can cover</a>
              </>
            : <>
                <p className={`ws-figure ${position!.covered ? 'good' : 'short'}`}>
                  {position!.covered
                    ? 'Covered'
                    : `£${position!.gap.toLocaleString('en-GB')} short`}
                </p>
                <p className="ws-quiet">
                  On {cheapest.course.title}, over {cheapest.cost.years === 1 ? 'one year' : `${cheapest.cost.years} years`}.
                </p>
                <a className="student-link" {...money}>See the breakdown</a>
              </>}
      </section>

      <section className="ws-panel">
        <header>
          <span className="ws-icon" aria-hidden="true"><GraduationCap size={ICON.sm} /></span>
          <h2>Your details</h2>
        </header>
        {hasAnything(profile)
          ? <>
              <p className="ws-quiet">Courses are being checked against what you told us. Keep it current as your scores change.</p>
              <a className="student-link" {...you}>Edit your details</a>
            </>
          : <>
              <p className="ws-quiet">Add your grades, English scores and budget, and every course will tell you where you stand.</p>
              <a className="student-button" {...you}>Add your details</a>
            </>}
      </section>
    </div>
  </div>
}
