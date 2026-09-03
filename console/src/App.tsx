import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheckBig,
  Database,
  ExternalLink,
  FileSearch,
  Globe2,
  GraduationCap,
  LibraryBig,
  Menu,
  Network,
  MessageSquareText,
  Microscope,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
} from 'lucide-react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, CourseRecord, CrawlBlueprint, CrawlEvent, Incident, ObservabilityRun, RetrievalRun, Run, RunDetail, SearchHit, Source } from './api'
import { CollectionPicker } from './CollectionPicker'
import { useCollectionScope } from './CollectionScope'
import { CourseGallery } from './CourseGallery'
import { InterpretedQuery } from './QueryPlan'
import { RunPath } from './RunPath'
import { formatDuration, ICON, isLiveRun, QueryPlanData, readPlan, relativeDate, Tone, useDialog, useMediaQuery, uuid } from './lib'
import { Empty, Meter, Status } from './ui'

type View = 'overview' | 'sources' | 'knowledge' | 'course-intelligence' | 'course-gallery' | 'retrieval-lab' | 'observability' | 'reviews' | 'settings'
type AgentMessage = { id: string; role: string; content: string; citations?: { number: number; title: string; url?: string }[]; withheld?: string[] }

const nav: { id: View; label: string; icon: typeof Activity }[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'sources', label: 'Sources', icon: Globe2 },
  { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
  { id: 'course-intelligence', label: 'Course intelligence', icon: GraduationCap },
  { id: 'course-gallery', label: 'Course gallery', icon: LibraryBig },
  { id: 'retrieval-lab', label: 'Retrieval Lab', icon: Microscope },
  { id: 'observability', label: 'Observability', icon: Network },
  { id: 'reviews', label: 'Reviews', icon: ShieldCheck },
  { id: 'settings', label: 'Settings', icon: Settings2 },
]

