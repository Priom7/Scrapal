import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, Check, ChevronDown, ExternalLink,
  Layers, Quote, Search, ShieldCheck, Sparkles, X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import {
  useCallback, useEffect, useMemo, useReducer, useRef, useState,
  type CSSProperties, type FormEvent, type ReactNode,
} from 'react'
import { api, type GalleryCourse, type GalleryFacets, type ShortlistEntry } from './api'
import { galleryFilterReducer, initialGalleryFilters, type GalleryFilters } from './GalleryState'
import { Empty } from './ui'

/* Every figure in this view is receipted: tapping it shows the sentence on the
   university's own page it was read from. That is the one interaction the whole
   design is built around, so it lives on the card, not behind a tab. */

type FactKey = 'fees' | 'durations' | 'intake_months' | 'entry_requirements'
type Fact = { key: FactKey; label: string; value: string; stated: boolean }

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function CourseGallery({ collectionId }: { collectionId?: string }) {
  const queryClient = useQueryClient()
  const [state, dispatch] = useReducer(galleryFilterReducer, initialGalleryFilters)
  const [brief, setBrief] = useState('')
  const [plan, setPlan] = useState<{ source: 'model' | 'fallback'; explanation: string }>()
  const [opened, setOpened] = useState<GalleryCourse>()
  const [comparing, setComparing] = useState(false)

  const filters = {
    q: state.filters.q || undefined, collectionId, level: state.filters.level,
    institutionIds: state.filters.institutionIds, countries: state.filters.countries,
    intakeMonths: state.filters.intakeMonths, studyModes: state.filters.studyModes,
    durations: state.filters.durations, feeMax: state.filters.feeMax, sort: state.filters.sort,
  }
  const institutions = useQuery({
    queryKey: ['course-gallery', 'institutions', collectionId],
    queryFn: () => api.galleryInstitutions(collectionId),
  })
  const courses = useQuery({
    queryKey: ['course-gallery', 'courses', filters],
    queryFn: () => api.galleryCourses(filters),
  })
  const facets = useQuery({
    queryKey: ['course-gallery', 'facets', filters],
    queryFn: () => api.galleryFacets(filters),
  })
  const shortlist = useQuery({
    queryKey: ['course-gallery', 'shortlist'],
    queryFn: api.galleryShortlist,
  })

  const interpret = useMutation({
    mutationFn: api.interpretGalleryQuery,
    onSuccess: (result) => {
      const planned = result.filters
      dispatch({
        type: 'apply-ai',
        values: {
          q: planned.q ?? '', level: planned.level ?? undefined, countries: planned.countries,
          institutionIds: planned.institution_ids, studyModes: planned.study_modes,
          intakeMonths: planned.intake_months, durations: planned.durations,
          feeMax: planned.fee_max ?? undefined,
        },
      })
      setPlan({ source: result.source, explanation: planned.explanation })
    },
  })

  const shortlistMutation = (fn: (id: string) => Promise<unknown>, optimistic: 'add' | 'remove') =>
    ({
      mutationFn: fn,
      onMutate: async (recordId: string) => {
        await queryClient.cancelQueries({ queryKey: ['course-gallery', 'shortlist'] })
        const previous = queryClient.getQueryData<ShortlistEntry[]>(['course-gallery', 'shortlist'])
        if (optimistic === 'remove') {
          queryClient.setQueryData(['course-gallery', 'shortlist'],
            previous?.filter((entry) => entry.record_id !== recordId))
        } else {
          const course = courses.data?.items.find((item) => item.id === recordId) ?? opened
          if (course) {
            queryClient.setQueryData<ShortlistEntry[]>(['course-gallery', 'shortlist'],
              [...(previous ?? []), { id: `pending-${recordId}`, record_id: recordId, note: null, course }])
          }
        }
        return { previous }
      },
      onError: (_e: unknown, _id: string, context?: { previous?: ShortlistEntry[] }) =>
        queryClient.setQueryData(['course-gallery', 'shortlist'], context?.previous),
      onSettled: () => queryClient.invalidateQueries({ queryKey: ['course-gallery', 'shortlist'] }),
    })
  const add = useMutation(shortlistMutation(api.addGalleryShortlist, 'add'))
  const remove = useMutation(shortlistMutation(api.removeGalleryShortlist, 'remove'))

  const saved = useMemo(
    () => new Set(shortlist.data?.map((entry) => entry.record_id)),
    [shortlist.data],
  )
  const institutionName = useMemo(
    () => new Map(institutions.data?.map((item) => [item.id, item.name])),
    [institutions.data],
  )
  const toggleSave = (course: GalleryCourse) =>
    saved.has(course.id) ? remove.mutate(course.id) : add.mutate(course.id)

  const ask = (event: FormEvent) => {
    event.preventDefault()
    if (brief.trim().length > 2) interpret.mutate(brief.trim())
  }

  const tags = activeTags(state.filters, institutionName)
  const total = courses.data?.total ?? 0

  return <div className="gallery">
    <header className="gallery-masthead">
      <div className="masthead-top">
        <div>
          <h2>{total} course{total === 1 ? '' : 's'}, <em>every figure receipted</em></h2>
          <p>
            Each fee, intake and requirement below is backed by the sentence Scrapal read on
            the university&rsquo;s own page. Tap any figure to see it.
          </p>
        </div>
        <dl className="masthead-stats">
          <div><dt>Universities</dt><dd>{institutions.data?.length ?? 0}</dd></div>
          <div><dt>Evidenced</dt><dd>{averageCoverage(courses.data?.items)}</dd></div>
        </dl>
      </div>

      <form className="ask-bar" onSubmit={ask}>
        <Sparkles aria-hidden="true" />
        <input
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          placeholder="One-year master's in London under £15,000 starting September…"
          aria-label="Describe the course you want, in your own words"
        />
        <button className="button primary" disabled={interpret.isPending || brief.trim().length < 3}>
          {interpret.isPending ? 'Reading…' : 'Search'}
        </button>
      </form>

      <div className="ask-tries">
        <span>Try</span>
        {[
          "One-year master's in London under £15,000",
          'Postgraduate courses with a January intake',
          'Part-time engineering degrees',
        ].map((example) => (
          <button key={example} type="button" onClick={() => { setBrief(example); interpret.mutate(example) }}>
            {example}
          </button>
        ))}
      </div>

      {interpret.isPending && (
        <p className="plan-strip thinking"><span className="dots"><i /><i /><i /></span>
          Reading your question against the course schema…</p>
      )}
      {plan && !interpret.isPending && (
        <motion.div className="plan-strip" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
          <p>
            <strong>{plan.source === 'model' ? 'Scrapal read this as' : 'Read by keyword'}</strong>
            {plan.explanation}
          </p>
          <button type="button" onClick={() => setPlan(undefined)} aria-label="Dismiss reading"><X /></button>
        </motion.div>
      )}
      {interpret.error && <p className="inline-error">{interpret.error.message}</p>}

      <div className="country-rail" role="group" aria-label="Filter by country">
        <button
          type="button"
          aria-pressed={!state.filters.countries.length}
          onClick={() => dispatch({ type: 'clear-country' })}
        >
          <Layers aria-hidden="true" />
          <span className="name">All countries</span>
          <span className="tally">{total}</span>
        </button>
        {facets.data?.country.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={state.filters.countries.includes(item.value)}
            onClick={() => dispatch({ type: 'toggle-country', value: item.value })}
          >
            <Flag code={item.value} />
            <span className="name">{countryName(item.value)}</span>
            <span className="tally">{item.count}</span>
          </button>
        ))}
      </div>
    </header>

    <FilterBar
      state={state}
      dispatch={dispatch}
      facets={facets.data}
      courses={courses.data?.items ?? []}
      institutionName={institutionName}
    />

    <div className="gallery-tags-row">
      {tags.length > 0 && <>
        {state.aiSet.length > 0 && (
          <span className="from-ai"><i className="pip" /> Set from your question</span>
        )}
        {tags.map((tag) => (
          <span key={tag.id} className={`tag ${state.aiSet.includes(tag.field) ? 'ai' : ''}`}>
            <i>{tag.label}</i>{tag.value}
            <button type="button" onClick={() => dispatch(tag.clear)} aria-label={`Remove ${tag.value}`}>
              <X />
            </button>
          </span>
        ))}
        <button
          type="button"
          className="clear-all"
          onClick={() => { dispatch({ type: 'clear' }); setPlan(undefined); setBrief('') }}
        >
          Clear all
        </button>
      </>}
    </div>

    <div className="gallery-resultline">
      <h3>
        <span className="figure">{total}</span> published course{total === 1 ? '' : 's'}
        {institutions.data && institutions.data.length > 0 &&
          <> across <span className="figure">{institutions.data.length}</span> universit{institutions.data.length === 1 ? 'y' : 'ies'}</>}
      </h3>
      <label className="sort-picker">
        Sort
        <select
          value={state.filters.sort}
          onChange={(event) => dispatch({ type: 'set-sort', value: event.target.value as GalleryFilters['sort'] })}
        >
          <option value="coverage">Evidence coverage</option>
          <option value="updated">Recently updated</option>
          <option value="title">Course name A–Z</option>
        </select>
      </label>
    </div>

    {courses.error && <p className="inline-error">{courses.error.message}</p>}
    {courses.isLoading && <div className="dossier-grid">{[0, 1, 2, 3, 4, 5].map((n) => <SkeletonCard key={n} />)}</div>}

    {!courses.isLoading && !courses.data?.items.length && (
      <Empty
        icon={ShieldCheck}
        title="Nothing matches all of those filters"
        text="Widen the tuition band or drop a filter above. Every course Scrapal has published is still here."
      />
    )}

    <div className="dossier-grid">
      {courses.data?.items.map((course) => (
        <Dossier
          key={course.id}
          course={course}
          saved={saved.has(course.id)}
          onOpen={() => setOpened(course)}
          onSave={() => toggleSave(course)}
        />
      ))}
    </div>

    <AnimatePresence>
      {opened && (
        <CourseDossier
          course={opened}
          saved={saved.has(opened.id)}
          onClose={() => setOpened(undefined)}
          onSave={() => toggleSave(opened)}
        />
      )}
    </AnimatePresence>

    <AnimatePresence>
      {comparing && shortlist.data && (
        <Compare
          entries={shortlist.data}
          onClose={() => setComparing(false)}
          onRemove={(id) => remove.mutate(id)}
        />
      )}
    </AnimatePresence>

    <AnimatePresence>
      {(shortlist.data?.length ?? 0) > 0 && !opened && (
        <motion.div
          className="shortlist-tray"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          role="status"
        >
          <div className="crest-stack">
            {shortlist.data?.slice(0, 4).map((entry) => (
              <span key={entry.record_id} style={brandVar(entry.course)}>
                {initials(entry.course.institution.name)}
              </span>
            ))}
          </div>
          <div className="tray-copy">
            <strong>{shortlist.data?.length} shortlisted</strong>
            <span>{feeRange(shortlist.data ?? [])}</span>
          </div>
          <button type="button" className="button" onClick={() => setComparing(true)}>Compare</button>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
}

/* ---------------------------------------------------------------- filter bar */

function FilterBar({ state, dispatch, facets, courses, institutionName }: {
  state: ReturnType<typeof galleryFilterReducer>
  dispatch: (action: Parameters<typeof galleryFilterReducer>[1]) => void
  facets?: GalleryFacets
  courses: GalleryCourse[]
  institutionName: Map<string, string>
}) {
  const [open, setOpen] = useState<string>()
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const dismiss = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpen(undefined)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(undefined) }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const levels = facets?.level ?? []
  return <div className="filter-bar" ref={barRef}>
    <div className="filter-scroll">
      <label className="filter-search">
        <Search aria-hidden="true" />
        <input
          value={state.filters.q}
          onChange={(event) => dispatch({ type: 'set-query', value: event.target.value })}
          placeholder="Course or subject"
          aria-label="Search course title"
        />
      </label>

      {levels.length > 0 && (
        <div className="segmented-control" role="group" aria-label="Study level">
          <button
            type="button"
            aria-pressed={!state.filters.level}
            onClick={() => dispatch({ type: 'set-level', value: undefined })}
          >All levels</button>
          {levels.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={state.filters.level === item.value}
              onClick={() => dispatch({ type: 'set-level', value: item.value })}
            >{sentence(item.value)}</button>
          ))}
        </div>
      )}

      <Popover
        id="institution" label="University" open={open} setOpen={setOpen}
        count={state.filters.institutionIds.length}
        onClear={() => state.filters.institutionIds.forEach((value) => dispatch({ type: 'toggle-institution', value }))}
      >
        <Options
          values={facets?.institution ?? []}
          selected={state.filters.institutionIds}
          label={(value) => institutionName.get(value) ?? value}
          onToggle={(value) => dispatch({ type: 'toggle-institution', value })}
        />
      </Popover>

      <Popover
        id="mode" label="Study mode" open={open} setOpen={setOpen}
        count={state.filters.studyModes.length}
        onClear={() => state.filters.studyModes.forEach((value) => dispatch({ type: 'toggle-study-mode', value }))}
      >
        <Options
          values={facets?.study_mode ?? []}
          selected={state.filters.studyModes}
          onToggle={(value) => dispatch({ type: 'toggle-study-mode', value })}
        />
      </Popover>

      <Popover
        id="duration" label="Duration" open={open} setOpen={setOpen}
        count={state.filters.durations.length}
        onClear={() => state.filters.durations.forEach((value) => dispatch({ type: 'toggle-duration', value }))}
      >
        <Options
          values={facets?.duration ?? []}
          selected={state.filters.durations}
          onToggle={(value) => dispatch({ type: 'toggle-duration', value })}
        />
      </Popover>

      <Popover
        id="intake" label="Intake" open={open} setOpen={setOpen}
        count={state.filters.intakeMonths.length}
        onClear={() => state.filters.intakeMonths.forEach((value) => dispatch({ type: 'toggle-intake', value }))}
      >
        <Options
          values={[...(facets?.intake_month ?? [])].sort(
            (a, b) => MONTHS.indexOf(a.value) - MONTHS.indexOf(b.value),
          )}
          selected={state.filters.intakeMonths}
          onToggle={(value) => dispatch({ type: 'toggle-intake', value })}
        />
      </Popover>

      {facets?.fee.max != null && (
        <Popover
          id="fee" label="Tuition" open={open} setOpen={setOpen}
          count={state.filters.feeMax != null ? 1 : 0}
          onClear={() => dispatch({ type: 'set-fee-max', value: undefined })}
        >
          <FeeRange
            min={facets.fee.min ?? 0}
            max={facets.fee.max}
            value={state.filters.feeMax}
            courses={courses}
            onChange={(value) => dispatch({ type: 'set-fee-max', value })}
          />
        </Popover>
      )}
    </div>
  </div>
}

