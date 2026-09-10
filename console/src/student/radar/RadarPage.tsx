// The Research Opportunity Radar.
//
// Three steps, deliberately separated: write or attach the work, review the
// fingerprint, then see what matches. The middle step is not decoration — it is
// where the reader sees the exact terms that will leave their device and can
// strike any of them out first. Collapsing it into one click would make the
// privacy promise unverifiable, which is the one thing this feature cannot
// afford.
import { useMutation } from '@tanstack/react-query'
import {
  ArrowRight, Banknote, Building2, CircleCheck, ExternalLink, FlaskConical, GraduationCap, Lightbulb,
  Lock, Paperclip, RotateCcw, Search, Upload, Users, X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { api, type LabMatch, type PositionMatch, type RadarResults } from '../../api'
import { Dots, EmptyState, ErrorBanner } from '../../brand'
import { ICON } from '../../lib'
import { linkTo } from '../../router'
import { useToast } from '../../toast'
import { FundingCard } from './FundingCard'
import { PersonCard, Reasons, Score } from './PersonCard'
import { TabList, TabPanel } from '../Tabs'
import { relativeDeadline, urgent } from './deadlines'
import { saveTerms } from './savedTerms'
import { fingerprint, isEmpty, STAGE_LABELS, type Fingerprint } from './fingerprint'

const EXAMPLE = 'Graph neural networks for detecting financial fraud in transaction networks. '
  + 'We build temporal models over transaction graphs to flag anomalous accounts, and we care '
  + 'about whether the resulting alerts can be explained to an investigator.'

type Step = 'write' | 'review' | 'results'

export function RadarPage() {
  const notify = useToast()
  const [text, setText] = useState('')
  const [step, setStep] = useState<Step>('write')
  const [dropped, setDropped] = useState<string>()
  /** Terms the reader has struck out. They are never sent. */
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const fileInput = useRef<HTMLInputElement>(null)

  const print = useMemo(() => fingerprint(text), [text])
  const kept = useMemo(
    () => print.keywords.filter((word) => !removed.has(word)),
    [print.keywords, removed],
  )

  const search = useMutation({
    mutationFn: (query: Fingerprint) => api.radarMatch({
      topics: query.topics.map((term) => term.label).filter((label) => !removed.has(label)),
      methods: query.methods.map((term) => term.label).filter((label) => !removed.has(label)),
      applications: query.applications.map((term) => term.label).filter((label) => !removed.has(label)),
      discipline: query.discipline,
      keywords: kept,
    }),
    onSuccess: (_result, query) => {
      // Kept on this device so the Funding page can mark what matches without
      // asking for the research a second time.
      saveTerms(kept, query.discipline)
      setStep('results')
    },
  })

  const readFile = (file: File) => {
    // Read on the device. The file itself is never uploaded — only the terms
    // derived from it, and only after the reader has seen them.
    const reader = new FileReader()
    reader.onload = () => {
      setText(String(reader.result ?? '').slice(0, 40_000))
      setDropped(file.name)
      setStep('write')
      notify({
        title: 'Read on your device',
        detail: `${file.name} was read here and not uploaded. Check the terms before searching.`,
      })
    }
    reader.onerror = () => notify({
      tone: 'error',
      title: 'Could not read that file',
      detail: 'Plain text, Markdown and .txt work best. For a PDF, paste the abstract instead.',
    })
    reader.readAsText(file)
  }

  const [dragging, setDragging] = useState(false)

  const startOver = () => {
    setText(''); setDropped(undefined); setRemoved(new Set()); setStep('write'); search.reset()
  }

  return <div
    className={`radar ${dragging ? 'dropping' : ''}`}
    onDragOver={(event) => { event.preventDefault(); if (step === 'write') setDragging(true) }}
    onDragLeave={(event) => {
      // Only when the pointer has actually left the panel, not on every child
      // it passes over on the way.
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
    }}
    onDrop={(event) => {
      event.preventDefault()
      setDragging(false)
      const file = event.dataTransfer.files?.[0]
      if (file) readFile(file)
    }}
  >
    <ol className="radar-steps" aria-label="How the Radar works">
      {(['write', 'review', 'results'] as Step[]).map((name, index) => (
        <li key={name} className={step === name ? 'now' : (['write', 'review', 'results'].indexOf(step) > index ? 'done' : '')}>
          <span>{index + 1}</span>
          {name === 'write' ? 'Your work' : name === 'review' ? 'What gets searched' : 'What matched'}
        </li>
      ))}
    </ol>

    {step === 'write' && <WriteStep
      text={text}
      dropped={dropped}
      print={print}
      onText={setText}
      onExample={() => setText(EXAMPLE)}
      onAttach={() => fileInput.current?.click()}
      onNext={() => setStep('review')}
    />}

    {step === 'review' && <ReviewStep
      print={print}
      removed={removed}
      kept={kept}
      onToggle={(word) => setRemoved((current) => {
        const next = new Set(current)
        if (next.has(word)) next.delete(word); else next.add(word)
        return next
      })}
      onBack={() => setStep('write')}
      onSearch={() => search.mutate(print)}
      searching={search.isPending}
    />}

    {step === 'results' && search.data && <Results
      results={search.data}
      print={print}
      onStartOver={startOver}
      onEditTerms={() => setStep('review')}
    />}

    {search.isError && <ErrorBanner>
      {(search.error as Error).message} — nothing was sent anywhere. You can try again.
    </ErrorBanner>}

    <input
      ref={fileInput}
      type="file"
      accept=".txt,.md,.markdown,text/plain,text/markdown"
      className="sr-only"
      // "Attach a text file" is the control; this input is only what that
      // button clicks. sr-only still leaves it focusable and unnamed, so it is
      // taken out of the tab order and the accessibility tree together —
      // aria-hidden alone on a focusable element would be its own violation.
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => {
        const file = event.target.files?.[0]
        if (file) readFile(file)
        event.target.value = ''
      }}
    />
  </div>
}

