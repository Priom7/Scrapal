// Funding, sorted by the thing that actually forces a decision: the deadline.
//
// A funding list ordered by relevance is a reading list. Ordered by what closes
// next, it is a plan. So the default is soonest-first with closed calls hidden,
// and the page leads with what is closing this month rather than burying it.
import { useQuery } from '@tanstack/react-query'
import {
  Banknote, CalendarClock, RotateCcw, Search, Sparkles, SlidersHorizontal, X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { api, type FundingCall, type FundingSort } from '../../api'
import { EmptyState, ErrorState, SkeletonCard } from '../../brand'
import { ICON } from '../../lib'
import { navigate } from '../../router'
import { FundingCard } from './FundingCard'
import { loadTerms, overlapWith } from './savedTerms'

const KINDS: { id: FundingCall['kind']; label: string }[] = [
  { id: 'phd', label: 'PhD' },
  { id: 'fellowship', label: 'Fellowship' },
  { id: 'grant', label: 'Grant' },
  { id: 'scholarship', label: 'Scholarship' },
]

const SORTS: { id: FundingSort; label: string }[] = [
  { id: 'deadline', label: 'Closing soonest' },
  { id: 'amount', label: 'Largest award' },
  { id: 'name', label: 'Name (A–Z)' },
]

export function FundingPage() {
  const [typed, setTyped] = useState('')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<FundingCall['kind'] | ''>('')
  const [topic, setTopic] = useState('')
  const [sort, setSort] = useState<FundingSort>('deadline')
  const [fullyFunded, setFullyFunded] = useState(false)
  // Closed calls are hidden by default: they are not options, and a list that
  // opens on things you cannot apply to wastes the first screen.
  const [openOnly, setOpenOnly] = useState(true)
  const [showTopics, setShowTopics] = useState(false)

  // Read once: the terms only change when the Radar is run again, and re-reading
  // storage on every render would make this page's output depend on when it
  // happened to re-render.
  const saved = useMemo(() => loadTerms(), [])

  const filters = {
    q: query || undefined,
    kind: kind || undefined,
    topic: topic || undefined,
    sort,
    fully_funded: fullyFunded || undefined,
    open_only: openOnly || undefined,
  }

  const funding = useQuery({
    queryKey: ['funding', filters],
    queryFn: () => api.funding(filters),
  })

  const active = (kind ? 1 : 0) + (topic ? 1 : 0) + (query ? 1 : 0) + (fullyFunded ? 1 : 0)
  const clear = () => {
    setKind(''); setTopic(''); setQuery(''); setTyped(''); setFullyFunded(false)
  }

  const items = funding.data?.items ?? []
  const closingSoon = items.filter((call) => {
    const days = Math.ceil((new Date(call.deadline).getTime() - Date.now()) / 86_400_000)
    return days > 0 && days <= 30
  })
  const matchingCount = saved
    ? items.filter((call) => overlapWith(call.topics, saved).length).length
    : 0

  return <div className="people funding-page">
    <header className="people-head">
      <p className="people-lead">
        Studentships, fellowships, grants and scholarships, with the closing date on every one.
        Deadlines are what decide this, so that is the default order.
      </p>
      {saved
        ? <p className="people-hint">
            <Sparkles size={ICON.xs} aria-hidden="true" />
            <span>
              Using the {saved.terms.length} terms from your last Research radar search to mark
              what matches your work — <b>{matchingCount}</b> of these do.
            </span>
          </p>
        : <p className="people-hint">
            Run the
            {' '}<button type="button" className="student-link" onClick={() => navigate('/student/radar')}>Research radar</button>
            {' '}once and Scrapal will mark the calls that match what you actually work on.
          </p>}
    </header>

    {closingSoon.length > 0 && <p className="funding-urgent">
      <CalendarClock size={ICON.sm} aria-hidden="true" />
      <span>
        <b>{closingSoon.length}</b> of these close within a month. The soonest is{' '}
        <b>{closingSoon[0].name}</b>.
      </span>
    </p>}

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
          placeholder="Search by funder, programme or topic…"
          aria-label="Search funding"
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
      {KINDS.map((item) => {
        const count = funding.data?.facets.kinds.find((entry) => entry.value === item.id)?.count ?? 0
        return <button
          key={item.id}
          type="button"
          className={`filter-chip ${kind === item.id ? 'on' : ''}`}
          aria-pressed={kind === item.id}
          onClick={() => setKind(kind === item.id ? '' : item.id)}
        >
          {item.label}
          <b>{count}</b>
        </button>
      })}

      <button
        type="button"
        className={`filter-chip ${fullyFunded ? 'on' : ''}`}
        aria-pressed={fullyFunded}
        onClick={() => setFullyFunded((current) => !current)}
      >
        <Banknote size={ICON.xs} aria-hidden="true" />
        Fully funded
        {funding.data && <b>{funding.data.facets.fully_funded}</b>}
      </button>

      <button
        type="button"
        className={`filter-chip ${openOnly ? 'on' : ''}`}
        aria-pressed={openOnly}
        onClick={() => setOpenOnly((current) => !current)}
      >
        <CalendarClock size={ICON.xs} aria-hidden="true" />
        Still open
        {funding.data && <b>{funding.data.facets.open_only}</b>}
      </button>

      <button
        type="button"
        className={`filter-chip ${topic ? 'on' : ''}`}
        aria-expanded={showTopics}
        onClick={() => setShowTopics((current) => !current)}
      >
        <SlidersHorizontal size={ICON.xs} aria-hidden="true" />
        {topic || 'Research area'}
      </button>

      <label className="people-sort">
        Sort
        <select value={sort} onChange={(event) => setSort(event.target.value as FundingSort)}>
          {SORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>

      {active > 0 && <button type="button" className="student-link" onClick={clear}>
        <RotateCcw size={ICON.xs} aria-hidden="true" /> Clear {active} filter{active === 1 ? '' : 's'}
      </button>}
    </div>

    {showTopics && <div className="topic-picker">
      <p>Pick a research area. The number is how many calls fund it.</p>
      <div>
        <button
          type="button"
          className={`filter-chip ${topic ? '' : 'on'}`}
          onClick={() => { setTopic(''); setShowTopics(false) }}
        >
          Any area
        </button>
        {funding.data?.facets.topics.map((entry) => (
          <button
            key={entry.value}
            type="button"
            className={`filter-chip ${topic === entry.value ? 'on' : ''}`}
            aria-pressed={topic === entry.value}
            onClick={() => { setTopic(entry.value === topic ? '' : entry.value); setShowTopics(false) }}
          >
            {entry.value} <b>{entry.count}</b>
          </button>
        ))}
      </div>
    </div>}

    {funding.isLoading && <div className="radar-results">
      {[0, 1, 2, 3].map((n) => <SkeletonCard key={n} />)}
    </div>}

    {funding.error && <ErrorState title="Could not load funding">
      {(funding.error as Error).message}
    </ErrorState>}

    {funding.data && <>
      <h2 className="people-count">
        <Banknote size={ICON.xs} aria-hidden="true" />
        <b>{funding.data.total}</b> opportunit{funding.data.total === 1 ? 'y' : 'ies'}
        {query && <> for “{query}”</>}
        {openOnly && <> still open</>}
      </h2>

      {funding.data.total === 0
        ? <EmptyState title="Nothing matches all of that" actions={
            <button type="button" className="student-button primary" onClick={clear}>Clear the filters</button>
          }>
            {openOnly
              ? 'Closed calls are hidden. Turning "Still open" off will show what has already been and gone, which is useful for planning next year.'
              : 'Every filter narrows the list at once. Dropping one usually opens it up again.'}
          </EmptyState>
        : <div className="radar-results">
            {funding.data.items.map((call) => (
              <FundingCard key={call.id} call={call} matched={overlapWith(call.topics, saved)} />
            ))}
          </div>}
    </>}
  </div>
}