function Popover({ id, label, count, open, setOpen, onClear, children }: {
  id: string; label: string; count: number
  open?: string; setOpen: (id?: string) => void
  onClear: () => void; children: ReactNode
}) {
  const isOpen = open === id
  return <div className="filter-group">
    <button
      type="button"
      className={`filter-button ${count > 0 ? 'set' : ''}`}
      aria-expanded={isOpen}
      onClick={() => setOpen(isOpen ? undefined : id)}
    >
      {count > 0 && <span className="tally">{count}</span>}
      {label}
      <ChevronDown aria-hidden="true" />
    </button>
    {isOpen && (
      <motion.div
        className="filter-pop"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: .12 }}
      >
        <header>
          <h4>{label}</h4>
          {count > 0 && <button type="button" onClick={onClear}>Clear</button>}
        </header>
        <div className="filter-pop-body">{children}</div>
        <footer><button type="button" onClick={() => setOpen(undefined)}>Done</button></footer>
      </motion.div>
    )}
  </div>
}

function Options({ values, selected, onToggle, label = sentence }: {
  values: { value: string; count: number }[]
  selected: string[]
  onToggle: (value: string) => void
  label?: (value: string) => string
}) {
  if (!values.length) return <p className="filter-empty">Nothing to filter on yet.</p>
  return <>{values.map((item) => (
    <button
      key={item.value}
      type="button"
      className="option"
      aria-pressed={selected.includes(item.value)}
      onClick={() => onToggle(item.value)}
    >
      <span className="box"><Check aria-hidden="true" /></span>
      <span className="label">{label(item.value)}</span>
      <span className="n">{item.count}</span>
    </button>
  ))}</>
}

