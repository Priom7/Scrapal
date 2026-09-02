import { useQuery } from '@tanstack/react-query'
import { Check, ChevronRight, Radio, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { api, CrawlEvent, Run } from './api'
import { compactUrl, formatDuration, ICON, isLiveRun } from './lib'
import { Meter } from './ui'

const TERMINAL = new Set(['completed', 'failed', 'policy_skipped'])

/**
 * The five stages the crawler actually emits events for. Publish and index are
 * deliberately absent: the worker records no such events, so showing them would
 * put two permanently grey stages on screen and break the promise that every
 * count here comes from a durable event.
 */
const STAGES = [
  { key: 'discover', label: 'Discover', event: ['discovery'] },
  { key: 'fetch', label: 'Fetch', event: ['fetch', 'robots'] },
  { key: 'extract', label: 'Extract', event: ['extract'] },
  { key: 'save', label: 'Save', event: ['persist'] },
  { key: 'complete', label: 'Complete', event: ['run'] },
] as const

function currentStageKey(latest: CrawlEvent | undefined, run?: Run) {
  if (run?.status === 'completed') return 'complete'
  if (latest?.stage === 'discovery') return 'discover'
  if (latest?.stage === 'fetch' || latest?.stage === 'robots') return 'fetch'
  if (latest?.stage === 'extract') return 'extract'
  if (latest?.stage === 'persist') return 'save'
  return 'discover'
}

export function RunPath({ run, onInspect }: { run?: Run; onInspect?: () => void }) {
  const reduce = useReducedMotion()
  const [selectedKey, setSelectedKey] = useState<string>()
  const timeline = useQuery({
    queryKey: ['run-path', run?.id],
    queryFn: () => api.timeline(run!.id),
    enabled: Boolean(run),
    refetchInterval: run && isLiveRun(run) ? 2000 : false,
  })
  const events = timeline.data ?? []
  const discovered = run?.pages_discovered ?? 0
  const latest = [...events].reverse().find((event) => event.stage !== 'page')
  const currentKey = currentStageKey(latest, run)

  const stages = STAGES.map((stage) => {
    const own = events.filter((event) => (stage.event as readonly string[]).includes(event.stage))
    const done = own.filter((event) => TERMINAL.has(event.outcome))
    const failures = own.filter((event) => event.outcome === 'failed').length
    const elapsed = own.reduce((total, event) => total + (event.duration_ms ?? 0), 0)
    const detail = stage.key === 'discover' ? (discovered ? `${discovered} URLs found` : 'Finding eligible URLs')
      : stage.key === 'fetch' ? `${run?.pages_processed ?? 0} pages checked`
      : stage.key === 'extract' ? `${done.length} pages interpreted`
      : stage.key === 'save' ? `${run?.documents_created ?? 0} new documents`
      : run ? `${run.policy_skips_count} policy skips` : 'Ready for a run'
    const progress = stage.key === 'discover'
      ? done.some((event) => event.outcome === 'completed') || discovered > 0 ? 100 : 0
      : stage.key === 'complete'
        ? run?.status === 'completed' ? 100 : 0
        : discovered ? (done.length / discovered) * 100 : 0
    return { ...stage, detail, failures, elapsed, progress, events: own }
  })

  const overall = run && discovered ? Math.min(100, Math.round((run.pages_processed / discovered) * 100)) : run?.status === 'completed' ? 100 : 0
  const currentUrl = run?.status === 'completed' ? `${run.pages_processed} pages checked · ${run.documents_created} documents created`
    : run?.status === 'failed' ? 'Run stopped before all eligible pages completed'
    : latest?.url ? compactUrl(latest.url)
    : run?.status === 'queued' ? 'Waiting for an available worker'
    : run ? 'Preparing the next page' : 'Connect a source or run an existing one'
  const selectedStage = stages.find((stage) => stage.key === (selectedKey ?? currentKey)) ?? stages[0]
  const recentStageEvents = [...selectedStage.events].reverse().filter((event) => event.url).slice(0, 2)

  return (
    <section className="run-path" aria-labelledby="run-path-title">
      <div className="run-path-heading">
        <div>
          <h2 id="run-path-title">{run && isLiveRun(run) ? 'Live run path' : run ? 'Latest run path' : 'Run path'}</h2>
          <p>Every count comes from durable crawler events—not an estimated animation.</p>
        </div>
        <div className="run-path-state">
          <span className={`run-state ${run?.status ?? 'idle'}`}><span aria-hidden="true" /> {run?.status?.replaceAll('_', ' ') ?? 'Ready'}</span>
          <strong>{overall}%</strong>
        </div>
      </div>
      <ol className="run-path-stages" aria-label="Crawler processing stages">
        {stages.map((stage, index) => {
          const isComplete = run?.status === 'completed' || (stage.key === 'discover' && discovered > 0)
          const isCurrent = Boolean(run && isLiveRun(run) && stage.key === currentKey)
          const isFailed = run?.status === 'failed' && stage.key === currentKey
          const hasFailures = stage.failures > 0 && !isFailed
          return <li className={`${isComplete ? 'completed' : ''} ${isCurrent ? 'current' : ''} ${isFailed ? 'failed' : ''} ${hasFailures ? 'has-failures' : ''} ${(selectedKey ?? currentKey) === stage.key ? 'selected' : ''}`} aria-current={isCurrent ? 'step' : undefined} key={stage.key}>
            <button className="stage-button" onClick={() => setSelectedKey(stage.key)} aria-pressed={(selectedKey ?? currentKey) === stage.key} aria-label={`Inspect ${stage.label} stage, ${Math.round(stage.progress)} percent complete`}>
              <span className="stage-marker" aria-hidden="true">{isFailed ? <X size={ICON.sm} /> : isComplete ? <Check size={ICON.sm} /> : index + 1}</span>
              <span className="stage-copy">
                <strong>{stage.label}</strong>
                <span>{stage.detail}</span>
                <small className="stage-facts">
                  {stage.elapsed > 0 && <span>{formatDuration(stage.elapsed)}</span>}
                  {stage.failures > 0 && <span className="stage-failures">{stage.failures} failed</span>}
                </small>
              </span>
              <motion.span className="stage-progress" initial={false} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : .25 }}>
                <Meter value={stage.progress} tone={isFailed ? 'fail' : hasFailures ? 'wait' : isComplete ? 'done' : 'active'} label={`${stage.label}: ${Math.round(stage.progress)}% of discovered pages reached this stage`} />
              </motion.span>
            </button>
          </li>
        })}
      </ol>
      <div className="stage-inspector" aria-live="polite">
        <div className="stage-inspector-summary"><span className="stage-inspector-icon"><Radio size={ICON.md} aria-hidden="true" /></span><div><small>{selectedStage.key === currentKey && run && isLiveRun(run) ? 'Current stage' : 'Selected stage'}</small><strong>{selectedStage.label}</strong><p>{selectedStage.key === currentKey ? currentUrl : selectedStage.detail}</p></div></div>
        <dl><div><dt>Reached</dt><dd>{Math.round(selectedStage.progress)}%</dd></div><div><dt>Events</dt><dd>{selectedStage.events.length}</dd></div><div><dt>Duration</dt><dd>{selectedStage.elapsed ? formatDuration(selectedStage.elapsed) : '—'}</dd></div><div><dt>Failed</dt><dd className={selectedStage.failures ? 'danger' : ''}>{selectedStage.failures}</dd></div></dl>
        <div className="stage-event-sample">{recentStageEvents.map((event) => <span key={event.sequence}><b>{event.outcome.replaceAll('_', ' ')}</b><small>{compactUrl(event.url!)}</small></span>)}{!recentStageEvents.length && <span><b>{selectedStage.events.length ? 'Stage event recorded' : 'No page events yet'}</b><small>{selectedStage.detail}</small></span>}</div>
        {run && <button className="run-path-inspect" onClick={onInspect}>Inspect run <ChevronRight size={ICON.sm} aria-hidden="true" /></button>}
      </div>
    </section>
  )
}