/* ------------------------------------------------------------------ step 1 */

function WriteStep({ text, dropped, print, onText, onExample, onAttach, onNext }: {
  text: string
  dropped?: string
  print: Fingerprint
  onText: (value: string) => void
  onExample: () => void
  onAttach: () => void
  onNext: () => void
}) {
  const ready = !isEmpty(print)
  return <section className="radar-panel">
    <header className="radar-head">
      <div>
        <h2>Paste your research, or attach it</h2>
        <p>
          An abstract, a proposal, a thesis chapter or a few sentences about what you work on.
          The more specific you are, the better the match.
        </p>
      </div>
      <p className="radar-privacy">
        <Lock size={ICON.sm} aria-hidden="true" />
        <span>
          <strong>This stays on your device.</strong> Scrapal reads it here, works out the topics,
          and shows you those topics before anything is searched. The writing itself is never
          uploaded and never used for training.
        </span>
      </p>
    </header>

    <textarea
      className="radar-input"
      rows={9}
      value={text}
      onChange={(event) => onText(event.target.value)}
      placeholder="Graph neural networks for detecting financial fraud in transaction networks…"
      aria-label="Your research"
    />

    <p className="radar-drop">
      <Upload size={ICON.xs} aria-hidden="true" /> Drop a file anywhere on this page, or use the button below.
    </p>

    <div className="radar-actions">
      <button type="button" className="student-button" onClick={onAttach}>
        <Paperclip size={ICON.sm} aria-hidden="true" /> Attach a text file
      </button>
      <button type="button" className="student-button" onClick={onExample}>
        <Lightbulb size={ICON.sm} aria-hidden="true" /> Use an example
      </button>
      <span className="radar-count">
        {print.words} word{print.words === 1 ? '' : 's'}
        {dropped && <> · read from <b>{dropped}</b></>}
      </span>
      <button type="button" className="student-button primary" disabled={!ready} onClick={onNext}>
        See what will be searched <ArrowRight size={ICON.sm} aria-hidden="true" />
      </button>
    </div>

    {text.trim().length > 0 && !ready && (
      <p className="radar-note">
        Nothing recognisable yet. Name the methods you use and the problem you are working on —
        Scrapal will not guess, because a guess would send the wrong terms out.
      </p>
    )}
  </section>
}

