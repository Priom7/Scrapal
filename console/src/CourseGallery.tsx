import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, BookmarkCheck, Building2, CalendarDays, Clock3, ExternalLink, MapPin, Search, ShieldCheck, X } from 'lucide-react'
import { useReducer, useState, type CSSProperties } from 'react'
import { api, type GalleryCourse, type ShortlistEntry } from './api'
import { galleryFilterReducer, initialGalleryFilters } from './GalleryState'
import { ICON } from './lib'
import { Empty, Meter } from './ui'

export function CourseGallery({ collectionId }: { collectionId?: string }) {
  const queryClient = useQueryClient()
  const [state, dispatch] = useReducer(galleryFilterReducer, initialGalleryFilters)
  const filters = {
    q: state.filters.q || undefined,
    collectionId,
    level: state.filters.level,
    institutionIds: state.filters.institutionIds,
    countries: state.filters.countries,
    intakeMonths: state.filters.intakeMonths,
  }
  const institutions = useQuery({ queryKey: ['course-gallery', 'institutions', collectionId], queryFn: () => api.galleryInstitutions(collectionId) })
  const courses = useQuery({ queryKey: ['course-gallery', 'courses', filters], queryFn: () => api.galleryCourses(filters) })
  const facets = useQuery({ queryKey: ['course-gallery', 'facets', filters], queryFn: () => api.galleryFacets(filters) })
  const shortlist = useQuery({ queryKey: ['course-gallery', 'shortlist'], queryFn: api.galleryShortlist })
  const add = useMutation({
    mutationFn: api.addGalleryShortlist,
    onMutate: async (recordId: string) => {
      await queryClient.cancelQueries({ queryKey: ['course-gallery', 'shortlist'] })
      const previous = queryClient.getQueryData<ShortlistEntry[]>(['course-gallery', 'shortlist'])
      const course = courses.data?.items.find((item) => item.id === recordId)
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
  const shortlisted = new Set(shortlist.data?.map((entry) => entry.record_id))
  const institutionNames = new Map(institutions.data?.map((item) => [item.id, item.name]))
  const activeCount = state.filters.institutionIds.length + state.filters.countries.length + state.filters.intakeMonths.length + Number(Boolean(state.filters.level))

  return <div className="gallery-view">
    <section className="gallery-search">
      <div><p className="eyebrow">Published courses · source-backed facts</p><h2>Compare the claim. Open the receipt.</h2><p>Every visible fact comes from a published course record and links back to university evidence.</p></div>
      <label><Search aria-hidden="true" /><span className="sr-only">Search published courses</span><input value={state.filters.q} onChange={(event) => dispatch({ type: 'set-query', value: event.target.value })} placeholder="Search course, award, or university" /></label>
    </section>

    <section className="country-rail" aria-label="Filter courses by country">
      <button className={!state.filters.countries.length ? 'active' : ''} onClick={() => dispatch({ type: 'clear' })}><strong>{courses.data?.total ?? 0}</strong><span>Everywhere</span></button>
      {facets.data?.country.map((item) => <button key={item.value} className={state.filters.countries.includes(item.value) ? 'active' : ''} onClick={() => dispatch({ type: 'toggle-country', value: item.value })}><span className="flag-code" aria-hidden="true">{item.value}</span><strong>{item.count}</strong><span>{countryName(item.value)}</span></button>)}
    </section>

    <section className="gallery-filter-bar" aria-label="Course filters">
      <label>Level<select value={state.filters.level ?? ''} onChange={(event) => dispatch({ type: 'set-level', value: event.target.value || undefined })}><option value="">All levels</option><option value="undergraduate">Undergraduate</option><option value="postgraduate">Postgraduate</option></select></label>
      <div className="gallery-filter-group"><span>University</span><div>{facets.data?.institution.map((item) => <button key={item.value} className={state.filters.institutionIds.includes(item.value) ? 'active' : ''} onClick={() => dispatch({ type: 'toggle-institution', value: item.value })}>{institutionNames.get(item.value) ?? item.value} <b>{item.count}</b></button>)}</div></div>
      <div className="gallery-filter-group"><span>Intake</span><div>{facets.data?.intake_month.slice(0, 6).map((item) => <button key={item.value} className={state.filters.intakeMonths.includes(item.value) ? 'active' : ''} onClick={() => dispatch({ type: 'toggle-intake', value: item.value })}>{item.value} <b>{item.count}</b></button>)}</div></div>
      {activeCount > 0 && <button className="clear-gallery-filters" onClick={() => dispatch({ type: 'clear' })}><X size={ICON.sm} /> Clear {activeCount}</button>}
    </section>

    <header className="gallery-results-heading"><div><h3>{courses.data?.total ?? 0} published course{courses.data?.total === 1 ? '' : 's'}</h3><p>Only records that passed the evidence gate appear here.</p></div>{facets.data?.fee.min != null && <span>Tuition range {money(facets.data.fee.min)}–{money(facets.data.fee.max)}</span>}</header>
    {courses.isLoading && <div className="loading-line">Loading published course evidence…</div>}
    {courses.error && <p className="inline-error">{courses.error.message}</p>}
    {!courses.isLoading && !courses.data?.items.length && <Empty icon={ShieldCheck} title="No published courses match" text="Clear a filter or publish evidence-complete records from Course intelligence." />}
    <div className="course-gallery-grid">{courses.data?.items.map((course) => <CourseDossier key={course.id} course={course} shortlisted={shortlisted.has(course.id)} toggleShortlist={() => shortlisted.has(course.id) ? remove.mutate(course.id) : add.mutate(course.id)} />)}</div>

    {(shortlist.data?.length ?? 0) > 0 && <aside className="shortlist-tray" aria-label="Course shortlist"><div><BookmarkCheck aria-hidden="true" /><span><strong>{shortlist.data?.length} shortlisted</strong><small>Saved to this API key</small></span></div><div>{shortlist.data?.slice(0, 4).map((entry) => <span key={entry.record_id}>{entry.course.award ?? entry.course.title}<button onClick={() => remove.mutate(entry.record_id)} aria-label={`Remove ${entry.course.title}`}><X /></button></span>)}</div></aside>}
  </div>
}

function CourseDossier({ course, shortlisted, toggleShortlist }: { course: GalleryCourse; shortlisted: boolean; toggleShortlist: () => void }) {
  const [receipt, setReceipt] = useState<string>()
  const color = /^#[0-9a-f]{3,8}$/i.test(course.institution.brand_color ?? '') ? course.institution.brand_color ?? '#1d55d5' : '#1d55d5'
  const fee = course.fees.find((item) => item.amount != null)
  const facts = [
    { field: 'durations', icon: Clock3, label: 'Duration', value: course.durations[0] },
    { field: 'study_modes', icon: Building2, label: 'Study mode', value: course.study_modes[0] },
    { field: 'intake_months', icon: CalendarDays, label: 'Next intake', value: course.intake_months[0] },
    { field: 'fees', icon: Bookmark, label: 'Tuition', value: fee?.amount != null ? money(fee.amount, fee.currency) : undefined },
  ]
  const references = receipt ? course.evidence.fields?.[receipt] ?? [] : []
  return <article className="course-dossier" style={{ '--institution': color } as CSSProperties}>
    <header><span className="institution-crest">{course.institution.logo_url ? <img src={course.institution.logo_url} alt="" /> : initials(course.institution.name)}</span><div><p>{course.institution.name}</p><span><MapPin size={ICON.xs} /> {course.institution.city ?? countryName(course.institution.country_code)}</span></div><button className={shortlisted ? 'shortlisted' : ''} onClick={toggleShortlist} aria-label={shortlisted ? `Remove ${course.title} from shortlist` : `Shortlist ${course.title}`}>{shortlisted ? <BookmarkCheck /> : <Bookmark />}</button></header>
    <div className="course-dossier-title"><span>{course.award ?? course.level ?? 'Course'}</span><h3>{course.title}</h3></div>
    <div className="course-facts">{facts.map(({ field, icon: Icon, label, value }) => { const evidenced = Boolean(course.evidence.fields?.[field]?.length); return <button key={field} onClick={() => setReceipt(receipt === field ? undefined : field)} aria-expanded={receipt === field}><Icon aria-hidden="true" /><span><small>{label}</small><strong>{value ?? 'Not stated'}</strong></span><i className={evidenced ? 'evidenced' : 'missing'} title={evidenced ? 'Source evidence available' : 'Not stated in source'} /></button> })}</div>
    {receipt && <div className="fact-receipt"><p><ShieldCheck /> Source receipt</p>{references.length ? references.slice(0, 2).map((reference, index) => <blockquote key={`${reference.excerpt}-${index}`}>{reference.excerpt}<cite>{reference.method}</cite></blockquote>) : <span>No field-level excerpt was stored.</span>}</div>}
    <footer><span><Meter value={course.coverage * 100} tone="done" label={`${Math.round(course.coverage * 100)}% evidence coverage`} /><small>{Math.round(course.coverage * 100)}% evidenced</small></span><a href={course.source_url} target="_blank" rel="noreferrer">University page <ExternalLink /></a></footer>
  </article>
}

function money(value: number | null, currency = 'GBP'): string { if (value == null) return 'Not stated'; try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP', maximumFractionDigits: 0 }).format(value) } catch { return `£${value.toLocaleString()}` } }
function initials(value: string): string { return value.split(/\s+/).filter((word) => !['of', 'the'].includes(word.toLowerCase())).slice(0, 2).map((word) => word[0]).join('').toUpperCase() }
function countryName(code: string | null): string { if (!code) return 'Country not set'; try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code } catch { return code } }
