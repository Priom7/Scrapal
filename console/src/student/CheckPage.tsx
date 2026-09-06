import { useMutation, useQuery } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, CircleHelp, Quote, ShieldQuestion } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { ICON } from '../lib'
import { useToast } from '../toast'
import { analyseClaim, type ClaimAnalysis, type ClaimVerdict } from './claims'

const EXAMPLES = [
  'The agent said Coventry guarantees a £5,000 scholarship for international students',
  'I was told tuition is £9,000 a year',
  'They said there is a January intake for the Data Science MSc',
]

const MARKS: Record<ClaimVerdict, typeof CircleCheck> = {
  supported: CircleCheck,
  conflicting: CircleAlert,
  related: CircleHelp,
  unmentioned: ShieldQuestion,
}

export function CheckPage() {
  const [claim, setClaim] = useState('')
  const [result, setResult] = useState<ClaimAnalysis>()
  const notify = useToast()
  const institutions = useQuery({
    queryKey: ['student', 'institutions'],
    queryFn: () => api.galleryInstitutions(),
  })

  const check = useMutation({
    mutationFn: async (text: string) => analyseClaim(
      text,
      (await api.search(text)).hits,
      (institutions.data ?? []).map((item) => item.name),
    ),
    onSuccess: setResult,
    onError: (error: Error) => notify({ tone: 'error', title: 'Could not check that', detail: error.message }),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = claim.trim()
    if (text.length < 8) return
    setResult(undefined)
    check.mutate(text)
  }

  return <div className="check-page">
    <p className="check-lead">
      Paste what an agent, a counsellor or a friend told you. Scrapal checks it against the pages
      universities actually published, and shows you the wording so you can judge for yourself.
    </p>

    <form className="check-form" onSubmit={submit}>
      <label>
        <span className="sr-only">What were you told?</span>
        <textarea
          value={claim}
          onChange={(event) => setClaim(event.target.value)}
          rows={3}
          placeholder="They told me…"
        />
      </label>
      <button type="submit" className="student-button primary" disabled={check.isPending || claim.trim().length < 8}>
        {check.isPending ? 'Checking…' : 'Check this'}
      </button>
    </form>

    {!result && !check.isPending && (
      <div className="check-examples">
        <span>Try one</span>
        {EXAMPLES.map((example) => (
          <button key={example} type="button" onClick={() => { setClaim(example); check.mutate(example) }}>
            {example}
          </button>
        ))}
      </div>
    )}

    {result && <Verdict result={result} />}

    <p className="check-caveat">
      Scrapal can only check what it has read. A university page it has not reached, or a rule that
      only exists in an email, will not show up here.
    </p>
  </div>
}

function Verdict({ result }: { result: ClaimAnalysis }) {
  const Mark = MARKS[result.verdict]
  return <section className={`verdict ${result.verdict}`} aria-live="polite">
    <header>
      <span className="verdict-mark" aria-hidden="true"><Mark size={ICON.md} /></span>
      <div>
        <h2>{result.headline}</h2>
        <p>{result.detail}</p>
      </div>
    </header>

    {result.conflicts.length > 0 && (
      <ul className="conflict-list">
        {result.conflicts.slice(0, 3).map((conflict) => (
          <li key={`${conflict.hit.chunk_id}-${conflict.published}`}>
            <span className="conflict-claimed">You were told £{conflict.claimed.toLocaleString('en-GB')}</span>
            <span className="conflict-published">The page says £{conflict.published.toLocaleString('en-GB')}</span>
          </li>
        ))}
      </ul>
    )}

    {/* A promise a university would not make is worth naming on its own, even
        when the evidence neither supports nor contradicts the claim. */}
    {result.absolutes.length > 0 && (
      <p className="verdict-absolutes">
        This uses wording universities almost never publish
        {': '}
        {result.absolutes.map((word, index) => (
          <span key={word}>{index > 0 ? ', ' : ''}<code>{word}</code></span>
        ))}
        . Ask for the page that says it.
      </p>
    )}

    {result.evidence.length > 0 && <>
      <h3>What the pages actually say</h3>
      <ul className="evidence-list">
        {result.evidence.map((hit) => (
          <li key={hit.chunk_id}>
            <blockquote>
              <Quote size={ICON.xs} aria-hidden="true" />
              <p>{hit.excerpt}</p>
            </blockquote>
            <a href={hit.url} target="_blank" rel="noreferrer">
              {hit.title} · {hit.heading}
            </a>
          </li>
        ))}
      </ul>
    </>}
  </section>
}
