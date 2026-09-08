// Everything the student kept, in one place.
//
// Courses, researchers and funding calls were saved from three different pages
// and there was nowhere that showed all three together. Splitting them by tab
// rather than mixing them keeps each list readable, and the counts are on the
// tabs so an empty section is visible without opening it.
import { useQuery } from '@tanstack/react-query'
import { Banknote, Bookmark, GraduationCap, Users } from 'lucide-react'
import { useState } from 'react'
import { api, type GalleryCourse } from '../api'
import { EmptyState, Loading } from '../brand'
import { ICON } from '../lib'
import { navigate } from '../router'
import { FindCourses } from './FindCourses'
import type { StudentProfile } from './profile'
import { FundingCard } from './radar/FundingCard'
import { PersonCard } from './radar/PersonCard'
import { useSavedOf } from './saved'
import { TabList, TabPanel } from './Tabs'

type Tab = 'courses' | 'researchers' | 'funding'

export function SavedPage({ courses, loading, error, profile }: {
  courses: GalleryCourse[]
  loading: boolean
  error?: string
  profile: StudentProfile
}) {
  const savedCourses = useSavedOf('course')
  const savedPeople = useSavedOf('researcher')
  const savedFunding = useSavedOf('funding')
  const [tab, setTab] = useState<Tab>('courses')

  const counts: Record<Tab, number> = {
    courses: savedCourses.length,
    researchers: savedPeople.length,
    funding: savedFunding.length,
  }
  const total = counts.courses + counts.researchers + counts.funding

  if (total === 0) {
    return <EmptyState
      icon={<Bookmark size={ICON.xl} aria-hidden="true" />}
      title="Nothing saved yet"
      actions={<>
        <button type="button" className="student-button primary" onClick={() => navigate('/student/find')}>
          Find courses
        </button>
        <button type="button" className="student-button" onClick={() => navigate('/student/people')}>
          Find researchers
        </button>
      </>}
    >
      Save a course, a researcher or a funding call and it will be kept here on this device — so a
      supervisor you found once is still there next week.
    </EmptyState>
  }

  return <div className="saved-page">
    <TabList
      label="What you have saved"
      active={tab}
      onChange={setTab}
      tabs={[
        { id: 'courses' as const, label: <><GraduationCap size={ICON.sm} aria-hidden="true" /> Courses</>, badge: counts.courses },
        { id: 'researchers' as const, label: <><Users size={ICON.sm} aria-hidden="true" /> Researchers</>, badge: counts.researchers },
        { id: 'funding' as const, label: <><Banknote size={ICON.sm} aria-hidden="true" /> Funding</>, badge: counts.funding },
      ]}
    />

    <TabPanel id="courses" active={tab === 'courses'}>
      {counts.courses === 0
        ? <Nothing what="courses" where="/student/find" label="Find courses" />
        : <FindCourses courses={courses} loading={loading} error={error} profile={profile} savedOnly />}
    </TabPanel>

    <TabPanel id="researchers" active={tab === 'researchers'}>
      {counts.researchers === 0
        ? <Nothing what="researchers" where="/student/people" label="Find researchers" />
        : <SavedPeople ids={savedPeople} />}
    </TabPanel>

    <TabPanel id="funding" active={tab === 'funding'}>
      {counts.funding === 0
        ? <Nothing what="funding calls" where="/student/funding" label="Browse funding" />
        : <SavedFunding ids={savedFunding} />}
    </TabPanel>
  </div>
}

function Nothing({ what, where, label }: { what: string; where: string; label: string }) {
  return <EmptyState title={`No ${what} saved`} actions={
    <button type="button" className="student-button primary" onClick={() => navigate(where)}>{label}</button>
  }>
    Anything you save here stays on this device.
  </EmptyState>
}

function SavedPeople({ ids }: { ids: string[] }) {
  // Asked for by id rather than fetched whole and filtered, so this keeps
  // working when the directory is larger than a page.
  const query = useQuery({
    queryKey: ['saved-researchers', ids],
    queryFn: () => api.researchers({ ids }),
  })
  if (query.isLoading) return <Loading>Fetching the people you kept…</Loading>
  if (!query.data) return null
  return <div className="radar-results">
    {query.data.items.map((person) => <PersonCard key={person.id} person={person} />)}
  </div>
}

function SavedFunding({ ids }: { ids: string[] }) {
  const query = useQuery({
    queryKey: ['saved-funding', ids],
    // Soonest deadline first: the reason to keep a call is to act on it in time.
    queryFn: () => api.funding({ ids, sort: 'deadline' }),
  })
  if (query.isLoading) return <Loading>Fetching the calls you kept…</Loading>
  if (!query.data) return null
  return <div className="radar-results">
    {query.data.items.map((call) => <FundingCard key={call.id} call={call} />)}
  </div>
}