function App() {
  const queryClient = useQueryClient()
  const [view, setView] = useState<View>('overview')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('scrapal-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [agentOpen, setAgentOpen] = useState(() => window.matchMedia('(min-width: 1181px)').matches)
  const [navOpen, setNavOpen] = useState(false)
  const mobile = useMediaQuery('(max-width: 760px)')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('scrapal-sidebar') === 'collapsed')
  const [newSource, setNewSource] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string>()
  const collections = useQuery({ queryKey: ['collections'], queryFn: api.collections })
  const { scope, setScope } = useCollectionScope()
  const sources = useQuery({ queryKey: ['sources'], queryFn: api.sources })
  const runs = useQuery({ queryKey: ['runs'], queryFn: api.runs })
  const documents = useQuery({ queryKey: ['documents'], queryFn: api.documents })
  const system = useQuery({ queryKey: ['system'], queryFn: api.system })
  const proposals = useQuery({ queryKey: ['proposals'], queryFn: api.proposals })
  const connectionError = [collections.error, sources.error, runs.error, documents.error, system.error].find((error) => error instanceof Error) as Error | undefined

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('scrapal-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('scrapal-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded')
  }, [sidebarCollapsed])

  const activeRun = useMemo(
    () => runs.data?.find(isLiveRun) ?? runs.data?.find((run) => run.status !== 'queued' || isLiveRun(run)),
    [runs.data],
  )
  // An unreachable API is not an Ollama outage. Reporting one as the other sent
  // us hunting a healthy model server while nginx was the thing that was broken.
  const localAi: { tone: Tone; label: string } = system.isPending ? { tone: 'idle', label: 'Checking local AI' }
    : system.error ? { tone: 'idle', label: 'Status unknown · API unreachable' }
    : system.data?.ollama.status === 'ok' ? { tone: 'done', label: 'Ollama ready' }
    : system.data?.ollama.status === 'degraded' ? { tone: 'wait', label: 'Chat needs attention' }
    : { tone: 'fail', label: 'Ollama unavailable' }
  const sourceMap = new Map(sources.data?.map((source) => [source.id, source]))
  const refresh = () => queryClient.invalidateQueries()
  const closeRunMonitor = useCallback(() => setSelectedRunId(undefined), [])

  return (
   <MotionConfig reducedMotion="user">
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${agentOpen ? 'agent-open' : ''}`}>
      <a className="skip-link" href="#workspace">Skip to workspace</a>
      <aside id="primary-nav" className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Primary navigation" inert={mobile && (!navOpen || agentOpen) ? true : undefined}>
        <div className="brand-block">
          <div className="brand-lockup">
            <img className="brand-wordmark" src="/scrapal_logo.svg" alt="Scrapal" />
            <span className="brand-mark" aria-label="Scrapal"><img src="/scrapal_logo.svg" alt="" /></span>
          </div>
          <button className="icon-button collapse-button" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'} title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}>
            {sidebarCollapsed ? <PanelLeftOpen size={ICON.lg} /> : <PanelLeftClose size={ICON.lg} />}
          </button>
          <button className="icon-button mobile-only" onClick={() => setNavOpen(false)} aria-label="Close navigation"><X /></button>
        </div>
        <p className="workspace-label">Workspace</p>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => { setView(id); setNavOpen(false); if (id === 'retrieval-lab' || id === 'course-intelligence') setAgentOpen(false) }} aria-label={label} title={sidebarCollapsed ? label : undefined}>
              <Icon size={ICON.lg} aria-hidden="true" /><span className="nav-label">{label}</span>
              {id === 'reviews' && (proposals.data?.filter((p) => p.status === 'pending').length ?? 0) > 0 && (
                <b>{proposals.data?.filter((p) => p.status === 'pending').length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="model-health">
            <span className={`tone-${localAi.tone}`} />
            <div className="health-copy"><small>Local AI</small><strong>{localAi.label}</strong></div>
          </div>
          <button className="theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={theme === 'light' ? 'Use dark theme' : 'Use light theme'} title={sidebarCollapsed ? (theme === 'light' ? 'Use dark theme' : 'Use light theme') : undefined}>
            {theme === 'light' ? <Moon size={ICON.md} /> : <Sun size={ICON.md} />}
            <span className="nav-label">{theme === 'light' ? 'Dark theme' : 'Light theme'}</span>
          </button>
        </div>
      </aside>

      <main id="workspace" className="workspace" tabIndex={-1} inert={mobile && agentOpen ? true : undefined}>
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setNavOpen(true)} aria-label="Open navigation" aria-expanded={navOpen} aria-controls="primary-nav"><Menu size={ICON.lg} /></button>
          <div>
            <p className="eyebrow">Scrapal / {view}</p>
            <h1>{titleFor(view)}</h1>
          </div>
          <div className="top-actions">
            <CollectionPicker collections={collections.data ?? []} scope={scope} onChange={setScope} />
            <button className="button secondary agent-trigger" onClick={() => setAgentOpen(!agentOpen)} aria-label={agentOpen ? 'Hide Scrapal agent' : 'Ask Scrapal'} title={agentOpen ? 'Hide Scrapal agent' : 'Ask Scrapal'}><Bot size={ICON.md} aria-hidden="true" /> <span>{agentOpen ? 'Hide agent' : 'Ask Scrapal'}</span></button>
            <button className="button primary add-source-trigger" onClick={() => setNewSource(true)} aria-label="Add source" title="Add source"><Plus size={ICON.md} aria-hidden="true" /> <span>Add source</span></button>
          </div>
        </header>

        {connectionError && <div className="connection-banner" role="alert"><CircleAlert aria-hidden="true" /><div><strong>Scrapal could not reach its API</strong><span>{connectionError.message}. Check the API service, then try again.</span></div><button className="button secondary" onClick={refresh}>Retry</button></div>}

        <AnimatePresence mode="wait">
          <motion.div key={view} className="view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>
            {view === 'overview' && <Overview activeRun={activeRun} sources={sources.data ?? []} runs={runs.data ?? []} documents={documents.data ?? []} sourceMap={sourceMap} onInspect={setSelectedRunId} />}
            {view === 'sources' && <Sources sources={sources.data ?? []} runs={runs.data ?? []} onRun={(run) => { refresh(); setSelectedRunId(run.id) }} onInspect={setSelectedRunId} onAdd={() => setNewSource(true)} />}
            {view === 'knowledge' && <Knowledge collectionId={scope} documents={documents.data ?? []} />}
            {view === 'course-intelligence' && <CourseIntelligence collectionId={scope} onOpenSources={() => setView('sources')} />}
            {view === 'course-gallery' && <CourseGallery collectionId={scope} />}
            {view === 'retrieval-lab' && <RetrievalLab collectionId={scope} />}
            {view === 'observability' && <Observability onInspect={setSelectedRunId} />}
            {view === 'reviews' && <Reviews proposals={proposals.data ?? []} onChanged={refresh} />}
            {view === 'settings' && <Settings system={system.data} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {agentOpen && <AgentPanel collectionId={scope} onClose={() => setAgentOpen(false)} />}
      </AnimatePresence>
      {agentOpen && <button className="agent-backdrop" onClick={() => setAgentOpen(false)} aria-hidden="true" tabIndex={-1} />}

      <AnimatePresence>
        {newSource && <AddSource collectionId={scope ?? collections.data?.[0]?.id} onClose={() => setNewSource(false)} onCreated={() => { setNewSource(false); refresh(); setView('sources') }} />}
      </AnimatePresence>
      <AnimatePresence>
        {selectedRunId && <RunMonitor runId={selectedRunId} onClose={closeRunMonitor} />}
      </AnimatePresence>
      {navOpen && <button className="backdrop nav-backdrop" onClick={() => setNavOpen(false)} aria-label="Close navigation backdrop" />}
    </div>
   </MotionConfig>
  )
}

function Overview({ activeRun, sources, runs, documents, sourceMap, onInspect }: { activeRun?: Run; sources: Source[]; runs: Run[]; documents: { id: string }[]; sourceMap: Map<string, Source>; onInspect: (id: string) => void }) {
  const [activityFilter, setActivityFilter] = useState<'all' | 'live' | 'attention' | 'completed'>('all')
  const liveRuns = runs.filter(isLiveRun)
  const attentionRuns = runs.filter((run) => run.status === 'failed' || run.issues_count > 0)
  const attentionSourceMap = new Map<string, Run>()
  attentionRuns.forEach((run) => {
    const sourceKey = sourceMap.get(run.source_id)?.name.trim().toLocaleLowerCase() || run.source_id
    if (!attentionSourceMap.has(sourceKey)) attentionSourceMap.set(sourceKey, run)
  })
  const attentionSources = [...attentionSourceMap.values()]
  const visibleRuns = runs.filter((run) => activityFilter === 'all'
    || (activityFilter === 'live' && isLiveRun(run))
    || (activityFilter === 'attention' && (run.status === 'failed' || run.issues_count > 0))
    || (activityFilter === 'completed' && run.status === 'completed'))
  const exceptions = runs.reduce((total, run) => total + run.issues_count, 0)
  return <div className="overview-console">
    <div className="overview-command-grid">
      <RunPath run={activeRun} onInspect={activeRun ? () => onInspect(activeRun.id) : undefined} />
      <aside className="operations-brief" aria-labelledby="operations-brief-title">
        <header><div><span className={liveRuns.length ? 'brief-live' : 'brief-idle'} aria-hidden="true" /><p>Operations brief</p></div><strong>{liveRuns.length ? `${liveRuns.length} live` : 'Quiet'}</strong></header>
        <div className={`brief-verdict ${attentionRuns.length ? 'attention' : 'clear'}`}>
          {attentionRuns.length ? <CircleAlert aria-hidden="true" /> : <CircleCheckBig aria-hidden="true" />}
          <div><strong>{attentionSources.length ? `${attentionSources.length} source${attentionSources.length === 1 ? '' : 's'} show exceptions` : 'No blocked work'}</strong><span>{attentionSources.length ? 'Review the latest affected run for each source.' : 'Workers and recent runs have no unresolved exceptions.'}</span></div>
        </div>
        <dl className="brief-metrics">
          <div><dt>Sources</dt><dd>{sources.length}</dd></div>
          <div><dt>Evidence</dt><dd>{documents.length}</dd></div>
          <div><dt>Exceptions</dt><dd>{exceptions}</dd></div>
        </dl>
        <div className="brief-queue">
          <span>Priority queue</span>
          {attentionSources.slice(0, 3).map((run) => <button key={run.id} onClick={() => onInspect(run.id)}><span><strong>{sourceMap.get(run.source_id)?.name ?? 'Unknown source'}</strong><small>{run.status === 'failed' ? 'Latest run failed' : `${run.issues_count} exception${run.issues_count === 1 ? '' : 's'} in latest affected run`}</small></span><ChevronRight size={ICON.sm} /></button>)}
          {!attentionSources.length && <p>New failures and policy exceptions will appear here.</p>}
        </div>
      </aside>
    </div>
    <section className="command-metrics" aria-label="Workspace operating metrics">
      <article><span><Radio aria-hidden="true" /></span><div><small>Active workload</small><strong>{liveRuns.length}</strong><p>{liveRuns.length ? 'crawler runs in progress' : 'no runs in progress'}</p></div></article>
      <article><span><Globe2 aria-hidden="true" /></span><div><small>Source estate</small><strong>{sources.length}</strong><p>connected inputs</p></div></article>
      <article><span><Archive aria-hidden="true" /></span><div><small>Searchable evidence</small><strong>{documents.length}</strong><p>current documents</p></div></article>
      <article className={exceptions ? 'attention' : ''}><span><CircleAlert aria-hidden="true" /></span><div><small>Recorded exceptions</small><strong>{exceptions}</strong><p>across retained runs</p></div></article>
    </section>
    <section className="activity-panel">
      <div className="activity-heading"><div><h2>Run activity</h2><p>Open any run to inspect pages, retries, errors, and trace links.</p></div><div className="segmented-control" role="group" aria-label="Filter run activity">{(['all', 'live', 'attention', 'completed'] as const).map((filter) => <button key={filter} aria-pressed={activityFilter === filter} onClick={() => setActivityFilter(filter)}>{filter === 'all' ? `All ${runs.length}` : filter === 'live' ? `Live ${liveRuns.length}` : filter === 'attention' ? `Attention ${attentionRuns.length}` : `Completed ${runs.filter((run) => run.status === 'completed').length}`}</button>)}</div></div>
      <RunTable runs={visibleRuns.slice(0, 8)} sourceMap={sourceMap} onSelect={onInspect} />
      {!visibleRuns.length && <div className="inline-empty"><CircleCheckBig aria-hidden="true" /><span><strong>No runs in this view</strong><small>Choose another filter to inspect retained activity.</small></span></div>}
    </section>
  </div>
}

function Sources({ sources, runs, onRun, onInspect, onAdd }: { sources: Source[]; runs: Run[]; onRun: (run: Run) => void; onInspect: (id: string) => void; onAdd: () => void }) {
  const mutation = useMutation({ mutationFn: api.startRun, onSuccess: onRun })
  if (!sources.length) return <Empty icon={Globe2} title="Connect the first source" text="Add a public website, sitemap, Greenwich catalogue, or document collection." action="Add source" onAction={onAdd} />
  return <section className="source-grid" aria-label="Connected sources">
    {sources.map((source) => {
      const run = runs.find((item) => item.source_id === source.id)
      return <article className="source-card" key={source.id}>
        <div className="source-icon">{source.kind === 'document' ? <FileSearch /> : <Globe2 />}</div>
        <div className="source-main"><p className="eyebrow">{source.kind}</p><h2>{source.name}</h2><p>{source.url ?? 'Document uploads'}</p></div>
        <dl><div><dt>Last run</dt><dd>{source.last_run_at ? relativeDate(source.last_run_at) : 'Not run'}</dd></div><div><dt>State</dt><dd><Status status={run && run.status === 'queued' && !isLiveRun(run) ? 'worker_timeout' : run?.status ?? 'ready'} /></dd></div></dl>
        {source.kind !== 'document' && (run && isLiveRun(run)
          ? <button className="button live full" onClick={() => onInspect(run.id)}><Radio size={ICON.md} /> Watch live run</button>
          : <button className="button secondary full" disabled={mutation.isPending} onClick={() => mutation.mutate(source.id)}><Play size={ICON.md} /> Run now</button>)}
      </article>
    })}
  </section>
}

function Knowledge({ collectionId, documents }: { collectionId?: string; documents: { id: string; title: string; canonical_url: string; media_type: string; updated_at: string }[] }) {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const search = useQuery({ queryKey: ['search', submitted], queryFn: () => api.search(submitted, collectionId), enabled: !!submitted })
  return <div className="knowledge-layout">
    <section className="search-hero"><p className="eyebrow">Hybrid retrieval</p><h2>Find the evidence, not just the phrase.</h2><form onSubmit={(event) => { event.preventDefault(); setSubmitted(query) }}><Search aria-hidden="true" /><label className="sr-only" htmlFor="knowledge-query">Search knowledge</label><input id="knowledge-query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask about courses, requirements, fees…" /><button>Search</button></form></section>
    {search.isFetching && <p className="loading-line"><Sparkles /> Searching words and meaning…</p>}
    {search.data?.hits.map((hit: SearchHit) => <article className="result" key={hit.chunk_id}><div><p className="eyebrow">{hit.heading || 'Source passage'}</p><h3>{hit.title}</h3></div><p>{hit.excerpt}</p><a href={hit.url} target="_blank" rel="noreferrer">Open source <ArrowRight size={ICON.sm} /></a></article>)}
    {!submitted && <section className="panel"><div className="section-heading"><div><p className="eyebrow">Indexed material</p><h2>Latest documents</h2></div></div>{documents.slice(0, 8).map((doc) => <div className="document-row" key={doc.id}><Database /><div><strong>{doc.title}</strong><small>{doc.media_type} · {relativeDate(doc.updated_at)}</small></div><a href={doc.canonical_url} target="_blank" rel="noreferrer" aria-label={`Open ${doc.title}`}><ChevronRight /></a></div>)}</section>}
  </div>
}

const courseFields = [
  'title',
  'award',
  'level',
  'campuses',
  'study_modes',
  'durations',
  'intake_months',
  'fees',
  'entry_requirements',
  'english_requirements',
  'application_documents',
  'application_routes',
  'deadlines',
] as const

function CourseIntelligence({ collectionId, onOpenSources }: { collectionId?: string; onOpenSources: () => void }) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<'all' | CourseRecord['status']>('all')
  const [selectedId, setSelectedId] = useState<string>()
  const [note, setNote] = useState('Reviewed against the captured source evidence.')
  const overview = useQuery({
    queryKey: ['course-intelligence', 'overview', collectionId],
    queryFn: () => api.courseIntelligenceOverview(collectionId),
  })
  const records = useQuery({
    queryKey: ['course-intelligence', 'records', collectionId, filter],
    queryFn: () => api.courseRecords(collectionId, filter === 'all' ? undefined : filter),
  })
  const selected = records.data?.find((record) => record.id === selectedId) ?? records.data?.[0]
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['course-intelligence'] })
  const publish = useMutation({ mutationFn: (id: string) => api.publishCourseRecord(id, note), onSuccess: refresh })
  const reject = useMutation({ mutationFn: (id: string) => api.rejectCourseRecord(id, note), onSuccess: refresh })
  const summary = overview.data

  return <div className="course-intelligence">
    <section className="course-command">
      <div><p className="eyebrow">University domain pack · evidence control</p><h2>Know what is complete before students rely on it.</h2><p>Scrapal turns each course page into typed facts, then keeps every value attached to the exact excerpt that supports it.</p></div>
      <div className="coverage-orbit" aria-label={`${Math.round((summary?.average_coverage ?? 0) * 100)} percent average required-field coverage`}>
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="48" /><circle className="coverage-live" cx="60" cy="60" r="48" pathLength="100" strokeDasharray={`${(summary?.average_coverage ?? 0) * 100} 100`} /></svg>
        <span><strong>{Math.round((summary?.average_coverage ?? 0) * 100)}%</strong><small>field coverage</small></span>
      </div>
    </section>
    <section className="course-tally" aria-label="Course intelligence status">
      <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}><strong>{summary?.total ?? 0}</strong><span>All courses</span></button>
      <button className={filter === 'published' ? 'active' : ''} onClick={() => setFilter('published')}><strong>{summary?.published ?? 0}</strong><span>Published</span></button>
      <button className={filter === 'review' ? 'active' : ''} onClick={() => setFilter('review')}><strong>{summary?.review ?? 0}</strong><span>Need review</span></button>
      <button className={filter === 'rejected' ? 'active' : ''} onClick={() => setFilter('rejected')}><strong>{summary?.rejected ?? 0}</strong><span>Rejected</span></button>
    </section>
    <section className="institution-spine">
      <h3>Coverage by university</h3>
      <ul>
        {overview.data?.by_institution.map((row) => (
          <li key={row.institution_id ?? 'none'}>
            <div>
              <strong>{row.name}</strong>
              {row.country_code && <span className="country">{row.country_code}</span>}
            </div>
            <Meter value={row.average_coverage * 100} />
            <span className="counts">
              {row.published} published · {row.review} in review
            </span>
          </li>
        ))}
      </ul>
    </section>
    {!records.isLoading && !records.data?.length && <Empty icon={GraduationCap} title="No course records have been extracted" text="Open Sources and run a Greenwich connector. Course records appear here after pages reach the extraction stage." action="Open sources" onAction={onOpenSources} />}
    {records.isLoading && <div className="loading-line"><Radio /> Loading course evidence…</div>}
    {records.data?.length ? <div className="course-workbench">
      <section className="course-index" aria-label="Extracted courses">
        <header><div><p className="eyebrow">Coverage spine</p><h2>{records.data.length} course{records.data.length === 1 ? '' : 's'}</h2></div><small>Select a course to inspect its evidence</small></header>
        <div>{records.data.map((record) => {
          const coverage = Math.round((record.validation_json.coverage ?? 0) * 100)
          return <button className={selected?.id === record.id ? 'selected' : ''} key={record.id} onClick={() => setSelectedId(record.id)}>
            <span className={`course-state ${record.status}`}><GraduationCap /></span>
            <span><strong>{String(record.data.title ?? 'Untitled course')}</strong><small>{String(record.data.level ?? 'Unknown level')} · revision {record.revision}</small></span>
            <span className="coverage-meter"><Meter value={coverage} tone={coverage === 100 ? 'done' : 'active'} label={`${coverage}% field coverage`} /><small>{coverage}%</small></span>
            <ChevronRight />
          </button>
        })}</div>
      </section>
      {selected && <CourseEvidenceLedger record={selected} note={note} setNote={setNote} publish={() => publish.mutate(selected.id)} reject={() => reject.mutate(selected.id)} busy={publish.isPending || reject.isPending} error={publish.error?.message ?? reject.error?.message} />}
    </div> : null}
  </div>
}

function CourseEvidenceLedger({ record, note, setNote, publish, reject, busy, error }: { record: CourseRecord; note: string; setNote: (value: string) => void; publish: () => void; reject: () => void; busy: boolean; error?: string }) {
  const evidence = record.evidence.fields ?? {}
  const missing = new Set(record.validation_json.missing_fields ?? [])
  const requiredEvidenceMissing = ['title', 'award', 'level', 'campuses', 'durations', 'intake_months', 'fees', 'entry_requirements'].some((field) => !(evidence[field]?.length))
  return <section className="course-ledger" aria-labelledby="course-ledger-title">
    <header>
      <div><p className="eyebrow">Evidence ledger · {record.extractor_version}</p><h2 id="course-ledger-title">{String(record.data.title ?? 'Course record')}</h2><a href={record.external_id} target="_blank" rel="noreferrer">Open captured source <ExternalLink size={ICON.sm} /></a></div>
      <Status status={record.status} />
    </header>
    {(record.validation_json.review_reasons?.length ?? 0) > 0 && <div className="review-callout"><AlertTriangle /><div><strong>Review before publication</strong><p>{record.validation_json.review_reasons?.join(' · ')}</p></div></div>}
    <ol className="field-ledger">{courseFields.map((field) => {
      const refs = evidence[field] ?? []
      const value = field === 'campuses' ? record.data[field] ?? record.data.locations : record.data[field]
      return <li className={missing.has(field) || !valuePresent(value) ? 'missing' : 'supported'} key={field}>
        <span className="field-pin">{missing.has(field) || !valuePresent(value) ? <CircleAlert /> : <Check />}</span>
        <div className="field-value"><small>{field.replaceAll('_', ' ')}</small><strong>{formatCourseValue(field, value)}</strong></div>
        <div className="field-proof">{refs.length ? <><p>{refs[0].excerpt}</p><small>{refs[0].method}{refs[0].section ? ` · ${refs[0].section}` : ''} · {Math.round(refs[0].confidence * 100)}% confidence</small></> : <><p>No supporting excerpt captured.</p><small>Required operator review</small></>}</div>
      </li>
    })}</ol>
    <div className="ledger-actions">
      <label>Review note<textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      {error && <p className="inline-error">{error}</p>}
      <div><button className="button secondary" disabled={busy || note.trim().length < 3} onClick={reject}>Reject record</button><button className="button primary" disabled={busy || note.trim().length < 3 || missing.size > 0 || requiredEvidenceMissing || record.validation_json.coverage !== 1 || (record.validation_json.contradictions?.length ?? 0) > 0} onClick={publish}><Check size={ICON.md} /> Publish evidence</button></div>
    </div>
  </section>
}

function valuePresent(value: unknown) { return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== '' }
function formatCourseValue(field: string, value: unknown) {
  if (!valuePresent(value)) return 'Not captured'
  if (field === 'fees' && Array.isArray(value)) return value.map((fee) => { const item = fee as Record<string, unknown>; const label = String(item.label ?? item.residency ?? 'Fee'); const raw = (item.raw_values ?? item.values) as string[] | undefined; return `${label}: ${item.currency === 'GBP' && item.amount ? `£${Number(item.amount).toLocaleString()}` : raw?.join(' / ') ?? 'Amount not captured'}` }).join(' · ')
  if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' · ')
  return String(value)
}

function RetrievalLab({ collectionId }: { collectionId?: string }) {
  const [query, setQuery] = useState('Which computer science masters courses have a January intake?')
  const [mode, setMode] = useState<'full_text' | 'semantic' | 'hybrid'>('hybrid')
  const [includeDrafts, setIncludeDrafts] = useState(false)
  const [generate, setGenerate] = useState(true)
  const profiles = useQuery({ queryKey: ['retrieval-profiles'], queryFn: api.retrievalProfiles })
  const run = useMutation({
    mutationFn: () => api.runRetrieval({
      query,
      collection_id: collectionId ?? null,
      mode,
      include_drafts: includeDrafts,
      generate_answer: generate,
      limit: 10,
      filters: {},
    }),
  })
  const result = run.data
  const submit = (event: FormEvent) => { event.preventDefault(); if (query.trim()) run.mutate() }
  return <div className="retrieval-lab">
    <section className="lab-command">
      <div><p className="eyebrow">Super-admin evidence workbench</p><h2>See why an answer earns trust.</h2><p>Inspect exact records, lexical matches, semantic neighbours, fusion, and sentence support using the same pipeline as Ask Scrapal.</p></div>
      <div className="profile-stamp"><span className={profiles.data?.[0]?.healthy ? 'healthy' : 'degraded'} /><small>Active embedding profile</small><strong>{profiles.data?.find((profile) => profile.active)?.model ?? 'Loading profile…'}</strong><code>768 dimensions · isolated</code></div>
    </section>
    <form className="lab-query" onSubmit={submit}>
      <label><span>Research question</span><textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={2} /></label>
      <div className="lab-controls">
        <label>Retrieval mode<select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="hybrid">Hybrid</option><option value="full_text">Full text</option><option value="semantic">Semantic</option></select></label>
        <label className="lab-check"><input type="checkbox" checked={includeDrafts} onChange={(event) => setIncludeDrafts(event.target.checked)} /><span>Include drafts</span></label>
        <label className="lab-check"><input type="checkbox" checked={generate} onChange={(event) => setGenerate(event.target.checked)} /><span>Validate an answer</span></label>
        <button className="button primary" disabled={run.isPending || !query.trim()}><Search size={ICON.md} />{run.isPending ? 'Tracing evidence…' : 'Run trace'}</button>
      </div>
      {run.error && <p className="inline-error">{run.error.message}</p>}
    </form>
    {!result && !run.isPending && <section className="lab-empty"><Microscope /><div><strong>No trace selected</strong><p>Run a question to reveal how three evidence lanes converge into a grounded context.</p></div></section>}
    {run.isPending && <section className="lab-loading" aria-live="polite"><span /><div><strong>Planning and retrieving</strong><p>Structured facts, lexical ranking, and the active embedding profile are being evaluated.</p></div></section>}
    {result && <RetrievalTrace run={result} />}
  </div>
}

type RetrievalCandidateRow = {
  id: string
  title: string
  detail: string
  excerpt?: string
  url?: string
  structuredRank?: number
  lexicalRank?: number
  semanticRank?: number
  fusedRank?: number
  fusedScore?: number
  included: boolean
}

function RetrievalTrace({ run }: { run: RetrievalRun }) {
  const candidates = useMemo(() => retrievalCandidateRows(run), [run])
  const [scope, setScope] = useState<'context' | 'top' | 'all'>('context')
  const [selectedId, setSelectedId] = useState<string>()
  const packedCandidates = candidates.filter((candidate) => candidate.included)
  const visibleCandidates = scope === 'context' ? packedCandidates : scope === 'top' ? candidates.slice(0, 15) : candidates
  const selectedCandidate = visibleCandidates.find((candidate) => candidate.id === selectedId) ?? visibleCandidates[0]
  const columns = useMemo<ColumnDef<RetrievalCandidateRow>[]>(() => [
    { accessorKey: 'title', header: 'Evidence', cell: ({ row }) => <button className="evidence-cell" aria-pressed={selectedId === row.original.id} onClick={() => setSelectedId(row.original.id)}><strong>{row.original.title}</strong><small>{row.original.detail}</small></button> },
    { accessorKey: 'structuredRank', header: 'Structured', cell: ({ getValue }) => <Rank value={getValue<number | undefined>()} /> },
    { accessorKey: 'lexicalRank', header: 'Lexical', cell: ({ getValue }) => <Rank value={getValue<number | undefined>()} /> },
    { accessorKey: 'semanticRank', header: 'Semantic', cell: ({ getValue }) => <Rank value={getValue<number | undefined>()} /> },
    { accessorKey: 'fusedRank', header: 'Fused', cell: ({ row, getValue }) => <div className="fused-rank"><Rank value={getValue<number | undefined>()} /><small>{row.original.fusedScore?.toFixed(4) ?? '—'}</small></div> },
    { accessorKey: 'included', header: 'Decision', cell: ({ getValue }) => getValue<boolean>() ? <span className="decision included"><Check /> Included</span> : <span className="decision excluded"><X /> Excluded</span> },
  ], [selectedId])
  const table = useReactTable({ data: visibleCandidates, columns, getCoreRowModel: getCoreRowModel() })
  return <div className="retrieval-trace">
    <section className="plan-strip">
      <InterpretedQuery plan={readPlan(run.query_plan)} />
      <dl aria-label="Retrieval timing">{Object.entries(run.timings_json).map(([name, value]) => <div key={name}><dt>{name.replace('_ms', '')}</dt><dd>{formatDuration(Number(value))}</dd></div>)}</dl>
    </section>
    <section className="ranking-workbench" aria-labelledby="ranking-title">
      <div className="section-heading ranking-heading"><div><p className="eyebrow">Retrieval decision matrix</p><h2 id="ranking-title">Evidence ranking</h2><p>Start with answer context. Expand only when investigating why evidence was excluded.</p></div><span>{run.context_json.length} of {candidates.length} packed</span></div>
      <div className="ranking-toolbar"><div className="segmented-control" role="group" aria-label="Choose evidence scope"><button aria-pressed={scope === 'context'} onClick={() => setScope('context')}>Answer context {candidates.filter((candidate) => candidate.included).length}</button><button aria-pressed={scope === 'top'} onClick={() => setScope('top')}>Top ranked {Math.min(15, candidates.length)}</button><button aria-pressed={scope === 'all'} onClick={() => setScope('all')}>All candidates {candidates.length}</button></div><p>{scope === 'context' ? 'These passages were sent to the answer model.' : scope === 'top' ? 'Best fused and single-lane candidates.' : 'Full diagnostic set. Use only for deep investigation.'}</p></div>
      <div className="ranking-table-wrap" tabIndex={0} role="region" aria-label="Scrollable retrieval rankings">
        <table className="ranking-table">
          <caption>Candidate evidence ranked independently by structured, lexical and semantic retrieval, followed by fused rank and inclusion decision.</caption>
          <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th scope="col" key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map((row) => <tr className={row.original.included ? 'included' : ''} key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {selectedCandidate && <aside className="candidate-inspector" aria-label="Selected evidence details"><div><small>Selected evidence</small><strong>{selectedCandidate.title}</strong><p>{selectedCandidate.excerpt ?? selectedCandidate.detail}</p></div><dl><div><dt>Structured</dt><dd>{selectedCandidate.structuredRank ? `#${selectedCandidate.structuredRank}` : '—'}</dd></div><div><dt>Lexical</dt><dd>{selectedCandidate.lexicalRank ? `#${selectedCandidate.lexicalRank}` : '—'}</dd></div><div><dt>Semantic</dt><dd>{selectedCandidate.semanticRank ? `#${selectedCandidate.semanticRank}` : '—'}</dd></div><div><dt>Fused</dt><dd>{selectedCandidate.fusedRank ? `#${selectedCandidate.fusedRank}` : '—'}</dd></div></dl>{selectedCandidate.url && <a href={selectedCandidate.url} target="_blank" rel="noreferrer">Open evidence <ExternalLink size={ICON.sm} /></a>}</aside>}
      <p className="ranking-note"><strong>RRF, k=60.</strong> Rank positions are combined because lexical and semantic scores use different scales.</p>
    </section>
    <section className="validation-ledger">
      <div><p className="eyebrow">Answer validation</p><h2>{run.abstention_reason ? 'No supported answer' : 'Grounded answer'}</h2><p className={run.abstention_reason ? 'lab-abstention' : ''}>{run.generated_answer ?? (run.abstention_reason ? `Scrapal stopped because ${run.abstention_reason.replaceAll('_', ' ')}.` : 'Answer generation was not requested.')}</p>{run.answer_model && <small>Answer model · {run.answer_model}</small>}</div>
      <ol>{run.citation_results.map((item, index) => <li className={item.supported ? 'supported' : 'withheld'} key={index}>{item.supported ? <Check /> : <X />}<div><strong>{item.supported ? 'Emitted' : 'Withheld'}</strong><p>{item.sentence}</p><small>{item.supported ? `Evidence ${item.citations.map((citation) => `[${citation}]`).join(' ')}` : item.reason?.replaceAll('_', ' ')}</small></div></li>)}</ol>
    </section>
  </div>
}

