import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight, BadgePoundSterling, Bookmark, BookmarkCheck, BookOpenText, Building2,
  CalendarDays, Check, ChevronDown, Clock3, ExternalLink, GraduationCap, LayoutList,
  Search, ShieldCheck, SlidersHorizontal, Sparkles, X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useReducer, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { api, type GalleryCourse, type ShortlistEntry } from './api'
import { galleryFilterReducer, initialGalleryFilters } from './GalleryState'
import { Empty, Meter } from './ui'

export function CourseGallery({ collectionId }: { collectionId?: string }) {
  const queryClient = useQueryClient()
  const [state, dispatch] = useReducer(galleryFilterReducer, initialGalleryFilters)
  const [brief, setBrief] = useState('')
  const [interpretation, setInterpretation] = useState<{ source: 'model' | 'fallback'; explanation: string }>()
  const [selected, setSelected] = useState<GalleryCourse>()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const filters = {
    q: state.filters.q || undefined, collectionId, level: state.filters.level,
    institutionIds: state.filters.institutionIds, countries: state.filters.countries,
    intakeMonths: state.filters.intakeMonths, studyModes: state.filters.studyModes,
    durations: state.filters.durations, feeMax: state.filters.feeMax, sort: state.filters.sort,
  }
  const institutions = useQuery({ queryKey: ['course-gallery', 'institutions', collectionId], queryFn: () => api.galleryInstitutions(collectionId) })
  const courses = useQuery({ queryKey: ['course-gallery', 'courses', filters], queryFn: () => api.galleryCourses(filters) })
  const facets = useQuery({ queryKey: ['course-gallery', 'facets', filters], queryFn: () => api.galleryFacets(filters) })
  const shortlist = useQuery({ queryKey: ['course-gallery', 'shortlist'], queryFn: api.galleryShortlist })
  const interpret = useMutation({
    mutationFn: api.interpretGalleryQuery,
    onSuccess: (result) => {
      const planned = result.filters
      dispatch({ type: 'apply-ai', values: {
        q: planned.q ?? '', level: planned.level ?? undefined, countries: planned.countries,
        institutionIds: planned.institution_ids, studyModes: planned.study_modes,
        intakeMonths: planned.intake_months, durations: planned.durations,
        feeMax: planned.fee_max ?? undefined,
      } })
      setInterpretation({ source: result.source, explanation: planned.explanation })
    },
  })
  const add = useMutation({
    mutationFn: api.addGalleryShortlist,
    onMutate: async (recordId: string) => {
      await queryClient.cancelQueries({ queryKey: ['course-gallery', 'shortlist'] })
      const previous = queryClient.getQueryData<ShortlistEntry[]>(['course-gallery', 'shortlist'])
      const course = courses.data?.items.find((item) => item.id === recordId) ?? selected
      if (course) queryClient.setQueryData<ShortlistEntry[]>(['course-gallery', 'shortlist'], [...(previous ?? []), { id: `optimistic-${recordId}`, record_id: recordId, note: null, course }])
      return { previous }
    },
    onError: (_error, _recordId, context) => queryClient.setQueryData(['course-gallery', 'shortlist'], context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['course-gallery', 'shortlist'] }),
  })
  const remove = useMutation({
    mutationFn: api.removeGalleryShortlist,
    onMutate: async (recordId: string) => {
      await queryClient.cancelQueries({ queryKey: ['course-gallery', 'shortlist'] })
      const previous = queryClient.getQueryData<ShortlistEntry[]>(['course-gallery', 'shortlist'])
      queryClient.setQueryData(['course-gallery', 'shortlist'], previous?.filter((entry) => entry.record_id !== recordId))
      return { previous }
    },
    onError: (_error, _recordId, context) => queryClient.setQueryData(['course-gallery', 'shortlist'], context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['course-gallery', 'shortlist'] }),
  })
  const shortlisted = useMemo(() => new Set(shortlist.data?.map((entry) => entry.record_id)), [shortlist.data])
  const institutionNames = useMemo(() => new Map(institutions.data?.map((item) => [item.id, item.name])), [institutions.data])
  const activeCount = state.filters.institutionIds.length + state.filters.countries.length + state.filters.intakeMonths.length + state.filters.studyModes.length + state.filters.durations.length + Number(Boolean(state.filters.level)) + Number(state.filters.feeMax != null)
  const toggleShortlist = (course: GalleryCourse) => shortlisted.has(course.id) ? remove.mutate(course.id) : add.mutate(course.id)
  const submitBrief = (event: FormEvent) => { event.preventDefault(); if (brief.trim()) interpret.mutate(brief.trim()) }

  return <div className="gallery-view">
    <section className="gallery-hero">
      <div className="gallery-hero-copy"><p className="eyebrow"><Sparkles /> AI course discovery · evidence first</p><h2>Find the course that fits your life—not just your keywords.</h2><p>Describe your ideal course naturally. Scrapal turns it into editable filters and keeps every result tied to university evidence.</p></div>
      <form className="gallery-ai-search" onSubmit={submitBrief}>
        <label htmlFor="gallery-brief"><span>What are you looking for?</span><textarea id="gallery-brief" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="A part-time postgraduate computing course in the UK, September intake, under £20,000…" rows={2} /></label>
        <button disabled={interpret.isPending || brief.trim().length < 3}>{interpret.isPending ? 'Understanding…' : 'Search with AI'} <ArrowRight /></button>
      </form>
      {interpretation && <motion.div className={`ai-interpretation ${interpretation.source}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}><Sparkles /><span><strong>{interpretation.source === 'model' ? 'AI understood your brief' : 'Keyword fallback used'}</strong>{interpretation.explanation}</span><button onClick={() => setInterpretation(undefined)} aria-label="Dismiss interpretation"><X /></button></motion.div>}
      {interpret.error && <p className="inline-error">{interpret.error.message}</p>}
    </section>

    <section className="country-rail" aria-label="Popular study destinations">
      <button className={!state.filters.countries.length ? 'active' : ''} onClick={() => dispatch({ type: 'clear-country' })}><CountryFlag /><span><strong>{courses.data?.total ?? 0}</strong><small>Everywhere</small></span></button>
      {facets.data?.country.map((item) => <button key={item.value} className={state.filters.countries.includes(item.value) ? 'active' : ''} onClick={() => dispatch({ type: 'toggle-country', value: item.value })}><CountryFlag code={item.value} /><span><strong>{item.count}</strong><small>{countryName(item.value)}</small></span></button>)}
    </section>

    <button className="mobile-filter-trigger" onClick={() => setFiltersOpen(true)}><SlidersHorizontal /> Filters {activeCount > 0 && <b>{activeCount}</b>}</button>
    <div className="gallery-workspace">
      <aside className={`gallery-filter-rail ${filtersOpen ? 'open' : ''}`} aria-label="Course filters">
        <header><div><p className="eyebrow">Refine results</p><h3>Filters {activeCount > 0 && <span>{activeCount}</span>}</h3></div><button onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X /></button></header>
        <label className="filter-search"><Search /><input value={state.filters.q} onChange={(event) => dispatch({ type: 'set-query', value: event.target.value })} placeholder="Course or subject" /><span className="sr-only">Search course title</span></label>
        <FilterSection title="Study level" icon={<GraduationCap />} open><RadioRows values={facets.data?.level ?? []} selected={state.filters.level} onSelect={(value) => dispatch({ type: 'set-level', value: state.filters.level === value ? undefined : value })} /></FilterSection>
        <FilterSection title="University" icon={<Building2 />} open><CheckRows values={facets.data?.institution ?? []} selected={state.filters.institutionIds} label={(value) => institutionNames.get(value) ?? value} onToggle={(value) => dispatch({ type: 'toggle-institution', value })} /></FilterSection>
        <FilterSection title="Study mode" icon={<LayoutList />}><CheckRows values={facets.data?.study_mode ?? []} selected={state.filters.studyModes} onToggle={(value) => dispatch({ type: 'toggle-study-mode', value })} /></FilterSection>
        <FilterSection title="Duration" icon={<Clock3 />}><CheckRows values={facets.data?.duration ?? []} selected={state.filters.durations} onToggle={(value) => dispatch({ type: 'toggle-duration', value })} /></FilterSection>
        <FilterSection title="Intake" icon={<CalendarDays />}><CheckRows values={facets.data?.intake_month ?? []} selected={state.filters.intakeMonths} onToggle={(value) => dispatch({ type: 'toggle-intake', value })} /></FilterSection>
        {facets.data?.fee.max != null && <FilterSection title="Maximum tuition" icon={<BadgePoundSterling />}><label className="fee-filter"><span>Up to <strong>{money(state.filters.feeMax ?? facets.data.fee.max)}</strong></span><input type="range" min={facets.data.fee.min ?? 0} max={facets.data.fee.max} step="250" value={state.filters.feeMax ?? facets.data.fee.max} onChange={(event) => dispatch({ type: 'set-fee-max', value: Number(event.target.value) === facets.data?.fee.max ? undefined : Number(event.target.value) })} /></label></FilterSection>}
        {activeCount > 0 && <button className="clear-gallery-filters" onClick={() => { dispatch({ type: 'clear' }); setInterpretation(undefined) }}><X /> Clear all filters</button>}
      </aside>
      {filtersOpen && <button className="gallery-filter-backdrop" onClick={() => setFiltersOpen(false)} aria-label="Close filters" />}

      <main className="gallery-results">
        <header className="gallery-results-heading"><div><p className="eyebrow">Verified catalogue</p><h3>{courses.data?.total ?? 0} published course{courses.data?.total === 1 ? '' : 's'}</h3><p>Only evidence-gated records are shown.</p></div><label>Sort by<select value={state.filters.sort} onChange={(event) => dispatch({ type: 'set-sort', value: event.target.value as typeof state.filters.sort })}><option value="updated">Recently updated</option><option value="coverage">Best evidenced</option><option value="title">Course title</option></select></label></header>
        {state.aiSet.length > 0 && <div className="ai-filter-chips"><Sparkles /> AI-set filters are highlighted; change any of them freely.</div>}
        {courses.isLoading && <div className="loading-line">Loading published course evidence…</div>}
        {courses.error && <p className="inline-error">{courses.error.message}</p>}
        {!courses.isLoading && !courses.data?.items.length && <Empty icon={ShieldCheck} title="No published courses match" text="Try a broader brief or clear one of the filters." />}
        <motion.div className="course-result-list" layout>{courses.data?.items.map((course, index) => <CourseResult key={course.id} course={course} index={index} shortlisted={shortlisted.has(course.id)} onOpen={() => setSelected(course)} onShortlist={() => toggleShortlist(course)} />)}</motion.div>
      </main>
    </div>

    <AnimatePresence>{selected && <CourseDetail course={selected} shortlisted={shortlisted.has(selected.id)} onClose={() => setSelected(undefined)} onShortlist={() => toggleShortlist(selected)} />}</AnimatePresence>
    <AnimatePresence>{compareOpen && shortlist.data && <ComparePanel entries={shortlist.data} onClose={() => setCompareOpen(false)} onRemove={(id) => remove.mutate(id)} />}</AnimatePresence>
    <AnimatePresence>{(shortlist.data?.length ?? 0) > 0 && <motion.aside className="shortlist-tray" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} aria-label="Course shortlist"><div><BookmarkCheck /><span><strong>{shortlist.data?.length} saved</strong><small>Ready to compare</small></span></div><div className="shortlist-preview">{shortlist.data?.slice(0, 3).map((entry) => <span key={entry.record_id}>{entry.course.award ?? entry.course.title}</span>)}</div><button className="shortlist-compare" onClick={() => setCompareOpen(true)}>Compare courses <ArrowRight /></button></motion.aside>}</AnimatePresence>
  </div>
}

function FilterSection({ title, icon, children, open = false }: { title: string; icon: ReactNode; children: ReactNode; open?: boolean }) {
  return <details className="gallery-filter-section" open={open}><summary>{icon}<span>{title}</span><ChevronDown /></summary><div>{children}</div></details>
}

function CheckRows({ values, selected, onToggle, label = sentence }: { values: { value: string; count: number }[]; selected: string[]; onToggle: (value: string) => void; label?: (value: string) => string }) {
  return <div className="filter-options">{values.slice(0, 8).map((item) => <label key={item.value}><input type="checkbox" checked={selected.includes(item.value)} onChange={() => onToggle(item.value)} /><i><Check /></i><span>{label(item.value)}</span><b>{item.count}</b></label>)}</div>
}

function RadioRows({ values, selected, onSelect }: { values: { value: string; count: number }[]; selected?: string; onSelect: (value: string) => void }) {
  return <div className="filter-options">{values.map((item) => <label key={item.value}><input type="checkbox" checked={selected === item.value} onChange={() => onSelect(item.value)} /><i><Check /></i><span>{sentence(item.value)}</span><b>{item.count}</b></label>)}</div>
}

function CourseResult({ course, index, shortlisted, onOpen, onShortlist }: { course: GalleryCourse; index: number; shortlisted: boolean; onOpen: () => void; onShortlist: () => void }) {
  const fee = course.fees.find((item) => item.amount != null)
  return <motion.article className="course-result" style={{ '--institution': validColor(course.institution.brand_color) } as CSSProperties} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 7) * .025 }}>
    <div className="course-result-institution"><Crest course={course} /><div><strong>{course.institution.name}</strong><span><CountryFlag code={course.institution.country_code} /> {course.institution.city ?? countryName(course.institution.country_code)}</span></div><button className={shortlisted ? 'shortlisted' : ''} onClick={onShortlist} aria-label={shortlisted ? `Remove ${course.title} from shortlist` : `Shortlist ${course.title}`}>{shortlisted ? <BookmarkCheck /> : <Bookmark />}</button></div>
    <div className="course-result-body"><p className="course-kicker">{course.level ? sentence(course.level) : 'University course'} · {course.award ?? 'Award verified at source'}</p><h3>{course.title}</h3><p>{course.course_content ?? course.entry_requirements ?? 'Open the dossier to inspect requirements, fees, study options, and the source evidence behind each fact.'}</p><div className="course-tags">{[course.award, ...course.study_modes, course.campuses[0]].filter(Boolean).slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div></div>
    <div className="course-result-meta"><span><small>Duration</small><strong>{course.durations[0] ?? 'Not stated'}</strong></span><span><small>Tuition from</small><strong>{fee?.amount != null ? money(fee.amount, fee.currency) : 'Ask university'}</strong></span><button onClick={onOpen}>Open course dossier <ArrowRight /></button></div>
    <div className="course-evidence"><Meter value={course.coverage * 100} tone="done" label={`${Math.round(course.coverage * 100)}% evidence coverage`} /><span><ShieldCheck /> {Math.round(course.coverage * 100)}% source coverage</span></div>
  </motion.article>
}

function CourseDetail({ course, shortlisted, onClose, onShortlist }: { course: GalleryCourse; shortlisted: boolean; onClose: () => void; onShortlist: () => void }) {
  const fee = course.fees.find((item) => item.amount != null)
  const facts = [
    ['Tuition', fee?.amount != null ? money(fee.amount, fee.currency) : 'Not stated', BadgePoundSterling],
    ['Duration', course.durations[0] ?? 'Not stated', Clock3],
    ['Next intake', course.intake_months[0] ?? 'Not stated', CalendarDays],
    ['Study mode', course.study_modes[0] ?? 'Not stated', Building2],
  ] as const
  return <><motion.button className="course-detail-backdrop" onClick={onClose} aria-label="Close course dossier" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /><motion.aside className="course-detail" role="dialog" aria-modal="true" aria-labelledby="course-detail-title" initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }}>
    <div className="course-detail-hero" style={{ '--institution': validColor(course.institution.brand_color), backgroundImage: course.institution.banner_url ? `linear-gradient(90deg, rgba(8,20,36,.88), rgba(8,20,36,.42)), url(${course.institution.banner_url})` : undefined } as CSSProperties}><button className="course-detail-close" onClick={onClose} aria-label="Close"><X /></button><p>{course.award ?? sentence(course.level ?? 'University course')}</p><h2 id="course-detail-title">{course.title}</h2><div><Crest course={course} /><span><strong>{course.institution.name}</strong><small><CountryFlag code={course.institution.country_code} /> {countryName(course.institution.country_code)}</small></span></div><button className={shortlisted ? 'detail-save saved' : 'detail-save'} onClick={onShortlist}>{shortlisted ? <BookmarkCheck /> : <Bookmark />} {shortlisted ? 'Saved to shortlist' : 'Save to shortlist'}</button></div>
    <nav className="course-detail-nav"><a href="#detail-overview">Overview</a><a href="#detail-requirements">Requirements</a><a href="#detail-fees">Fees</a><a href="#detail-evidence">Evidence</a></nav>
    <div className="course-detail-scroll"><section className="course-detail-facts">{facts.map(([label, value, Icon]) => <div key={label}><Icon /><span><small>{label}</small><strong>{value}</strong></span></div>)}</section>
      <DetailSection id="detail-overview" eyebrow="Course at a glance" title="What you will study"><p>{course.course_content ?? 'The university source does not publish a separate course overview in the extracted record. The verified facts below remain available.'}</p>{course.modules.length > 0 && <div className="module-cloud">{course.modules.slice(0, 8).map((item) => <span key={item}><BookOpenText /> {item}</span>)}</div>}</DetailSection>
      <DetailSection id="detail-requirements" eyebrow="Admissions" title="Entry and English requirements"><InfoBlock title="Entry requirements" text={course.entry_requirements} /><InfoBlock title="English language" text={course.english_requirements} /></DetailSection>
      <DetailSection id="detail-fees" eyebrow="Plan your budget" title="Published tuition fees">{course.fees.length ? <div className="fee-table">{course.fees.map((item, index) => <div key={`${item.label}-${index}`}><span>{item.label ?? item.residency ?? 'Tuition'}</span><strong>{item.amount != null ? money(item.amount, item.currency) : 'Not stated'}</strong><small>{item.study_mode ?? course.study_modes[0]}</small></div>)}</div> : <InfoBlock title="Tuition" />}{course.scholarships.length > 0 && <InfoBlock title="Scholarships" text={course.scholarships.join(' · ')} />}</DetailSection>
      <DetailSection id="detail-evidence" eyebrow="Scrapal source ledger" title="Verify every claim"><p className="evidence-intro"><ShieldCheck /> This dossier has {Math.round(course.coverage * 100)}% required-field coverage. Open the university page for the full context.</p><div className="evidence-ledger">{Object.entries(course.evidence.fields ?? {}).slice(0, 10).map(([field, refs]) => <details key={field}><summary><span>{sentence(field)}</span><b>{refs.length} source{refs.length === 1 ? '' : 's'}</b><ChevronDown /></summary>{refs.slice(0, 2).map((reference, index) => <blockquote key={`${reference.excerpt}-${index}`}>{reference.excerpt}<cite>{reference.method}</cite></blockquote>)}</details>)}</div><a className="source-button" href={course.source_url} target="_blank" rel="noreferrer">Visit university source <ExternalLink /></a></DetailSection>
    </div>
  </motion.aside></>
}

function DetailSection({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) { return <section className="course-detail-section" id={id}><p className="eyebrow">{eyebrow}</p><h3>{title}</h3>{children}</section> }
function InfoBlock({ title, text }: { title: string; text?: string | null }) { return <div className="detail-info-block"><strong>{title}</strong><p>{text ?? 'Not stated in the published university source.'}</p></div> }

function ComparePanel({ entries, onClose, onRemove }: { entries: ShortlistEntry[]; onClose: () => void; onRemove: (id: string) => void }) {
  return <><motion.button className="course-detail-backdrop" onClick={onClose} aria-label="Close comparison" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /><motion.section className="compare-panel" role="dialog" aria-modal="true" aria-labelledby="compare-title" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}><header><div><p className="eyebrow">Your shortlist</p><h2 id="compare-title">Compare the facts side by side</h2></div><button onClick={onClose} aria-label="Close"><X /></button></header><div className="compare-grid">{entries.map((entry) => { const fee = entry.course.fees.find((item) => item.amount != null); return <article key={entry.record_id}><Crest course={entry.course} /><p>{entry.course.institution.name}</p><h3>{entry.course.title}</h3><dl><div><dt>Award</dt><dd>{entry.course.award ?? 'Not stated'}</dd></div><div><dt>Duration</dt><dd>{entry.course.durations[0] ?? 'Not stated'}</dd></div><div><dt>Study mode</dt><dd>{entry.course.study_modes.join(', ') || 'Not stated'}</dd></div><div><dt>Tuition</dt><dd>{fee?.amount != null ? money(fee.amount, fee.currency) : 'Not stated'}</dd></div><div><dt>Evidence</dt><dd>{Math.round(entry.course.coverage * 100)}%</dd></div></dl><button onClick={() => onRemove(entry.record_id)}><X /> Remove</button></article> })}</div></motion.section></>
}

function Crest({ course }: { course: GalleryCourse }) { return <span className="institution-crest">{course.institution.logo_url ? <img src={course.institution.logo_url} alt="" /> : initials(course.institution.name)}</span> }
function CountryFlag({ code }: { code?: string | null }) { const flag = code?.toUpperCase().replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0))) ?? '🌐'; return <span className="country-flag" role="img" aria-label={code ? `${countryName(code)} flag` : 'Worldwide'}>{flag}</span> }
function money(value: number | null, currency = 'GBP'): string { if (value == null) return 'Not stated'; try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP', maximumFractionDigits: 0 }).format(value) } catch { return `£${value.toLocaleString()}` } }
function initials(value: string): string { return value.split(/\s+/).filter((word) => !['of', 'the'].includes(word.toLowerCase())).slice(0, 2).map((word) => word[0]).join('').toUpperCase() }
function countryName(code: string | null): string { if (!code) return 'Country not set'; try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code } catch { return code } }
function sentence(value: string): string { return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()) }
function validColor(value: string | null): string { return /^#[0-9a-f]{3,8}$/i.test(value ?? '') ? value! : '#2457d6' }
