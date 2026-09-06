import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Banknote, Bookmark, BookmarkCheck, FileText, Layers, Search, Share2, Sparkles, X,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { api, type GalleryCourse, type GalleryFacets } from '../api'
import { ICON } from '../lib'
import { linkTo, navigate } from '../router'
import { useToast } from '../toast'
import { SafeImage } from './Avatar'
import { copyText } from './clipboard'
import { OverflowMenu } from './OverflowMenu'
import { FilterOptions, FilterPopover } from './CourseFilters'
import { useDismiss } from './useDismiss'
import { MatchScore } from './MatchPanel'
import { matchCourse, matchRank } from './match'
import { describeProfile, hasAnything, type StudentProfile } from './profile'
import { startApplication } from './apply/store'
import { isSaved, toggleSaved, useSaved } from './saved'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const COUNTRY_NAMES: Record<string, string> = { GB: 'United Kingdom', IE: 'Ireland', NZ: 'New Zealand' }

type Filters = {
  q: string
  level?: string
  countries: string[]
  institutionIds: string[]
  studyModes: string[]
  intakeMonths: string[]
  durations: string[]
  feeMax?: number
}

const EMPTY: Filters = {
  q: '', level: undefined, countries: [], institutionIds: [],
  studyModes: [], intakeMonths: [], durations: [],
}