function Rank({ value }: { value?: number }) {
  return value ? <span className="rank-value">#{value}</span> : <span className="rank-empty" aria-label="Not ranked">—</span>
}

function retrievalCandidateRows(run: RetrievalRun): RetrievalCandidateRow[] {
  const rows = new Map<string, RetrievalCandidateRow>()
  const add = (items: Record<string, unknown>[], field: 'structuredRank' | 'lexicalRank' | 'semanticRank') => items.forEach((item, index) => {
    const id = candidateId(item, `${field}-${index}`)
    const existing = rows.get(id) ?? { id, title: candidateTitle(item), detail: candidateDetail(item), included: false }
    hydrateCandidate(existing, item)
    existing[field] = index + 1
    rows.set(id, existing)
  })
  add(run.structured_matches, 'structuredRank')
  add(run.lexical_candidates, 'lexicalRank')
  add(run.vector_candidates, 'semanticRank')
  run.fused_candidates.forEach((item, index) => {
    const raw = item as unknown as Record<string, unknown>
    const id = candidateId(raw, `fused-${index}`)
    const existing = rows.get(id) ?? { id, title: candidateTitle(raw), detail: candidateDetail(raw), included: false }
    hydrateCandidate(existing, raw)
    existing.fusedRank = index + 1
    existing.fusedScore = Number(raw.fused_score ?? raw.score ?? 0)
    rows.set(id, existing)
  })
  const included = new Set(run.context_json.map((item) => item.chunk_id))
  rows.forEach((row) => { row.included = included.has(row.id) })
  return [...rows.values()].sort((a, b) => Number(b.included) - Number(a.included) || (a.fusedRank ?? 999) - (b.fusedRank ?? 999) || Math.min(a.structuredRank ?? 999, a.lexicalRank ?? 999, a.semanticRank ?? 999) - Math.min(b.structuredRank ?? 999, b.lexicalRank ?? 999, b.semanticRank ?? 999))
}