/* ------------------------------------------------------------------ step 2 */

function ReviewStep({ print, removed, kept, onToggle, onBack, onSearch, searching }: {
  print: Fingerprint
  removed: Set<string>
  kept: string[]
  onToggle: (word: string) => void
  onBack: () => void
  onSearch: () => void
  searching: boolean
}) {
  const groups: { label: string; terms: string[] }[] = [
    { label: 'Topics', terms: print.topics.map((term) => term.label) },
    { label: 'Methods', terms: print.methods.map((term) => term.label) },
    { label: 'Where it applies', terms: print.applications.map((term) => term.label) },
    {
      label: 'Other words that stood out',
      terms: print.keywords.filter((word) => !word.includes(' ')),
    },
  ].filter((group) => group.terms.length > 0)

  return <section className="radar-panel">
    <header className="radar-head">
      <div>
        <h2>This is everything that will leave your device</h2>
        <p>
          Scrapal searches on these terms only. Tap any one to strike it out — struck terms are
          not sent. Your sentences, your framing and anything unpublished stay here.
        </p>
      </div>
    </header>

    <dl className="print-groups">
      {groups.map((group) => (
        <div key={group.label}>
          <dt>{group.label}</dt>
          <dd>
            {group.terms.map((term) => {
              const off = removed.has(term)
              return <button
                key={term}
                type="button"
                className={`print-term ${off ? 'off' : ''}`}
                aria-pressed={!off}
                onClick={() => onToggle(term)}
              >
                {term}
                {off ? <RotateCcw size={ICON.xs} aria-hidden="true" /> : <X size={ICON.xs} aria-hidden="true" />}
              </button>
            })}
          </dd>
        </div>
      ))}
      <div>
        <dt>Field</dt>
        <dd className="print-plain">
          {print.discipline ?? 'Not clear from the text'}
          {print.careerStage !== 'unknown' && <> · {STAGE_LABELS[print.careerStage]}</>}
        </dd>
      </div>
    </dl>

    <div className="radar-actions">
      <button type="button" className="student-button" onClick={onBack}>Back to your text</button>
      <span className="radar-count">{kept.length} term{kept.length === 1 ? '' : 's'} will be searched</span>
      <button
        type="button"
        className="student-button primary"
        disabled={!kept.length || searching}
        onClick={onSearch}
      >
        {searching
          ? <><Dots /> Searching</>
          : <><Search size={ICON.sm} aria-hidden="true" /> Search with these terms</>}
      </button>
    </div>
    {!kept.length && <p className="radar-note">
      Strike everything out and there is nothing to search on. Put at least one term back.
    </p>}
  </section>
}

/* ------------------------------------------------------------------ step 3 */

const TABS = [
  { id: 'researchers', label: 'Researchers', icon: Users },
  { id: 'positions', label: 'Funded PhDs', icon: GraduationCap },
  { id: 'funding', label: 'Funding', icon: Banknote },
  { id: 'labs', label: 'Labs', icon: FlaskConical },
] as const