export function FindCourses({ courses, loading, error, profile, savedOnly }: {
  courses: GalleryCourse[]
  loading: boolean
  error?: string
  profile: StudentProfile
  savedOnly: boolean
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [brief, setBrief] = useState('')
  const [plan, setPlan] = useState<string>()
  const [open, setOpen] = useState<string>()
  const saved = useSaved()
  const notify = useToast()
  const barRef = useDismiss(() => setOpen(undefined), Boolean(open))

  const facets = useQuery({
    queryKey: ['student', 'facets'],
    queryFn: () => api.galleryFacets({}),
  })

  // The same natural-language search the operator gallery uses: a student can
  // describe what they want rather than working the filters themselves.
  const interpret = useMutation({
    mutationFn: api.interpretGalleryQuery,
    onSuccess: (result) => {
      const read = result.filters
      setFilters({
        q: read.q ?? '',
        level: read.level ?? undefined,
        countries: read.countries,
        institutionIds: read.institution_ids,
        studyModes: read.study_modes,
        intakeMonths: read.intake_months,
        durations: read.durations,
        feeMax: read.fee_max ?? undefined,
      })
      setPlan(read.explanation)
    },
    onError: (err: Error) => notify({ tone: 'error', title: 'Could not read that', detail: err.message }),
  })

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }))
  const toggle = (key: 'countries' | 'institutionIds' | 'studyModes' | 'intakeMonths' | 'durations', value: string) =>
    setFilters((current) => ({
      ...current,
      [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value],
    }))

  const institutionName = useMemo(
    () => new Map(courses.map((course) => [course.institution_id, course.institution.name])),
    [courses],
  )

  const results = useMemo(() => {
    const text = filters.q.trim().toLowerCase()
    const hits = (list: string[], values: string[]) => !list.length || list.some((item) => values.includes(item))
    return courses
      .filter((course) => !savedOnly || saved.includes(course.id))
      .filter((course) => !filters.level || course.level === filters.level)
      .filter((course) => !filters.countries.length || filters.countries.includes(course.institution.country_code ?? ''))
      .filter((course) => !filters.institutionIds.length || filters.institutionIds.includes(course.institution_id))
      .filter((course) => hits(filters.studyModes, course.study_modes))
      .filter((course) => hits(filters.intakeMonths, course.intake_months))
      .filter((course) => hits(filters.durations, course.durations))
      .filter((course) => {
        if (filters.feeMax == null) return true
        const fee = course.fees.find((item) => item.residency === 'international')?.amount
        return fee != null && fee <= filters.feeMax
      })
      .filter((course) => !text
        || `${course.title} ${course.institution.name} ${course.award ?? ''}`.toLowerCase().includes(text))
      .map((course) => ({ course, result: matchCourse(course, profile) }))
      .sort((a, b) => matchRank(a.result) - matchRank(b.result))
  }, [courses, filters, savedOnly, saved, profile])

  const countries = facets.data?.country ?? []
  const active = countActive(filters)

  return <div className="gallery student-gallery">
    {!savedOnly && (
      <header className="gallery-masthead">
        <form
          className="ask-bar"
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            if (brief.trim().length > 2) interpret.mutate(brief.trim())
          }}
        >
          <Sparkles aria-hidden="true" />
          <input
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            placeholder="Describe the course you want"
            aria-label="Describe the course you want, in your own words"
          />
          <button className="button primary" disabled={interpret.isPending || brief.trim().length < 3}>
            {interpret.isPending ? 'Reading…' : 'Search'}
          </button>
        </form>
        <p className="ask-note">
          Tell me what you are after in your own words, and I will set the filters for you.
        </p>

        {!brief && !active && (
          <div className="ask-tries">
            <span>Try</span>
            {['One-year master’s in London under £22,000',
              'Postgraduate courses with a January intake',
              'Part-time engineering degrees'].map((example) => (
              <button key={example} type="button" onClick={() => { setBrief(example); interpret.mutate(example) }}>
                {example}
              </button>
            ))}
          </div>
        )}

        {plan && !interpret.isPending && (
          <div className="plan-strip">
            <p><strong>Read as</strong>{plan}</p>
            <button type="button" onClick={() => setPlan(undefined)} aria-label="Dismiss"><X /></button>
          </div>
        )}

        <div className="country-rail" role="group" aria-label="Filter by country">
          <button type="button" aria-pressed={!filters.countries.length} onClick={() => set('countries', [])}>
            <Layers aria-hidden="true" />
            <span className="name">Anywhere</span>
            <span className="tally">{courses.length}</span>
          </button>
          {countries.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filters.countries.includes(item.value)}
              onClick={() => toggle('countries', item.value)}
            >
              <span className="name">{COUNTRY_NAMES[item.value] ?? item.value}</span>
              <span className="tally">{item.count}</span>
            </button>
          ))}
        </div>
      </header>
    )}

    {!savedOnly && (
      <div className="filter-bar" ref={barRef}>
        <div className="filter-scroll">
          <label className="filter-search">
            <Search aria-hidden="true" />
            <input
              value={filters.q}
              onChange={(event) => set('q', event.target.value)}
              placeholder="Course or subject"
              aria-label="Search course title"
            />
          </label>

          <div className="segmented-control" role="group" aria-label="Study level">
            <button type="button" aria-pressed={!filters.level} onClick={() => set('level', undefined)}>All levels</button>
            {['Undergraduate', 'Postgraduate'].map((level) => (
              <button key={level} type="button" aria-pressed={filters.level === level} onClick={() => set('level', level)}>
                {level}
              </button>
            ))}
          </div>

          <Facet
            id="institution" label="University" facet={facets.data?.institution}
            selected={filters.institutionIds} open={open} setOpen={setOpen}
            onToggle={(value) => toggle('institutionIds', value)}
            onClear={() => set('institutionIds', [])}
            label2={(value) => institutionName.get(value) ?? value}
          />
          <Facet
            id="mode" label="Study mode" facet={facets.data?.study_mode}
            selected={filters.studyModes} open={open} setOpen={setOpen}
            onToggle={(value) => toggle('studyModes', value)} onClear={() => set('studyModes', [])}
          />
          <Facet
            id="duration" label="Length" facet={facets.data?.duration}
            selected={filters.durations} open={open} setOpen={setOpen}
            onToggle={(value) => toggle('durations', value)} onClear={() => set('durations', [])}
          />
          <Facet
            id="intake" label="Starts" facet={sortMonths(facets.data?.intake_month)}
            selected={filters.intakeMonths} open={open} setOpen={setOpen}
            onToggle={(value) => toggle('intakeMonths', value)} onClear={() => set('intakeMonths', [])}
          />
          {facets.data?.fee.max != null && (
            <FilterPopover
              id="fee" label="Tuition" count={filters.feeMax != null ? 1 : 0}
              open={open} setOpen={setOpen} onClear={() => set('feeMax', undefined)}
            >
              <FeeCeiling
                min={facets.data.fee.min ?? 0}
                max={facets.data.fee.max}
                value={filters.feeMax}
                onChange={(value) => set('feeMax', value)}
              />
            </FilterPopover>
          )}
        </div>
      </div>
    )}

    <ProfileStrip profile={profile} profiled={hasAnything(profile)} />

    {error && <p className="inline-error">{error}</p>}

    <div className="gallery-resultline">
      <h2>
        <span className="figure">{results.length}</span> course{results.length === 1 ? '' : 's'}
        {hasAnything(profile) && results.length > 0 && <>, closest match first</>}
      </h2>
      {active > 0 && (
        <button type="button" className="student-link" onClick={() => { setFilters(EMPTY); setPlan(undefined); setBrief('') }}>
          Clear filters
        </button>
      )}
    </div>

    {loading && <p className="find-count">Loading courses…</p>}

    {!loading && results.length === 0 && (
      <div className="student-empty">
        <h2>{savedOnly ? 'Nothing saved yet' : 'Nothing matches all of that'}</h2>
        <p>
          {savedOnly
            ? 'Save a course and it will wait here for you to compare later.'
            : 'Nothing is hidden from you — widening never removes a course you could get into.'}
        </p>
        {/* Naming the filters that are excluding everything beats telling
            someone to "drop a filter" and leaving them to work out which. */}
        {!savedOnly && active > 0 && (
          <div className="relax-row">
            <span>Try without</span>
            {describeActive(filters, institutionName).map((item) => (
              <button key={item.label} type="button" onClick={() => setFilters(item.without)}>
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )}

    <div className="dossier-grid">
      {results.map(({ course, result }) => (
        <CourseCard
          key={course.id}
          course={course}
          result={result}
          saved={isSaved(saved, course.id)}
          onSave={() => {
            const now = toggleSaved(course.id)
            notify({
              key: `saved-${course.id}`,
              tone: now ? 'success' : 'info',
              title: now ? 'Saved' : 'Removed from saved',
              detail: course.title,
              onUndo: () => toggleSaved(course.id),
            })
          }}
          notify={notify}
        />
      ))}
    </div>
  </div>
}

/** Each active filter, with the state that results from removing it. */
function describeActive(filters: Filters, names: Map<string, string>) {
  const out: { label: string; without: Filters }[] = []
  if (filters.feeMax != null) {
    out.push({ label: `tuition under £${filters.feeMax.toLocaleString('en-GB')}`, without: { ...filters, feeMax: undefined } })
  }
  if (filters.level) out.push({ label: filters.level.toLowerCase(), without: { ...filters, level: undefined } })
  filters.countries.forEach((code) => out.push({
    label: COUNTRY_NAMES[code] ?? code,
    without: { ...filters, countries: filters.countries.filter((item) => item !== code) },
  }))
  filters.institutionIds.forEach((value) => out.push({
    label: names.get(value) ?? value,
    without: { ...filters, institutionIds: filters.institutionIds.filter((item) => item !== value) },
  }))
  filters.intakeMonths.forEach((value) => out.push({
    label: `${value} start`,
    without: { ...filters, intakeMonths: filters.intakeMonths.filter((item) => item !== value) },
  }))
  filters.studyModes.forEach((value) => out.push({
    label: value.toLowerCase(),
    without: { ...filters, studyModes: filters.studyModes.filter((item) => item !== value) },
  }))
  if (filters.q) out.push({ label: `“${filters.q}”`, without: { ...filters, q: '' } })
  return out.slice(0, 4)
}

function countActive(filters: Filters): number {
  return (filters.q ? 1 : 0) + (filters.level ? 1 : 0) + (filters.feeMax != null ? 1 : 0)
    + filters.countries.length + filters.institutionIds.length
    + filters.studyModes.length + filters.intakeMonths.length + filters.durations.length
}

function sortMonths(values?: GalleryFacets['intake_month']) {
  return values ? [...values].sort((a, b) => MONTHS.indexOf(a.value) - MONTHS.indexOf(b.value)) : undefined
}

function Facet({ id, label, facet, selected, open, setOpen, onToggle, onClear, label2 }: {
  id: string
  label: string
  facet?: { value: string; count: number }[]
  selected: string[]
  open?: string
  setOpen: (id?: string) => void
  onToggle: (value: string) => void
  onClear: () => void
  label2?: (value: string) => string
}) {
  return <FilterPopover id={id} label={label} count={selected.length} open={open} setOpen={setOpen} onClear={onClear}>
    <FilterOptions values={facet ?? []} selected={selected} onToggle={onToggle} label={label2} />
  </FilterPopover>
}

function FeeCeiling({ min, max, value, onChange }: {
  min: number; max: number; value?: number; onChange: (value?: number) => void
}) {
  const ceiling = value ?? max
  return <div className="fee-range">
    <p className="fee-readout">
      Up to <strong>£{ceiling.toLocaleString('en-GB')}</strong>
      {value == null && <span> · no ceiling set</span>}
    </p>
    <input
      type="range" min={min} max={max} step={250} value={ceiling}
      aria-label="Maximum tuition"
      onChange={(event) => {
        const next = Number(event.target.value)
        onChange(next >= max ? undefined : next)
      }}
    />
    <p className="fee-bounds">
      <span>£{min.toLocaleString('en-GB')}</span><span>£{max.toLocaleString('en-GB')}+</span>
    </p>
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

/** The gallery card, with the operator's evidence meter swapped for the thing a
    student actually needs: how they match, and what is missing. */
function CourseCard({ course, result, saved, onSave, notify }: {
  course: GalleryCourse
  result: ReturnType<typeof matchCourse>
  saved: boolean
  onSave: () => void
  notify: ReturnType<typeof useToast>
}) {
  const link = linkTo(`/student/courses/${course.id}`)
  const fee = course.fees.find((item) => item.residency === 'international')?.amount
  const attention = result.checks.filter((check) => check.verdict === 'close' || check.verdict === 'unmet')

  return <article className="dossier" style={{ ['--brand' as string]: course.institution.brand_color ?? undefined }}>
    <i className="spine" aria-hidden="true" />
    <SafeImage
      className="dossier-photo"
      src={course.image_url}
      alt=""
      fallback={<span className="dossier-photo placeholder" style={{ background: course.institution.brand_color ?? undefined }} />}
    />
    <header>
      <div className="who">
        <strong>{course.institution.name}</strong>
        <span>{course.institution.city ?? ''}</span>
      </div>
      <div className="card-actions">
        <button
          type="button"
          className={`save ${saved ? 'on' : ''}`}
          onClick={onSave}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${course.title} from saved` : `Save ${course.title}`}
        >
          {saved ? <BookmarkCheck size={ICON.sm} /> : <Bookmark size={ICON.sm} />}
        </button>
        <OverflowMenu
          label={`More options for ${course.title}`}
          items={[
            {
              label: 'Start an application',
              icon: <FileText size={ICON.sm} aria-hidden="true" />,
              onSelect: () => { startApplication(course.id); navigate('/student/applications') },
            },
            {
              label: 'Work out the full cost',
              icon: <Banknote size={ICON.sm} aria-hidden="true" />,
              onSelect: () => navigate('/student/money'),
            },
            {
              label: 'Copy link to this course',
              icon: <Share2 size={ICON.sm} aria-hidden="true" />,
              onSelect: () => copyText(
                `${window.location.origin}/student/courses/${course.id}`,
                'Link copied', course.title, notify,
              ),
            },
          ]}
        />
      </div>
    </header>

    <h3>
      <a {...link}>{course.title}</a>
      {course.award && <span className="award">{course.award}</span>}
    </h3>

    <dl className="figures">
      <div>
        <dt>Tuition</dt>
        <dd><span className="figure-value">{fee != null ? `£${fee.toLocaleString('en-GB')}` : 'Not stated'}</span></dd>
      </div>
      <div>
        <dt>Length</dt>
        <dd><span className="figure-value">{course.durations[0] ?? 'Not stated'}</span></dd>
      </div>
      <div>
        <dt>Starts</dt>
        <dd><span className="figure-value">{course.intake_months[0] ?? 'Not stated'}</span></dd>
      </div>
    </dl>

    <footer>
      <MatchScore result={result} size="small" />
      <span className="card-gap">
        {result.unprofiled
          ? 'Add your details to see where you stand'
          : attention.length === 0
            ? 'Nothing blocking you'
            : attention[0].gap || attention[0].asks}
      </span>
    </footer>
  </article>
}