function hydrateCandidate(candidate: RetrievalCandidateRow, item: Record<string, unknown>) {
  candidate.url ??= typeof item.url === 'string' ? item.url : typeof item.canonical_url === 'string' ? item.canonical_url : undefined
  candidate.excerpt ??= typeof item.excerpt === 'string' ? item.excerpt : typeof item.content === 'string' ? item.content.slice(0, 420) : undefined
}

function candidateId(item: Record<string, unknown>, fallback: string) {
  return String(item.chunk_id ?? item.record_id ?? item.external_id ?? item.title ?? fallback)
}

function candidateTitle(item: Record<string, unknown>) {
  return String(item.title ?? item.external_id ?? item.schema ?? 'Evidence match')
}

function candidateDetail(item: Record<string, unknown>) {
  const heading = item.heading ?? item.schema ?? item.document_id
  return String(heading ?? 'Published evidence')
}

function Reviews({ proposals, onChanged }: { proposals: { id: string; title: string; action_type: string; rationale: string; risk: string; status: string }[]; onChanged: () => void }) {
  const approve = useMutation({ mutationFn: api.approveProposal, onSuccess: onChanged })
  const reject = useMutation({ mutationFn: api.rejectProposal, onSuccess: onChanged })
  const pending = proposals.filter((proposal) => proposal.status === 'pending')
  if (!pending.length) return <Empty icon={ShieldCheck} title="Nothing needs review" text="Low-confidence changes and agent-proposed actions will wait here before they can affect your workspace." />
  return <section className="review-stack">{pending.map((proposal) => <article className="review-card" key={proposal.id}><div className={`risk ${proposal.risk}`}><CircleAlert /> {proposal.risk} risk</div><p className="eyebrow">Agent proposal · {proposal.action_type}</p><h2>{proposal.title}</h2><p>{proposal.rationale}</p><div className="review-actions"><button className="button secondary" disabled={reject.isPending} onClick={() => reject.mutate(proposal.id)}>Reject</button><button className="button primary" disabled={approve.isPending} onClick={() => approve.mutate(proposal.id)}><Check size={ICON.md} /> Approve action</button></div></article>)}</section>
}

