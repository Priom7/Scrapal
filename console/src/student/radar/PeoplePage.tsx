// Browsing researchers without uploading anything.
//
// The Radar answers "who matches my work". This answers the question people ask
// before they have written anything down: "who is out there, and which of them
// could actually take me on". So the filters here are the three facts that
// decide that — supervising, hiring, funded — rather than a generic search.
import { useQuery } from '@tanstack/react-query'
import {
  Banknote, GraduationCap, RotateCcw, Search, SlidersHorizontal, UserCheck, Users, X,
} from 'lucide-react'
import { useState } from 'react'
import { api, type ResearcherSort } from '../../api'
import { EmptyState, ErrorState, SkeletonCard } from '../../brand'
import { ICON } from '../../lib'
import { navigate } from '../../router'
import { PersonCard } from './PersonCard'

const AVAILABILITY = [
  { id: 'open_to_supervise', label: 'Open to supervise', icon: UserCheck },
  { id: 'hiring_phd', label: 'Hiring PhD students', icon: GraduationCap },
  { id: 'has_funding', label: 'Has funding', icon: Banknote },
] as const

type Availability = (typeof AVAILABILITY)[number]['id']

const SORTS: { id: ResearcherSort; label: string }[] = [
  { id: 'standing', label: 'Standing (h-index)' },
  { id: 'publications', label: 'Most published' },
  { id: 'experience', label: 'Most experienced' },
  { id: 'name', label: 'Name (A–Z)' },
]

export function PeoplePage() {
  // The typed value and the searched value are separate, so results do not
  // thrash on every keystroke and the reader controls when the list changes.
  const [typed, setTyped] = useState('')
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState('')
  const [sort, setSort] = useState<ResearcherSort>('standing')
  const [on, setOn] = useState<Set<Availability>>(new Set())
  const [showFilters, setShowFilters] = useState(false)

  const filters = {
    q: query || undefined,
    topic: topic || undefined,
    sort,
    open_to_supervise: on.has('open_to_supervise') || undefined,
    hiring_phd: on.has('hiring_phd') || undefined,
    has_funding: on.has('has_funding') || undefined,
  }

  const people = useQuery({
    queryKey: ['researchers', filters],
    queryFn: () => api.researchers(filters),
  })

  const toggle = (id: Availability) => setOn((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const active = on.size + (topic ? 1 : 0) + (query ? 1 : 0)
  const clear = () => { setOn(new Set()); setTopic(''); setQuery(''); setTyped('') }

  return <div className="people">
    {/* No heading of its own: the shell already puts "Researchers and mentors"
        at the top of the page, and saying it twice is just noise. */}
    <header className="people-head">
      <p className="people-lead">
        The people working on the problems you care about — and, for each one, whether they can
        actually take someone on right now.
      </p>
      <p className="people-hint">
        Looking for people who match your own work? The
        {' '}<button type="button" className="student-link" onClick={() => navigate('/student/radar')}>Research radar</button>
        {' '}reads your writing and finds them for you.
      </p>
    </header>

    <form
      className="people-search"
      onSubmit={(event) => { event.preventDefault(); setQuery(typed.trim()) }}
      role="search"
    >
      <span className="people-search-field">
        <Search size={ICON.sm} aria-hidden="true" />
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Search by name, topic, institution or keyword…"
          aria-label="Search researchers"
        />
        {typed && <button
          type="button"
          className="people-clear"
          aria-label="Clear the search"
          onClick={() => { setTyped(''); setQuery('') }}
        >
          <X size={ICON.xs} />
        </button>}
      </span>
      <button type="submit" className="student-button primary">
        <Search size={ICON.xs} aria-hidden="true" /> Search
      </button>
    </form>

    <div className="people-filters">
      {AVAILABILITY.map((item) => {
        const Icon = item.icon
        const count = people.data?.facets[item.id]
        return <button
          key={item.id}
          type="button"
          className={`filter-chip ${on.has(item.id) ? 'on' : ''}`}
          aria-pressed={on.has(item.id)}
          onClick={() => toggle(item.id)}
        >
          <Icon size={ICON.xs} aria-hidden="true" />
          {item.label}
          {count !== undefined && <b>{count}</b>}
        </button>
      })}

      <button
        type="button"
        className={`filter-chip ${topic ? 'on' : ''}`}
        aria-expanded={showFilters}
        onClick={() => setShowFilters((current) => !current)}
      >
        <SlidersHorizontal size={ICON.xs} aria-hidden="true" />
        {topic || 'Research area'}
      </button>

      <label className="people-sort">
        Sort
        <select value={sort} onChange={(event) => setSort(event.target.value as ResearcherSort)}>
          {SORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>

      {active > 0 && <button type="button" className="student-link" onClick={clear}>
        <RotateCcw size={ICON.xs} aria-hidden="true" /> Clear {active} filter{active === 1 ? '' : 's'}
      </button>}
    </div>

    {showFilters && <div className="topic-picker">
      <p>Pick a research area. The number is how many people work on it.</p>
      <div>
        <button
          type="button"
          className={`filter-chip ${topic ? '' : 'on'}`}
          onClick={() => { setTopic(''); setShowFilters(false) }}
        >
          Any area
        </button>
        {people.data?.facets.topics.map((entry) => (
          <button
            key={entry.value}
            type="button"
            className={`filter-chip ${topic === entry.value ? 'on' : ''}`}
            aria-pressed={topic === entry.value}
            onClick={() => { setTopic(entry.value === topic ? '' : entry.value); setShowFilters(false) }}
          >
            {entry.value} <b>{entry.count}</b>
          </button>
        ))}
      </div>
    </div>}

    {people.isLoading && <div className="radar-results">
      {[0, 1, 2, 3].map((n) => <SkeletonCard key={n} />)}
    </div>}

    {people.error && <ErrorState title="Could not load researchers">
      {(people.error as Error).message}
    </ErrorState>}

    {people.data && <>
      <h2 className="people-count">
        <Users size={ICON.xs} aria-hidden="true" />
        <b>{people.data.total}</b> researcher{people.data.total === 1 ? '' : 's'} found
        {query && <> for “{query}”</>}
      </h2>

      {people.data.total === 0
        ? <EmptyState title="Nobody matches all of that" actions={
            <button type="button" className="student-button primary" onClick={clear}>Clear the filters</button>
          }>
            Every filter narrows the list at once. Dropping one usually opens it up again.
          </EmptyState>
        : <div className="radar-results">
            {people.data.items.map((person) => <PersonCard key={person.id} person={person} />)}
          </div>}
    </>}
  </div>
}