/** A single-ended ceiling, because that is what the API filters on. The histogram
    behind it shows where the fees actually sit, so the number means something. */
function FeeRange({ min, max, value, courses, onChange }: {
  min: number; max: number; value?: number; courses: GalleryCourse[]
  onChange: (value?: number) => void
}) {
  const ceiling = value ?? max
  const buckets = useMemo(() => {
    const counts = new Array(16).fill(0)
    courses.forEach((course) => {
      const amount = course.fees.find((fee) => fee.amount != null)?.amount
      if (amount == null || max === min) return
      counts[Math.min(15, Math.floor(((amount - min) / (max - min)) * 16))] += 1
    })
    return counts
  }, [courses, min, max])
  const peak = Math.max(1, ...buckets)

  return <div className="fee-range">
    <p className="fee-readout">
      Up to <strong>{money(ceiling)}</strong>
      {value == null && <span> · no ceiling set</span>}
    </p>
    <div className="fee-histogram" aria-hidden="true">
      {buckets.map((count, index) => (
        <i
          key={index}
          className={min + ((index + 1) / 16) * (max - min) <= ceiling ? 'in' : ''}
          style={{ height: `${Math.max(6, (count / peak) * 100)}%` }}
        />
      ))}
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={250}
      value={ceiling}
      aria-label="Maximum tuition"
      onChange={(event) => {
        const next = Number(event.target.value)
        onChange(next >= max ? undefined : next)
      }}
    />
    <p className="fee-bounds"><span>{money(min)}</span><span>{money(max)}+</span></p>
  </div>
}