function Settings({ system }: { system?: { ollama: { status: string; version?: string; models?: string[]; detail?: string } } }) {
  const ollamaState = system?.ollama.status
  return <div className="settings-grid"><section className="panel"><p className="eyebrow">Local intelligence</p><h2>Ollama</h2><div className="health-detail"><span className={ollamaState === 'ok' ? 'healthy' : ollamaState === 'degraded' ? 'degraded' : 'unhealthy'} /><div><strong>{ollamaState === 'ok' ? `Ready · ${system?.ollama.version}` : ollamaState === 'degraded' ? 'Connected · chat degraded' : 'Not connected'}</strong><p>{ollamaState === 'degraded' ? system?.ollama.detail : system?.ollama.models?.join(' · ') ?? system?.ollama.detail}</p></div></div></section><section className="panel"><p className="eyebrow">Safety policy</p><h2>Guardrails are active</h2><ul className="check-list"><li><Check /> Private network requests blocked</li><li><Check /> Robots rules respected</li><li><Check /> Agent actions require approval</li><li><Check /> Source text treated as untrusted</li></ul></section></div>
}

function Observability({ onInspect }: { onInspect: (id: string) => void }) {
  const queryClient = useQueryClient()
  const overview = useQuery({ queryKey: ['observability', 'overview'], queryFn: api.observabilityOverview, refetchInterval: 5000 })
  const runs = useQuery({ queryKey: ['observability', 'runs'], queryFn: api.observabilityRuns, refetchInterval: 3000 })
  const incidents = useQuery({ queryKey: ['observability', 'incidents'], queryFn: api.incidents, refetchInterval: 5000 })
  const workers = useQuery({ queryKey: ['observability', 'workers'], queryFn: api.workers, refetchInterval: 10_000 })
  const dependencies = useQuery({ queryKey: ['observability', 'dependencies'], queryFn: api.dependencies, refetchInterval: 15_000 })
  const acknowledge = useMutation({ mutationFn: api.acknowledgeIncident, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['observability'] }) })
  const resolve = useMutation({ mutationFn: api.resolveIncident, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['observability'] }) })
  const openGrafana = async () => window.open((await api.grafanaLink()).url, '_blank', 'noopener,noreferrer')
  const data = overview.data
  return <div className="observability-view">
    <section className="ops-command">
      <div><p className="eyebrow">Crawler control plane</p><h2>Every page leaves a pulse.</h2><p>Follow work from queue to evidence. Failures stay attached to the exact stage, URL, worker, and trace that produced them.</p></div>
      <button className="button secondary" onClick={openGrafana}><ExternalLink size={ICON.md} /> Open Grafana</button>
      
    </section>
    <section className="ops-metrics" aria-label="Crawler service levels">
      <article><small>Live runs</small><strong>{data?.active_runs ?? '—'}</strong><span>moving through the pipeline</span></article>
      <article><small>Pages observed</small><strong>{data?.pages_processed ?? '—'}</strong><span>durable stage timelines</span></article>
      <article><small>Page p95</small><strong>{data ? formatDuration(data.page_duration_p95_ms) : '—'}</strong><span>end-to-end processing</span></article>
      <article className={data?.open_incidents ? 'attention' : ''}><small>Open incidents</small><strong>{data?.open_incidents ?? '—'}</strong><span>{data?.stage_failures ?? 0} failed stages</span></article>
    </section>
    <div className="ops-grid">
      <section className="panel ops-runs"><div className="section-heading"><div><p className="eyebrow">Live workload</p><h2>Crawler runs</h2></div><span className="connection-chip"><Radio size={ICON.xs} /> Refreshing live</span></div>
        <div className="ops-run-list">{runs.data?.slice(0, 8).map((run) => <OpsRunRow key={run.id} run={run} onInspect={onInspect} />)}{!runs.data?.length && <p className="empty-row">No crawler runs recorded.</p>}</div>
      </section>
      <section className="panel ops-health"><div className="section-heading"><div><p className="eyebrow">Runtime</p><h2>Workers & dependencies</h2></div></div>
        <div className="dependency-list"><HealthRow icon={Server} label="Crawler workers" status={workers.data?.status ?? 'loading'} detail={`${workers.data?.workers.length ?? 0} reporting`} />{Object.entries(dependencies.data ?? {}).map(([name, value]) => <HealthRow key={name} icon={Database} label={name} status={value.status} detail={value.detail ?? 'Responding normally'} />)}</div>
      </section>
    </div>
    <section className="panel incident-panel"><div className="section-heading"><div><p className="eyebrow">Decision queue</p><h2>Incidents requiring attention</h2></div><span>{incidents.data?.filter((item) => item.status !== 'resolved').length ?? 0} open</span></div>
      <div className="incident-list">{incidents.data?.filter((item) => item.status !== 'resolved').map((incident) => <IncidentRow key={incident.id} incident={incident} onInspect={onInspect} onAcknowledge={() => acknowledge.mutate(incident.id)} onResolve={() => resolve.mutate(incident.id)} />)}{!incidents.data?.some((item) => item.status !== 'resolved') && <div className="no-issues"><CircleCheckBig /><div><strong>No open crawler incidents</strong><p>Worker loss, stalled runs, and failed stages will collect here.</p></div></div>}</div>
    </section>
  </div>
}

function OpsRunRow({ run, onInspect }: { run: ObservabilityRun; onInspect: (id: string) => void }) {
  const progress = Math.round(run.pages_processed / Math.max(run.pages_discovered, 1) * 100)
  return <button className="ops-run-row" onClick={() => onInspect(run.id)}><span className={`ops-node ${run.status}`}><Activity size={ICON.md} /></span><span><strong>{run.source_name}</strong><small>{run.connector} · {run.pages_processed}/{run.pages_discovered} pages</small></span><Meter value={progress} tone={run.status === 'failed' ? 'fail' : run.status === 'completed' ? 'done' : 'active'} label={`${run.pages_processed} of ${run.pages_discovered} pages`} /><Status status={run.status} warnings={run.issues_count} /><ChevronRight size={ICON.md} /></button>
}

function HealthRow({ icon: Icon, label, status, detail }: { icon: typeof Server; label: string; status: string; detail: string }) { const ok = status === 'ok'; return <div className="health-row"><span className={ok ? 'healthy' : status === 'loading' ? 'degraded' : 'unhealthy'}><Icon size={ICON.md} /></span><div><strong>{label}</strong><small>{detail}</small></div><b>{status}</b></div> }

