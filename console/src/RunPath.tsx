import { useQuery } from '@tanstack/react-query'
import { Check, ChevronRight, Radio, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
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
  if (latest?.stage === 'discovery') return 'discover'
  if (latest?.stage === 'fetch' || latest?.stage === 'robots') return 'fetch'
  if (latest?.stage === 'extract') return 'extract'
  if (latest?.stage === 'persist') return 'save'
  return run?.status === 'completed' ? 'complete' : 'discover'
}

export function RunPath({ run, onInspect }: { run?: Run; onInspect?: () => void }) {
  const reduce = useReducedMotion()
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
    const progress = stage.key === 'complete' ? (run?.status === 'completed' ? 100 : 0)
      : discovered ? (done.length / discovered) * 100 : 0
    return { ...stage, detail, failures, elapsed, progress }
  })

  const overall = run && discovered ? Math.min(100, Math.round((run.pages_processed / discovered) * 100)) : run?.status === 'completed' ? 100 : 0
  const currentUrl = latest?.url ? compactUrl(latest.url)
    : run?.status === 'queued' ? 'Waiting for an available worker'
    : run ? 'Preparing the next page' : 'Connect a source or run an existing one'

  return (
    <section className="run-path" aria-labelledby="run-path-title">
      <div className="run-path-heading">
        <div>
          <h2 id="run-path-title">Live run path</h2>
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
          const isFailed = (run?.status === 'failed' && stage.key === currentKey) || stage.failures > 0
          return <li className={`${isComplete ? 'completed' : ''} ${isCurrent ? 'current' : ''} ${isFailed ? 'failed' : ''}`} aria-current={isCurrent ? 'step' : undefined} key={stage.key}>
            <div className="stage-marker" aria-hidden="true">{isFailed ? <X size={ICON.sm} /> : isComplete ? <Check size={ICON.sm} /> : index + 1}</div>
            <div className="stage-copy">
              <strong>{stage.label}</strong>
              <span>{stage.detail}</span>
              <small className="stage-facts">
                {stage.elapsed > 0 && <span>{formatDuration(stage.elapsed)}</span>}
                {stage.failures > 0 && <span className="stage-failures">{stage.failures} failed</span>}
              </small>
            </div>
            <motion.div className="stage-progress" initial={false} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : .35 }}>
              <Meter value={stage.progress} tone={isFailed ? 'fail' : isComplete ? 'done' : 'active'} label={`${stage.label} ${Math.round(stage.progress)}% complete`} />
            </motion.div>
          </li>
        })}
      </ol>
      <div className="run-path-now" aria-live="polite">
        <Radio size={ICON.md} aria-hidden="true" />
        <div><span>{run && isLiveRun(run) ? `Current activity · ${currentKey}` : 'Run status'}</span><strong>{currentUrl}</strong></div>
        {run && <button className="run-path-inspect" onClick={onInspect}>View live run <ChevronRight size={ICON.sm} aria-hidden="true" /></button>}
      </div>
    </section>
  )
}