/* -------------------------------------------------------------- dossier card */

function Dossier({ course, saved, onOpen, onSave }: {
  course: GalleryCourse; saved: boolean; onOpen: () => void; onSave: () => void
}) {
  const [receipt, setReceipt] = useState<FactKey>()
  const facts = factsFor(course)
  const shown = receipt ? evidenceFor(course, receipt) : undefined

  return <article className="dossier" style={brandVar(course)}>
    <i className="spine" aria-hidden="true" />
    <header>
      <Crest course={course} />
      <div className="who">
        <strong>{course.institution.name}</strong>
        <span>
          <Flag code={course.institution.country_code} />
          {course.institution.city ?? countryName(course.institution.country_code)}
        </span>
      </div>
      <button
        type="button"
        className={`save ${saved ? 'on' : ''}`}
        onClick={onSave}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${course.title} from shortlist` : `Shortlist ${course.title}`}
      >
        {saved ? <BookmarkCheck /> : <Bookmark />}
      </button>
    </header>

    <div className="dossier-body">
      {course.award && <p className="award">{course.award}</p>}
      <h3>{course.title}</h3>
      {course.course_content && <p className="blurb">{course.course_content}</p>}

      <div className="facts">
        {facts.map((fact) => (
          <button
            key={fact.key}
            type="button"
            className="fact"
            disabled={!fact.stated}
            aria-expanded={receipt === fact.key}
            onClick={() => setReceipt(receipt === fact.key ? undefined : fact.key)}
          >
            <span className="k"><Pip course={course} field={fact.key} stated={fact.stated} />{fact.label}</span>
            <span className={`v ${fact.stated ? '' : 'dim'}`}>{fact.value}</span>
          </button>
        ))}
        <AnimatePresence>
          {shown && (
            <motion.div
              className="receipt"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: .15 }}
            >
              <blockquote><Quote aria-hidden="true" />{shown.excerpt}</blockquote>
              <p className="source">Read from <code>{hostOf(shown.source_url ?? course.source_url)}</code>
                {shown.section && <> · {shown.section}</>}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>

    <footer>
      <span className="coverage">
        <span className={`bar ${course.coverage < 1 ? 'part' : ''}`}>
          <i style={{ width: `${Math.round(course.coverage * 100)}%` }} />
        </span>
        {Math.round(course.coverage * 100)}% evidenced
      </span>
      <button type="button" className="open-dossier" onClick={onOpen}>
        Open dossier <ArrowRight aria-hidden="true" />
      </button>
    </footer>
  </article>
}

function SkeletonCard() {
  return <div className="dossier skeleton" aria-hidden="true">
    <i className="spine" />
    <header><span className="block crest" /><span className="block line" /></header>
    <div className="dossier-body">
      <span className="block line short" />
      <span className="block line tall" />
      <span className="block grid" />
    </div>
  </div>
}

/* ------------------------------------------------------------ course dossier */

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'fees', label: 'Fees' },
  { id: 'dates', label: 'Dates' },
  { id: 'entry', label: 'Entry requirements' },
  { id: 'modules', label: 'Modules' },
  { id: 'evidence', label: 'Evidence' },
]

function CourseDossier({ course, saved, onClose, onSave }: {
  course: GalleryCourse; saved: boolean; onClose: () => void; onSave: () => void
}) {
  const [here, setHere] = useState('overview')
  const [receipt, setReceipt] = useState<string>()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [onClose])

  const jump = useCallback((id: string) => {
    scrollRef.current?.querySelector(`#dossier-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const spy = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) setHere(entry.target.id.replace('dossier-', ''))
      }),
      { root, rootMargin: '-10% 0px -70% 0px' },
    )
    root.querySelectorAll('section[id]').forEach((node) => spy.observe(node))
    return () => spy.disconnect()
  }, [])

  const key = keyFacts(course)
  const ledger = Object.entries(course.evidence?.fields ?? {})

  return <>
    <motion.button
      className="dossier-backdrop"
      onClick={onClose}
      aria-label="Close course dossier"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    />
    <motion.section
      className="dossier-sheet"
      role="dialog" aria-modal="true" aria-labelledby="dossier-title"
      style={brandVar(course)}
      initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 28 }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
    >
      <div
        className="dossier-banner"
        style={course.institution.banner_url
          ? { backgroundImage: `linear-gradient(180deg, rgba(9,15,26,.35), rgba(9,15,26,.9)), url(${course.institution.banner_url})` }
          : undefined}
      >
        <button type="button" className="dossier-back" onClick={onClose}>
          <ArrowLeft aria-hidden="true" /> All courses
        </button>
        <div className="banner-id">
          <Crest course={course} />
          <div>
            <strong>{course.institution.name}</strong>
            <span>
              <Flag code={course.institution.country_code} />
              {[course.campuses[0], countryName(course.institution.country_code)].filter(Boolean).join(' · ')}
            </span>
          </div>
        </div>
        <h2 id="dossier-title">{course.title}</h2>
        <div className="banner-chips">
          {[course.award, course.level && sentence(course.level), ...course.study_modes]
            .filter(Boolean).slice(0, 4)
            .map((chip) => <span key={chip as string}>{chip}</span>)}
        </div>
      </div>

      <div className="key-strip">
        {key.map((fact) => (
          <button
            key={fact.label}
            type="button"
            className="key-fact"
            disabled={!fact.stated}
            aria-expanded={receipt === fact.label}
            onClick={() => setReceipt(receipt === fact.label ? undefined : fact.label)}
          >
            <span className="k"><Pip course={course} field={fact.key} stated={fact.stated} />{fact.label}</span>
            <span className={`v ${fact.stated ? '' : 'dim'}`}>{fact.value}</span>
          </button>
        ))}
        <AnimatePresence>
          {receipt && (() => {
            const fact = key.find((item) => item.label === receipt)
            const found = fact && evidenceFor(course, fact.key)
            return found ? (
              <motion.div
                className="receipt wide"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              >
                <blockquote><Quote aria-hidden="true" />{found.excerpt}</blockquote>
                <p className="source">Read from <code>{hostOf(found.source_url ?? course.source_url)}</code>
                  {found.section && <> · {found.section}</>}</p>
              </motion.div>
            ) : null
          })()}
        </AnimatePresence>
      </div>

      <nav className="dossier-nav" aria-label="Sections">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className={here === section.id ? 'on' : ''}
            onClick={() => jump(section.id)}
          >{section.label}</button>
        ))}
      </nav>

      <div className="dossier-scroll" ref={scrollRef}>
        <div className="dossier-columns">
          <div className="dossier-doc">
            <Section id="overview" title="Overview">
              <p>{course.course_content
                ?? 'The university does not publish a separate overview on this page. The verified facts alongside are what Scrapal could read.'}</p>
              {course.careers && <><h4>Careers</h4><p>{course.careers}</p></>}
            </Section>

            <Section id="fees" title="Fees and funding" badge={`${course.fees.length} row${course.fees.length === 1 ? '' : 's'}`}>
              {course.fees.length ? (
                <table className="fee-table">
                  <thead>
                    <tr><th>Who pays</th><th>Mode</th><th className="right">Amount</th></tr>
                  </thead>
                  <tbody>
                    {course.fees.map((fee, index) => (
                      <tr key={`${fee.label ?? fee.residency}-${index}`}>
                        <td><strong>{fee.label ?? sentence(fee.residency ?? 'Tuition')}</strong></td>
                        <td>{fee.study_mode ?? course.study_modes[0] ?? '—'}</td>
                        <td className="right amount">
                          {fee.amount != null ? money(fee.amount, fee.currency) : 'Not stated'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <NotStated what="No tuition figure was published on this page." />}
              {course.scholarships.length > 0 && (
                <ul className="scholarships">
                  {course.scholarships.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
            </Section>

            <Section id="dates" title="Dates and intakes">
              {course.intake_months.length
                ? <Timeline months={course.intake_months} />
                : <NotStated what="No start month was published on this page." />}
            </Section>

            <Section id="entry" title="Entry requirements">
              {course.entry_requirements
                ? <p>{course.entry_requirements}</p>
                : <NotStated what="No entry requirement was published on this page." />}
              {course.english_requirements && <><h4>English language</h4><p>{course.english_requirements}</p></>}
            </Section>

            <Section id="modules" title="Modules" badge={course.modules.length ? `${course.modules.length}` : undefined}>
              {course.modules.length
                ? <ul className="modules">{course.modules.map((item) => <li key={item}>{item}</li>)}</ul>
                : <NotStated what="No module list was published on this page." />}
            </Section>

            <Section id="evidence" title="Every fact, and where it came from">
              {ledger.length ? (
                <div className="ledger">
                  {ledger.map(([field, refs]) => (
                    <details key={field}>
                      <summary>
                        <i className="pip" />
                        <span>{sentence(field)}</span>
                        <b>{refs.length}</b>
                        <ChevronDown aria-hidden="true" />
                      </summary>
                      {refs.slice(0, 3).map((reference, index) => (
                        <blockquote key={index}>
                          {reference.excerpt}
                          <cite>{hostOf(reference.source_url ?? course.source_url)} · {reference.method}</cite>
                        </blockquote>
                      ))}
                    </details>
                  ))}
                </div>
              ) : <NotStated what="This record carries no field evidence." />}
            </Section>
          </div>

          <aside className="dossier-rail">
            <div className="rail-card">
              <div className="rail-head">
                <Ring value={course.coverage} />
                <div>
                  <strong>{Math.round(course.coverage * 100)}% evidenced</strong>
                  <span>{ledger.length} field{ledger.length === 1 ? '' : 's'} cited</span>
                </div>
              </div>
              <div className="rail-actions">
                <button type="button" className={`button ${saved ? 'secondary' : 'primary'}`} onClick={onSave}>
                  {saved ? <><BookmarkCheck aria-hidden="true" /> Saved</> : <><Bookmark aria-hidden="true" /> Add to shortlist</>}
                </button>
                <a className="button secondary" href={course.source_url} target="_blank" rel="noreferrer">
                  Open the university&rsquo;s page <ExternalLink aria-hidden="true" />
                </a>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </motion.section>
  </>
}

function Section({ id, title, badge, children }: {
  id: string; title: string; badge?: string; children: ReactNode
}) {
  return <section id={`dossier-${id}`} className="dossier-section">
    <h3>{title}{badge && <span className="badge">{badge}</span>}</h3>
    {children}
  </section>
}

function NotStated({ what }: { what: string }) {
  return <p className="not-stated"><i className="pip none" />{what}</p>
}

/** Twelve months with the published intakes marked — the question a student is
    actually asking is "when can I start", not "what is the start date field". */
function Timeline({ months }: { months: string[] }) {
  return <div className="timeline">
    <div className="axis" aria-hidden="true" />
    <ol>
      {MONTHS.map((month) => {
        const hit = months.some((value) => value.toLowerCase().startsWith(month.slice(0, 3).toLowerCase()))
        return <li key={month} className={hit ? 'hit' : ''}>
          {hit && <span className="flagged">Start</span>}
          <span className="m">{month.slice(0, 3)}</span>
        </li>
      })}
    </ol>
  </div>
}

function Ring({ value }: { value: number }) {
  const percent = Math.max(0, Math.min(1, value))
  const circumference = 2 * Math.PI * 22
  return <span className="ring" role="img" aria-label={`${Math.round(percent * 100)}% evidenced`}>
    <svg width="52" height="52" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r="22" fill="none" stroke="var(--line)" strokeWidth="6" />
      <circle
        cx="26" cy="26" r="22" fill="none" strokeWidth="6" strokeLinecap="round"
        stroke={percent === 1 ? 'var(--mint)' : 'var(--amber)'}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - percent)}
        transform="rotate(-90 26 26)"
      />
    </svg>
    <b>{Math.round(percent * 100)}%</b>
  </span>
}

/* -------------------------------------------------------------------- compare */

function Compare({ entries, onClose, onRemove }: {
  entries: ShortlistEntry[]; onClose: () => void; onRemove: (id: string) => void
}) {
  const rows: { label: string; read: (course: GalleryCourse) => string }[] = [
    { label: 'University', read: (course) => course.institution.name },
    { label: 'Award', read: (course) => course.award ?? 'Not stated' },
    { label: 'Duration', read: (course) => course.durations[0] ?? 'Not stated' },
    { label: 'Study mode', read: (course) => course.study_modes.join(', ') || 'Not stated' },
    { label: 'Intake', read: (course) => course.intake_months.join(', ') || 'Not stated' },
    { label: 'Tuition', read: (course) => feeOf(course) },
    { label: 'Evidenced', read: (course) => `${Math.round(course.coverage * 100)}%` },
  ]
  return <>
    <motion.button
      className="dossier-backdrop" onClick={onClose} aria-label="Close comparison"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    />
    <motion.section
      className="compare-sheet" role="dialog" aria-modal="true" aria-labelledby="compare-title"
      initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
    >
      <header>
        <h2 id="compare-title">Your shortlist, side by side</h2>
        <button type="button" onClick={onClose} aria-label="Close comparison"><X /></button>
      </header>
      <div className="compare-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th />
              {entries.map((entry) => (
                <th key={entry.record_id} style={brandVar(entry.course)}>
                  <Crest course={entry.course} />
                  <strong>{entry.course.title}</strong>
                  <button type="button" onClick={() => onRemove(entry.record_id)}>
                    <X aria-hidden="true" /> Remove
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {entries.map((entry) => <td key={entry.record_id}>{row.read(entry.course)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.section>
  </>
}

/* -------------------------------------------------------------------- pieces */

function Crest({ course }: { course: GalleryCourse }) {
  return <span className="crest" style={brandVar(course)}>
    {course.institution.logo_url
      ? <img src={course.institution.logo_url} alt="" loading="lazy" />
      : initials(course.institution.name)}
  </span>
}

function Pip({ course, field, stated }: { course: GalleryCourse; field: FactKey; stated: boolean }) {
  if (!stated) return <i className="pip none" aria-hidden="true" />
  return <i className={`pip ${evidenceFor(course, field) ? '' : 'partial'}`} aria-hidden="true" />
}

function Flag({ code }: { code?: string | null }) {
  if (!code) return <span className="flag" aria-hidden="true">🌐</span>
  const emoji = code.toUpperCase().replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
  return <span className="flag" role="img" aria-label={countryName(code)}>{emoji}</span>
}

/* --------------------------------------------------------------------- data */

/** Prefer the international fee: it is the one a student comparing countries is
    actually shopping on, and showing a home fee unlabelled would understate the
    cost by thousands. Whichever we land on, the label says which it is. */
function headlineFee(course: GalleryCourse) {
  const priced = course.fees.filter((fee) => fee.amount != null)
  return priced.find((fee) => fee.residency === 'international') ?? priced[0]
}

function factsFor(course: GalleryCourse): Fact[] {
  const fee = headlineFee(course)
  const residency = fee?.residency && fee.residency !== 'unknown' ? `, ${fee.residency}` : ''
  return [
    { key: 'fees', label: `Tuition${residency}`, value: fee ? money(fee.amount ?? null, fee.currency) : 'Not stated', stated: Boolean(fee) },
    { key: 'durations', label: 'Duration', value: course.durations[0] ?? 'Not stated', stated: course.durations.length > 0 },
    { key: 'intake_months', label: 'Next intake', value: course.intake_months[0] ?? 'Not stated', stated: course.intake_months.length > 0 },
    { key: 'entry_requirements', label: 'Entry', value: shorten(course.entry_requirements) ?? 'Not stated', stated: Boolean(course.entry_requirements) },
  ]
}

function keyFacts(course: GalleryCourse): (Fact & { key: FactKey })[] {
  return factsFor(course)
}

function evidenceFor(course: GalleryCourse, field: FactKey) {
  return course.evidence?.fields?.[field]?.[0]
}

function activeTags(filters: GalleryFilters, names: Map<string, string>) {
  const tags: { id: string; field: string; label: string; value: string; clear: Parameters<typeof galleryFilterReducer>[1] }[] = []
  if (filters.level) {
    tags.push({ id: 'level', field: 'level', label: 'Level', value: sentence(filters.level), clear: { type: 'set-level', value: undefined } })
  }
  filters.countries.forEach((value) => tags.push({
    id: `country-${value}`, field: 'countries', label: 'Country', value: countryName(value),
    clear: { type: 'toggle-country', value },
  }))
  filters.institutionIds.forEach((value) => tags.push({
    id: `inst-${value}`, field: 'institutionIds', label: 'University', value: names.get(value) ?? value,
    clear: { type: 'toggle-institution', value },
  }))
  filters.studyModes.forEach((value) => tags.push({
    id: `mode-${value}`, field: 'studyModes', label: 'Mode', value: sentence(value),
    clear: { type: 'toggle-study-mode', value },
  }))
  filters.durations.forEach((value) => tags.push({
    id: `dur-${value}`, field: 'durations', label: 'Duration', value,
    clear: { type: 'toggle-duration', value },
  }))
  filters.intakeMonths.forEach((value) => tags.push({
    id: `intake-${value}`, field: 'intakeMonths', label: 'Intake', value,
    clear: { type: 'toggle-intake', value },
  }))
  if (filters.feeMax != null) {
    tags.push({ id: 'fee', field: 'feeMax', label: 'Tuition', value: `up to ${money(filters.feeMax)}`, clear: { type: 'set-fee-max', value: undefined } })
  }
  return tags
}

function averageCoverage(items?: GalleryCourse[]): string {
  if (!items?.length) return '—'
  return `${Math.round((items.reduce((sum, item) => sum + item.coverage, 0) / items.length) * 100)}%`
}

function feeRange(entries: ShortlistEntry[]): string {
  const amounts = entries
    .map((entry) => entry.course.fees.find((fee) => fee.amount != null)?.amount)
    .filter((value): value is number => value != null)
  if (!amounts.length) return 'No published fees'
  const low = Math.min(...amounts)
  const high = Math.max(...amounts)
  return low === high ? money(low) : `${money(low)}–${money(high)}`
}

function feeOf(course: GalleryCourse): string {
  const fee = course.fees.find((item) => item.amount != null)
  return fee ? money(fee.amount ?? null, fee.currency) : 'Not stated'
}

function brandVar(course: GalleryCourse): CSSProperties {
  return { '--brand': brandOf(course.institution) } as CSSProperties
}

/** Most universities publish no theme-color, so a grid of sixty cards would
    otherwise wear one identical accent and stop reading as sixty places. Where
    a real brand colour exists it always wins; otherwise derive a stable hue from
    the name, held to a saturation and lightness that stay legible on both
    themes and never collide with the console's own cobalt. */
function brandOf(institution: { name: string; brand_color: string | null }): string {
  if (/^#[0-9a-f]{3,8}$/i.test(institution.brand_color ?? '')) return institution.brand_color as string
  let hash = 0
  for (const char of institution.name) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return `hsl(${hash} 52% 38%)`
}

function shorten(value: string | null, limit = 42): string | null {
  if (!value) return null
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function money(value: number | null, currency = 'GBP'): string {
  if (value == null) return 'Not stated'
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency', currency: currency || 'GBP', maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `£${value.toLocaleString()}`
  }
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter((word) => !['of', 'the', 'and'].includes(word.toLowerCase()))
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

function countryName(code: string | null): string {
  if (!code) return 'Country not set'
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code } catch { return code }
}

function sentence(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