function IncidentRow({ incident, onInspect, onAcknowledge, onResolve }: { incident: Incident; onInspect: (id: string) => void; onAcknowledge: () => void; onResolve: () => void }) { return <article className={`incident-row ${incident.severity}`}><AlertTriangle /><div><div><span>{incident.severity}</span><small>{incident.service} · {relativeDate(incident.last_seen_at)}</small></div><strong>{incident.summary}</strong><p>{incident.remediation}</p></div><div className="incident-actions">{incident.run_id && <button onClick={() => onInspect(incident.run_id!)}>Inspect run</button>}<button onClick={onAcknowledge}>Acknowledge</button><button onClick={onResolve}>Resolve</button></div></article> }

const WITHHELD_REASONS: Record<string, string> = {
  missing_citation: 'it cited no evidence',
  unknown_citation: 'it cited evidence that was never retrieved',
  insufficient_overlap: 'the evidence it cited did not support it',
}

function withheldNote(reasons: string[]) {
  const distinct = [...new Set(reasons.map((reason) => WITHHELD_REASONS[reason] ?? 'it could not be verified'))]
  const count = reasons.length === 1 ? '1 sentence was removed' : `${reasons.length} sentences were removed`
  return `${count} from this answer because ${distinct.join(', and ')}.`
}

function AgentPanel({ collectionId, onClose }: { collectionId?: string; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null)
  const mobile = useMediaQuery('(max-width: 760px)')
  const [conversation, setConversation] = useState<string>()
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState('Searching your knowledge')
  const [plan, setPlan] = useState<QueryPlanData>()
  const [messages, setMessages] = useState<AgentMessage[]>([])
  useDialog(panelRef, onClose, mobile)
  const updateAssistant = (id: string, update: (message: AgentMessage) => AgentMessage) => setMessages((items) => items.map((message) => message.id === id ? update(message) : message))
  const send = useMutation({ mutationFn: async ({ content, requestId }: { content: string; requestId: string }) => {
    let id = conversation
    if (!id) { id = (await api.createConversation(collectionId)).id; setConversation(id) }
    const generation = await api.sendMessage(id, content, requestId)
    const assistantId = `assistant-${generation.id}`
    setMessages((items) => [...items, { id: assistantId, role: 'assistant', content: '' }])
    await api.watchGeneration(id, generation.id, (event) => {
      if (event.type === 'retrieval.started') setPhase('Planning the evidence search')
      if (event.type === 'retrieval.completed') {
        setPhase(`Retrieved ${String(event.data.passages ?? 0)} passages`)
        setPlan(readPlan(event.data.plan))
      }
      if (event.type === 'generation.started') setPhase('Validating each answer sentence')
      if (event.type === 'answer.snapshot') updateAssistant(assistantId, (message) => ({ ...message, content: String(event.data.answer ?? message.content), citations: Array.isArray(event.data.citations) ? event.data.citations as AgentMessage['citations'] : message.citations }))
      if (event.type === 'answer.delta') updateAssistant(assistantId, (message) => ({ ...message, content: message.content + String(event.data.delta ?? '') }))
      if (event.type === 'citation') updateAssistant(assistantId, (message) => {
        const citation = { number: Number(event.data.number), title: String(event.data.title ?? 'Evidence'), url: event.data.url ? String(event.data.url) : undefined }
        return { ...message, citations: [...(message.citations ?? []).filter((item) => item.number !== citation.number), citation] }
      })
      // A sentence the validator dropped leaves a shorter answer that otherwise
      // reads as complete. Say so instead of letting the gap pass unnoticed.
      if (event.type === 'answer.withheld') updateAssistant(assistantId, (message) => ({ ...message, withheld: [...(message.withheld ?? []), String(event.data.reason ?? 'unsupported')] }))
      if (event.type === 'abstained') updateAssistant(assistantId, (message) => ({ ...message, content: String(event.data.answer ?? 'I cannot answer from the published evidence.') }))
      if (event.type === 'failed') throw new Error('Local answer generation failed. The crawl and indexed evidence remain available.')
    })
    return generation
  } })
  const dispatch = () => { if (send.isPending) return; const value = input.trim(); if (!value) return; const requestId = uuid(); setMessages((items) => [...items, { id: `user-${requestId}`, role: 'user', content: value }]); setInput(''); setPhase('Searching your knowledge'); setPlan(undefined); send.mutate({ content: value, requestId }) }
  const submit = (event: FormEvent) => { event.preventDefault(); dispatch() }
  // Enter sends, shift+enter starts a line. isComposing keeps an IME candidate
  // list from being mistaken for a finished question.
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return; event.preventDefault(); dispatch() }
  return <motion.aside ref={panelRef} className="agent-panel" initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 50, opacity: 0 }} role={mobile ? 'dialog' : undefined} aria-modal={mobile ? 'true' : undefined} aria-label="Scrapal agent"><header><div className="agent-avatar"><Sparkles /></div><div><p className="eyebrow">Grounded in your sources</p><h2>Ask Scrapal</h2></div><button className="icon-button" onClick={onClose} aria-label="Close agent"><X /></button></header><div className="messages" aria-live="polite">{messages.length === 0 && <div className="agent-empty"><MessageSquareText /><h3>Research with receipts.</h3><p>Ask across your collections. Every factual answer links back to its evidence.</p><button onClick={() => setInput('Which courses have a January intake?')}>Try “Which courses have a January intake?”</button></div>}{messages.map((message) => <div className={`message ${message.role}`} key={message.id}><p>{message.content}</p>{message.citations?.length ? <div className="citations">{message.citations.map((citation) => citation.url ? <a key={citation.number} href={citation.url} target="_blank" rel="noreferrer">[{citation.number}] {citation.title}</a> : <span key={citation.number}>[{citation.number}] {citation.title}</span>)}</div> : null}{message.withheld?.length ? <p className="withheld-note"><ShieldCheck size={ICON.xs} aria-hidden="true" />{withheldNote(message.withheld)}</p> : null}</div>)}{send.isPending && <div className="agent-progress"><div className="thinking"><span /><span /><span /><em>{phase}</em></div><InterpretedQuery plan={plan} compact /></div>}{send.error && <p className="inline-error">{send.error.message}</p>}</div><form className="agent-composer" onSubmit={submit}><label className="sr-only" htmlFor="agent-input">Ask Scrapal</label><textarea id="agent-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} placeholder="Ask a cited question…" rows={3} enterKeyHint="send" /><button type="submit" aria-label="Send message" onMouseDown={(e) => e.preventDefault()} disabled={send.isPending || !input.trim()}><ArrowRight /></button></form></motion.aside>
}