function Results({ results, print, onStartOver, onEditTerms }: {
  results: RadarResults
  print: Fingerprint
  onStartOver: () => void
  onEditTerms: () => void
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('researchers')
  const counts = {
    researchers: results.researchers.length,
    positions: results.positions.length,
    funding: results.funding.length,
    labs: results.labs.length,
  }
  const total = counts.researchers + counts.positions + counts.funding + counts.labs

  if (!total) {
    return <EmptyState title="Nothing matched those terms yet">
      Scrapal only returns something when it can name why it matched, so an empty result means no
      overlap rather than a hidden list. Try adding a method or an application area to your text.
    </EmptyState>
  }

  return <>
    <section className="radar-summary">
      <div>
        <p className="radar-searched">
          Searched on <b>{results.searched.length}</b> terms from your work
          {print.discipline && <> in <b>{print.discipline}</b></>}.
          <button type="button" className="student-link" onClick={onEditTerms}>Change the terms</button>
        </p>
        {results.next_deadline && <p className="radar-deadline">
          <CircleCheck size={ICON.xs} aria-hidden="true" />
          Next deadline {relativeDeadline(results.next_deadline)}
        </p>}
      </div>
      <button type="button" className="student-button" onClick={onStartOver}>
        <RotateCcw size={ICON.sm} aria-hidden="true" /> Start again
      </button>
    </section>

    {results.adjacent.length > 0 && <section className="radar-adjacent">
      <h3><Lightbulb size={ICON.sm} aria-hidden="true" /> Next to your work</h3>
      <p>
        Topics the people you matched also work on, which your text does not mention. Each one
        comes from a real researcher below, not from a thesaurus.
      </p>
      <ul>{results.adjacent.map((topic) => <li key={topic}>{topic}</li>)}</ul>
    </section>}

    <TabList
      label="What matched"
      active={tab}
      onChange={setTab}
      tabs={TABS.map((entry) => {
        const Icon = entry.icon
        return {
          id: entry.id,
          label: <><Icon size={ICON.sm} aria-hidden="true" /> {entry.label}</>,
          badge: counts[entry.id],
        }
      })}
    />

    <TabPanel id={tab} active>
    <div className="radar-results">
      {tab === 'researchers' && results.researchers.map((match) => (
        <PersonCard
          key={match.researcher.id}
          person={match.researcher}
          score={match.score}
          reasons={match.reasons}
          publications={match.publications}
        />
      ))}
      {tab === 'positions' && results.positions.map((match) => (
        <PositionCard key={match.position.id} match={match} />
      ))}
      {tab === 'funding' && results.funding.map((match) => (
        <FundingCard key={match.call.id} call={match.call} score={match.score} reasons={match.reasons} />
      ))}
      {tab === 'labs' && results.labs.map((match) => (
        <LabCard key={match.lab.id} match={match} />
      ))}
      {counts[tab] === 0 && <p className="radar-note">Nothing matched in this group.</p>}
    </div>
    </TabPanel>
  </>
}

/* ------------------------------------------------------------------- cards */

function PositionCard({ match }: { match: PositionMatch }) {
  const { position } = match
  return <article className="match-card">
    <header>
      <span className="match-icon"><GraduationCap size={ICON.lg} aria-hidden="true" /></span>
      <div className="match-title">
        <h3>{position.title}</h3>
        <p>{position.institution}</p>
        <p className="match-where">
          <Building2 size={ICON.xs} aria-hidden="true" /> Supervised by {match.supervisor.name}
        </p>
      </div>
      <Score value={match.score} />
    </header>
    <div className="match-badges">
      {position.fully_funded
        ? <span className="badge funded">Fully funded</span>
        : <span className="badge">Self-funded</span>}
      <span className="badge">{position.currency} {position.stipend.toLocaleString('en-GB')} a year</span>
      <span className={`badge ${urgent(position.deadline) ? 'urgent' : ''}`}>{relativeDeadline(position.deadline)}</span>
    </div>
    <Reasons reasons={match.reasons} />
    <div className="match-actions">
      <a className="student-button primary" {...linkTo(`/student/researchers/${match.supervisor.id}`)}>
        About the supervisor
      </a>
      <a className="student-button" href={position.url} target="_blank" rel="noreferrer">
        <ExternalLink size={ICON.xs} aria-hidden="true" /> The listing
      </a>
    </div>
  </article>
}

function LabCard({ match }: { match: LabMatch }) {
  return <article className="match-card">
    <header>
      <span className="match-icon"><FlaskConical size={ICON.lg} aria-hidden="true" /></span>
      <div className="match-title">
        <h3>{match.lab.name}</h3>
        <p>{match.lab.institution}</p>
      </div>
      <Score value={match.score} />
    </header>
    <div className="match-badges">
      {match.lab.recruiting && <span className="badge hiring">Recruiting</span>}
    </div>
    <Reasons reasons={match.reasons} />
    <div className="match-actions">
      <a className="student-button primary" {...linkTo(`/student/researchers/${match.lead.id}`)}>
        About the lead
      </a>
    </div>
  </article>
}
