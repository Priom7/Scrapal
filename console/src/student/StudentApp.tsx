import { Bookmark, Coins, FileText, GraduationCap, LayoutGrid, MessagesSquare, Search, ShieldQuestion } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type GalleryCourse } from '../api'
import { match, useLocation } from '../router'
import { CheckPage } from './CheckPage'
import { CoursePage } from './CoursePage'
import { FindCourses } from './FindCourses'
import { MoneyPage } from './MoneyPage'
import { ProfilePage } from './ProfilePage'
import { ApplicationsPage } from './apply/ApplicationsPage'
import { Planner } from './planner/Planner'
import { StudentShell, type ShellSection } from './StudentShell'
import { Workstation } from './Workstation'
import { EMPTY_PROFILE, loadProfile, saveProfile, type StudentProfile } from './profile'

type ViewContext = {
  courses: GalleryCourse[]
  loading: boolean
  error?: string
  profile: StudentProfile
  setProfile: (profile: StudentProfile) => void
  params: Record<string, string>
}

/** Routes are a table so a later section — applications, documents, a planner —
    is an entry here rather than another branch in a conditional. `nav` marks
    the ones that appear in the header. */
const ROUTES: {
  path: string
  nav?: string
  icon?: ShellSection['icon']
  tag?: string
  /** A function where the title depends on what is being shown. */
  title: string | ((context: ViewContext) => string)
  /** The page supplies its own h1; the topbar must not repeat it. */
  ownTitle?: boolean
  render: (context: ViewContext) => ReactNode
}[] = [
  {
    path: '/student',
    nav: 'Plan',
    icon: MessagesSquare,
    tag: 'Premium',
    title: 'Plan your study',
    render: ({ courses, loading, profile, setProfile }) => (
      <Planner courses={courses} loading={loading} profile={profile} onProfile={setProfile} />
    ),
  },
  {
    path: '/student/workspace',
    nav: 'Workspace',
    icon: LayoutGrid,
    title: 'Your workspace',
    render: ({ courses, loading, profile }) => <Workstation courses={courses} loading={loading} profile={profile} />,
  },
  {
    path: '/student/find',
    nav: 'Find courses',
    icon: Search,
    title: 'Find a course you can actually get into',
    render: ({ courses, loading, error, profile }) => (
      <FindCourses courses={courses} loading={loading} error={error} profile={profile} savedOnly={false} />
    ),
  },
  {
    path: '/student/applications',
    nav: 'Applications',
    icon: FileText,
    title: 'Your applications',
    render: ({ courses, loading, profile }) => (
      <ApplicationsPage courses={courses} loading={loading} profile={profile} />
    ),
  },
  {
    path: '/student/money',
    nav: 'Money',
    icon: Coins,
    title: 'What it really costs',
    render: ({ courses, loading, profile, setProfile }) => (
      <MoneyPage courses={courses} loading={loading} profile={profile} onChange={setProfile} />
    ),
  },
  {
    path: '/student/check',
    nav: 'Check a claim',
    icon: ShieldQuestion,
    title: 'Check what you were told',
    render: () => <CheckPage />,
  },
  {
    path: '/student/saved',
    nav: 'Saved',
    icon: Bookmark,
    title: 'Courses you saved',
    render: ({ courses, loading, error, profile }) => (
      <FindCourses courses={courses} loading={loading} error={error} profile={profile} savedOnly />
    ),
  },
  {
    path: '/student/profile',
    nav: 'Your details',
    icon: GraduationCap,
    title: 'Your details',
    render: ({ profile, setProfile }) => <ProfilePage profile={profile} onChange={setProfile} />,
  },
  {
    path: '/student/courses/:id',
    ownTitle: true,
    title: ({ courses, params }) => {
      const course = courses.find((item) => item.id === params.id)
      return course ? `${course.institution.name}${course.institution.city ? `, ${course.institution.city}` : ''}` : 'Course'
    },
    render: ({ courses, loading, profile, params }) => (
      <CoursePage id={params.id} courses={courses} loading={loading} profile={profile} />
    ),
  },
]

export function StudentApp() {
  const path = useLocation()
  const [profile, setProfileState] = useState<StudentProfile>(EMPTY_PROFILE)

  // Read once on mount rather than during render, so the first paint is the
  // same on a fresh browser as on a returning one.
  useEffect(() => { setProfileState(loadProfile()) }, [])

  const setProfile = (next: StudentProfile) => {
    setProfileState(next)
    saveProfile(next)
  }

  const courses = useQuery({
    queryKey: ['student', 'courses'],
    queryFn: () => api.galleryCourses({ sort: 'coverage' }),
  })
  const items = useMemo(() => courses.data?.items ?? [], [courses.data])

  const active = ROUTES.map((route) => ({ route, params: match(route.path, path) }))
    .find((candidate) => candidate.params !== null)

  const context: ViewContext = {
    courses: items,
    loading: courses.isLoading,
    error: courses.error?.message,
    profile,
    setProfile,
    params: active?.params ?? {},
  }

  const sections: ShellSection[] = ROUTES
    .filter((route) => route.nav && route.icon)
    .map((route) => ({ path: route.path, label: route.nav!, icon: route.icon!, tag: route.tag }))

  return <StudentShell sections={sections} current={path} title={resolveTitle(active?.route.title, context)} ownTitle={active?.route.ownTitle}>
    {active
      ? active.route.render(context)
      : <div className="student-empty">
          <h2>That page does not exist</h2>
          <p>The link may be out of date. Everything you have saved is still in your workspace.</p>
        </div>}
    <p className="student-foot-note">
      Figures marked as read from a university link back to the page they came from. Living costs,
      visa charges and money rules are reference figures, shown with the date they were checked.
    </p>
  </StudentShell>
}

function resolveTitle(
  title: string | ((context: ViewContext) => string) | undefined,
  context: ViewContext,
): string {
  if (!title) return 'Not found'
  return typeof title === 'function' ? title(context) : title
}