function AddSource({ collectionId, onClose, onCreated }: { collectionId?: string; onClose: () => void; onCreated: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [kind, setKind] = useState<'university' | 'website' | 'sitemap' | 'document'>('university')
  const [name, setName] = useState('University of Greenwich')
  const [url, setUrl] = useState('https://www.gre.ac.uk/')
  const [objective, setObjective] = useState('Find every course and the fees, intakes, entry requirements, English requirements, application documents, deadlines, campuses, and scholarships a prospective student needs.')
  const [blueprint, setBlueprint] = useState<CrawlBlueprint>()
  const fields = ['title', 'award', 'level', 'campuses', 'study_modes', 'durations', 'intake_months', 'fees', 'entry_requirements', 'english_requirements', 'application_documents', 'deadlines', 'scholarships']
  const [requiredFields, setRequiredFields] = useState(fields)
  const create = useMutation({ mutationFn: api.createSource, onSuccess: onCreated })
  const preview = useMutation({
    mutationFn: () => api.previewBlueprint({ collection_id: collectionId, name, start_url: url, objective, domain_pack: kind === 'university' ? 'university' : 'generic', required_fields: kind === 'university' ? requiredFields : [], max_pages: 500 }),
    onSuccess: setBlueprint,
  })
  const launch = useMutation({
    mutationFn: async (scope: { include_patterns: string[]; exclude_patterns: string[]; max_pages: number; max_depth: number }) => {
      if (!blueprint) throw new Error('Preview the crawl plan first.')
      await api.updateBlueprint(blueprint.id, scope)
      await api.approveBlueprint(blueprint.id)
      return api.runBlueprint(blueprint.id)
    },
    onSuccess: onCreated,
  })
  useDialog(dialogRef, onClose)
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!collectionId) return
    if (kind === 'document') create.mutate({ collection_id: collectionId, name, kind: 'document', url: null, config: {} })
    else preview.mutate()
  }
  const toggleField = (field: string) => setRequiredFields((current) => current.includes(field) ? current.filter((item) => item !== field) : [...current, field])
  const error = create.error ?? preview.error ?? launch.error
  return <><button className="backdrop" onClick={onClose} aria-label="Close add source dialog" /><motion.div ref={dialogRef} className="dialog blueprint-dialog" role="dialog" aria-modal="true" aria-labelledby="add-source-title" initial={{ opacity: 0, scale: .98, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}><header><div><p className="eyebrow">{blueprint ? 'Crawl blueprint · preview' : 'New input · guided setup'}</p><h2 id="add-source-title">{blueprint ? 'Review before crawling' : 'Tell Scrapal what to find'}</h2><p>{blueprint ? 'Approve the proposed scope only when it matches your research objective.' : 'Start with a homepage and an outcome. Scrapal will propose a safe crawl plan.'}</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>{!blueprint ? <form onSubmit={submit}><div className="dialog-scroll"><fieldset><legend>Source type</legend><div className="choice-grid">{(['university', 'website', 'sitemap', 'document'] as const).map((item) => <label className={kind === item ? 'selected' : ''} key={item}><input type="radio" name="kind" value={item} checked={kind === item} onChange={() => { setKind(item); setBlueprint(undefined); if (item === 'university') { setName('University of Greenwich'); setUrl('https://www.gre.ac.uk/') } }} /><span>{item === 'university' ? <GraduationCap /> : item === 'document' ? <FileSearch /> : <Globe2 />}{item}</span></label>)}</div></fieldset><label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>{kind !== 'document' && <><label>Starting URL<input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://university.example/" required /></label><label>Research objective<textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={3} required minLength={12} /></label>{kind === 'university' && <fieldset><legend>Required evidence</legend><div className="field-contract">{fields.map((field) => <label key={field}><input type="checkbox" checked={requiredFields.includes(field)} onChange={() => toggleField(field)} /><span>{field.replaceAll('_', ' ')}</span></label>)}</div></fieldset>}</>}<p className="form-help">Preview samples representative public pages and crawl-policy metadata. It does not start a bulk crawl.</p>{!collectionId && <p className="inline-error">Create a collection before connecting a source.</p>}{error && <p className="inline-error">{error.message}</p>}</div><div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={preview.isPending || create.isPending || !collectionId || (kind !== 'document' && objective.trim().length < 12)}>{preview.isPending ? 'Sampling evidence…' : kind === 'document' ? 'Connect document source' : 'Preview crawl plan'}</button></div></form> : <BlueprintPreview blueprint={blueprint} onBack={() => setBlueprint(undefined)} onLaunch={(scope) => launch.mutate(scope)} busy={launch.isPending} error={error?.message} />}</motion.div></>
}

function BlueprintPreview({ blueprint, onBack, onLaunch, busy, error }: { blueprint: CrawlBlueprint; onBack: () => void; onLaunch: (scope: { include_patterns: string[]; exclude_patterns: string[]; max_pages: number; max_depth: number }) => void; busy: boolean; error?: string }) {
  const discovery = blueprint.discovery_json
  const typeCounts = Object.entries(discovery.page_type_counts ?? {}).sort((left, right) => right[1] - left[1])
  const projection = discovery.coverage_projection
  const fieldRates = Object.entries(projection?.field_rates ?? {}).sort((left, right) => left[1] - right[1])
  const [includePatterns, setIncludePatterns] = useState((blueprint.suggested_config.include_patterns ?? []).join('\n'))
  const [excludePatterns, setExcludePatterns] = useState((blueprint.suggested_config.exclude_patterns ?? []).join('\n'))
  const [maxPages, setMaxPages] = useState(blueprint.suggested_config.max_pages ?? 500)
  const [maxDepth, setMaxDepth] = useState(blueprint.suggested_config.max_depth ?? 2)
  const scope = { include_patterns: includePatterns.split('\n').map((value) => value.trim()).filter(Boolean), exclude_patterns: excludePatterns.split('\n').map((value) => value.trim()).filter(Boolean), max_pages: maxPages, max_depth: maxDepth }
  return <div className="blueprint-preview"><div className="dialog-scroll"><section className="blueprint-verdict"><span><CircleCheckBig /></span><div><small>Representative sample complete</small><strong>{discovery.sampled_pages ?? 0} pages sampled from {discovery.links_observed ?? 0} eligible links</strong><p>{discovery.sitemaps?.length ? `${discovery.sitemaps.length} sitemap${discovery.sitemaps.length === 1 ? '' : 's'} discovered.` : 'No sitemap advertised; Scrapal will follow eligible page links.'} Robots returned {discovery.robots_status ?? 'no response'}.</p></div><div className="projection-score" aria-label={`${Math.round((projection?.overall ?? 0) * 100)} percent projected field coverage`}><strong>{Math.round((projection?.overall ?? 0) * 100)}%</strong><span>projected</span></div></section><dl className="blueprint-metrics"><div><dt>Sample confidence</dt><dd>{projection?.confidence ?? 'low'}</dd></div><div><dt>Course samples</dt><dd>{projection?.pages ?? 0}</dd></div><div><dt>Required fields</dt><dd>{blueprint.required_fields.length}</dd></div><div><dt>Plan version</dt><dd>v{blueprint.version}</dd></div></dl><section className="blueprint-section"><header><div><small>Coverage projection</small><strong>Likely evidence gaps before a full crawl</strong></div><span>{projection?.basis?.replaceAll('_', ' ') ?? 'representative pages'}</span></header><div className="coverage-ledger">{fieldRates.map(([field, rate]) => <div key={field}><span>{field.replaceAll('_', ' ')}</span><Meter value={rate * 100} tone={rate >= .75 ? 'done' : rate >= .35 ? 'wait' : 'fail'} label={`${field.replaceAll('_', ' ')} found on ${Math.round(rate * 100)} percent of sampled pages`} /><strong>{Math.round(rate * 100)}%</strong></div>)}</div></section><section className="blueprint-section"><header><div><small>Discovery signals</small><strong>Page families available to the crawl</strong></div></header>{typeCounts.length ? <div className="page-type-grid">{typeCounts.slice(0, 8).map(([type, count]) => <div key={type}><strong>{count}</strong><span>{type.replaceAll('-', ' ')}</span></div>)}</div> : <p className="form-help">No classifiable navigation links were found in the planning sample.</p>}</section><section className="blueprint-section scope-editor"><header><div><small>Approved scope</small><strong>Edit the rules Scrapal will enforce</strong></div><span>Literal path fragments</span></header><div className="scope-fields"><label>Include paths<textarea rows={4} value={includePatterns} onChange={(event) => setIncludePatterns(event.target.value)} aria-describedby="scope-help" /></label><label>Exclude paths<textarea rows={4} value={excludePatterns} onChange={(event) => setExcludePatterns(event.target.value)} aria-describedby="scope-help" /></label></div><div className="scope-limits"><label>Maximum pages<input type="number" min={1} max={10000} value={maxPages} onChange={(event) => setMaxPages(Number(event.target.value))} /></label><label>Link depth<input type="number" min={0} max={10} value={maxDepth} onChange={(event) => setMaxDepth(Number(event.target.value))} /></label></div><p className="form-help" id="scope-help">One literal path fragment per line. These rules cannot execute code.</p></section>{discovery.warnings?.map((warning) => <p className="blueprint-warning" key={warning}><AlertTriangle /> {warning}</p>)}{error && <p className="inline-error">{error}</p>}</div><div className="dialog-actions"><button type="button" className="button secondary" onClick={onBack}>Edit objective</button><button type="button" className="button primary" onClick={() => onLaunch(scope)} disabled={busy || maxPages < 1 || maxPages > 10000 || maxDepth < 0 || maxDepth > 10}><Play /> {busy ? 'Saving scope…' : 'Approve scope & start'}</button></div></div>
}

function RunMonitor({ runId, onClose }: { runId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [activeRunId, setActiveRunId] = useState(runId)
  const initial = useQuery({ queryKey: ['run', activeRunId], queryFn: () => api.run(activeRunId) })
  const timeline = useQuery({ queryKey: ['timeline', activeRunId], queryFn: () => api.timeline(activeRunId), refetchInterval: 2000 })
  const [run, setRun] = useState<RunDetail>()
  const [connection, setConnection] = useState<'connecting' | 'live' | 'ended' | 'offline'>('connecting')
  const panelRef = useRef<HTMLElement>(null)
  useDialog(panelRef, onClose)

  useEffect(() => { if (initial.data) setRun(initial.data) }, [initial.data])
  useEffect(() => {
    const controller = new AbortController()
    setConnection('connecting')
    api.watchRun(activeRunId, (update) => {
      setRun(update)
      const terminal = ['completed', 'failed', 'cancelled'].includes(update.status)
      setConnection(terminal ? 'ended' : 'live')
      queryClient.setQueryData(['run', activeRunId], update)
      queryClient.invalidateQueries({ queryKey: ['runs'] })
      if (terminal) {
        queryClient.invalidateQueries({ queryKey: ['documents'] })
        queryClient.invalidateQueries({ queryKey: ['sources'] })
      }
    }, controller.signal).catch((error: Error) => {
      if (error.name !== 'AbortError') setConnection('offline')
    })
    return () => controller.abort()
  }, [activeRunId, queryClient])

  const cancel = useMutation({ mutationFn: api.cancelRun, onSuccess: (update) => setRun((current) => current ? { ...current, ...update } : current) })
  const retry = useMutation({
    mutationFn: api.retryRunIssues,
    onSuccess: (update) => {
      setRun(undefined)
      setConnection('connecting')
      setActiveRunId(update.id)
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    },
  })
  const resume = useMutation({
    mutationFn: api.startRun,
    onSuccess: (update) => {
      setRun(undefined)
      setConnection('connecting')
      setActiveRunId(update.id)
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    },
  })
  const total = Math.max(run?.pages_discovered ?? 0, 1)
  const checked = run?.pages_processed ?? 0
  const percent = run?.status === 'completed' ? 100 : Math.min(99, Math.round((checked / total) * 100))
  const elapsedSeconds = run?.started_at ? Math.max(1, (Date.now() - new Date(run.started_at).getTime()) / 1000) : 0
  const pagesPerMinute = checked && elapsedSeconds ? checked / elapsedSeconds * 60 : 0
  const etaMinutes = pagesPerMinute && run?.status === 'running' ? Math.max(1, Math.ceil((total - checked) / pagesPerMinute)) : 0
  const activity = run?.status === 'queued'
    ? 'Waiting for a worker to accept this run'
    : run?.status === 'running' && !run.pages_discovered
      ? 'Discovering pages from the source'
      : run?.status === 'running'
        ? `Fetching and indexing page ${Math.min(checked + 1, total)} of ${total}`
        : run?.status === 'completed'
          ? run.issues_count ? `Finished with ${run.issues_count} page warning${run.issues_count === 1 ? '' : 's'}` : 'Finished without page errors'
          : run?.status === 'cancelled' ? `Stopped safely after checking ${checked} page${checked === 1 ? '' : 's'}`
          : run?.status === 'failed' ? 'The run could not continue' : 'Loading run activity'

  return <>
    <button className="backdrop run-backdrop" onClick={onClose} aria-label="Close run monitor" />
    <motion.aside ref={panelRef} className="run-monitor" role="dialog" aria-modal="true" aria-labelledby="run-monitor-title" initial={{ x: 36, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 36, opacity: 0 }}>
      <header>
        <div><p className="eyebrow">On-demand crawl</p><h2 id="run-monitor-title">{run?.source_name ?? 'Live run'}</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Close live run"><X /></button>
      </header>
      <div className="run-monitor-scroll">
        <div className={`live-connection ${connection}`}><Radio size={ICON.sm} /><span>{connection === 'live' ? 'Live updates connected' : connection === 'connecting' ? 'Connecting to live updates' : connection === 'ended' ? 'Run finished' : 'Live connection interrupted'}</span></div>
        <section className="run-progress" aria-live="polite">
          <div className="run-progress-heading"><Status status={run?.status ?? 'queued'} warnings={run?.issues_count} /><strong>{percent}%</strong></div>
          <div className="progress-rail"><Meter value={percent} tone={run?.status === 'failed' ? 'fail' : percent === 100 ? 'done' : 'active'} label={`${percent}% of discovered pages checked`} /></div>
          <h3>{activity}</h3>
          <p>{run?.status === 'running' && pagesPerMinute ? `${pagesPerMinute.toFixed(1)} pages/minute · about ${etaMinutes} minute${etaMinutes === 1 ? '' : 's'} remaining` : run?.cancel_requested && run.status === 'running' ? 'Finishing the current page before stopping safely.' : run?.status === 'cancelled' ? 'Nothing was rolled back. Start this source again whenever you are ready.' : 'Scrapal keeps going when an individual page is missing or temporarily unavailable.'}</p>
        </section>
        <dl className="run-metrics">
          <div><dt>Pages checked</dt><dd>{checked}<small>of {run?.pages_discovered ?? 0}</small></dd></div>
          <div><dt>New documents</dt><dd>{run?.documents_created ?? 0}</dd></div>
          <div><dt>Policy skips</dt><dd>{run?.policy_skips_count ?? 0}</dd></div>
          <div><dt>Page errors</dt><dd className={run?.issues_count ? 'has-issues' : ''}>{run?.issues_count ?? 0}</dd></div>
        </dl>
        <EventTimeline events={timeline.data ?? []} runId={activeRunId} />
        {run?.status === 'failed' && run.error && <section className="fatal-error"><CircleAlert /><div><strong>Run stopped</strong><p>{run.error}</p></div></section>}
        <div className="run-controls">
          {run && ['queued', 'running'].includes(run.status) && <button className="button danger" disabled={cancel.isPending || run.cancel_requested} onClick={() => cancel.mutate(run.id)}><X size={ICON.md} />{run.cancel_requested ? 'Stopping safely…' : 'Stop crawl'}</button>}
          {run?.status === 'failed' && run.pages_processed < run.pages_discovered && <button className="button primary" disabled={resume.isPending} onClick={() => resume.mutate(run.source_id)}><Play size={ICON.md} />{resume.isPending ? 'Resuming…' : 'Resume crawl'}</button>}
          {run && !['queued', 'running'].includes(run.status) && run.issues.some((issue) => issue.stage !== 'policy') && <button className="button secondary" disabled={retry.isPending} onClick={() => retry.mutate(run.id)}><RotateCcw size={ICON.md} />{retry.isPending ? 'Starting retry…' : 'Retry failed pages'}</button>}
        </div>
        <section className="issue-feed">
          <div className="section-heading"><div><p className="eyebrow">Page-level feedback</p><h3>What happened</h3></div><span>{run?.issues.length ?? 0}</span></div>
          {!run?.issues.length && <div className="no-issues"><CircleCheckBig /><div><strong>No page issues reported</strong><p>Fetch, extraction, and indexing warnings will appear here as they happen.</p></div></div>}
          {run?.issues.map((issue) => <article className={`run-issue ${issue.stage}`} key={issue.id}>
            {issue.stage === 'policy' ? <ShieldCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
            <div><div><strong>{issue.stage}</strong>{issue.code && <code>{issue.code}</code>}{issue.retryable && <span>retryable</span>}</div><p>{issue.message}</p><a href={issue.url} target="_blank" rel="noreferrer">{issue.url}</a></div>
          </article>)}
        </section>
      </div>
    </motion.aside>
  </>
}

function EventTimeline({ events, runId }: { events: CrawlEvent[]; runId: string }) {
  const recent = events.slice(-12).reverse()
  const openGrafana = async (traceId?: string | null) => window.open((await api.grafanaLink(runId, traceId ?? undefined)).url, '_blank', 'noopener,noreferrer')
  return <section className="event-timeline">
    <div className="section-heading"><div><p className="eyebrow">Stage telemetry</p><h3>Live execution thread</h3></div><button className="text-action" onClick={() => openGrafana()}><ExternalLink size={ICON.sm} /> Grafana</button></div>
    {!recent.length && <div className="timeline-waiting"><Radio /><span><strong>Waiting for the first stage event</strong><small>The worker will report discovery, fetch, extraction, persistence, and indexing here.</small></span></div>}
    <ol>{recent.map((event) => <li key={event.id} className={event.outcome}>
      <span className="event-pin">{event.outcome === 'failed' ? <AlertTriangle /> : event.outcome === 'completed' ? <Check /> : event.outcome === 'policy_skipped' ? <ShieldCheck /> : <Activity />}</span>
      <div><div><strong>{event.stage.replaceAll('_', ' ')}</strong><Status status={event.outcome} /></div><p>{event.url ?? describeEvent(event)}</p><small>#{event.sequence} · {event.duration_ms == null ? 'in progress' : formatDuration(event.duration_ms)}{event.status_code ? ` · HTTP ${event.status_code}` : ''}{event.chunks_count ? ` · ${event.chunks_count} chunks` : ''}</small>{event.error_message && <em>{event.error_message}</em>}</div>
      {event.trace_id && <button onClick={() => openGrafana(event.trace_id)} aria-label={`Open trace for ${event.stage}`}><ExternalLink /></button>}
    </li>)}</ol>
  </section>
}

function describeEvent(event: CrawlEvent) { if (event.stage === 'run') return `Run ${event.outcome}`; if (event.stage === 'discovery') return 'Building the crawl frontier'; return `${event.stage} ${event.outcome}` }

function RunTable({ runs, sourceMap, onSelect }: { runs: Run[]; sourceMap: Map<string, Source>; onSelect: (id: string) => void }) { if (!runs.length) return <p className="empty-row">Runs will appear here after you start a source.</p>; return <div className="table-wrap"><table><thead><tr><th>Source</th><th>Status</th><th>Progress</th><th>Documents</th><th>Exceptions</th><th>Started</th></tr></thead><tbody>{runs.map((run) => <tr className="clickable-row" key={run.id} onClick={() => onSelect(run.id)}><td><button className="row-link">{sourceMap.get(run.source_id)?.name ?? 'Source'}</button></td><td><Status status={run.status === 'queued' && !isLiveRun(run) ? 'worker_timeout' : run.status} warnings={run.issues_count} /></td><td><Meter value={run.pages_processed / Math.max(run.pages_discovered, 1) * 100} tone={run.status === 'failed' ? 'fail' : run.status === 'completed' ? 'done' : 'active'} label={`${run.pages_processed} of ${run.pages_discovered} pages checked`} /><small>{run.pages_processed} / {run.pages_discovered} checked</small></td><td>{run.documents_created}</td><td>{run.issues_count ? `${run.issues_count} error${run.issues_count === 1 ? '' : 's'}` : run.policy_skips_count ? `${run.policy_skips_count} skipped` : '—'}</td><td>{relativeDate(run.created_at)}</td></tr>)}</tbody></table></div> }
function titleFor(view: View) { return { overview: 'Follow the knowledge thread', sources: 'Connected sources', knowledge: 'Search the evidence', 'course-intelligence': 'Turn course pages into trusted facts', 'course-gallery': 'Browse courses with receipts', 'retrieval-lab': 'Trace an answer back to evidence', observability: 'See where every crawl spends its time', reviews: 'Decisions waiting for you', settings: 'Workspace settings' }[view] }

export default App
