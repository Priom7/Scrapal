import { Check, Filter, Sparkles, Target, TriangleAlert } from 'lucide-react'
import { motion } from 'motion/react'
import { ICON, QueryPlanData } from './lib'

const FILTERS = ['level', 'residency', 'intake', 'study_mode'] as const

function Chips({ items, tone }: { items: string[]; tone: 'entity' | 'field' }) {
  return <span className="plan-chips">{items.map((item, index) => (
    <motion.span
      key={`${item}-${index}`}
      className={`plan-chip ${tone}`}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * .035, .25), duration: .18 }}
    >{item.replaceAll('_', ' ')}</motion.span>
  ))}</span>
}

/**
 * The planning stage made legible. It used to render as a JSON dump, which hid
 * both what was searched for and whether a model produced it at all.
 */
export function InterpretedQuery({ plan, compact }: { plan?: QueryPlanData; compact?: boolean }) {
  if (!plan) return null
  const entities = plan.entities?.filter(Boolean) ?? []
  const fields = plan.requested_fields?.filter(Boolean) ?? []
  const filters = FILTERS.map((key) => [key, plan[key]] as const).filter(([, value]) => Boolean(value))
  const fallback = plan.source === 'fallback'

  return (
    <motion.section
      className={`interpreted-query ${compact ? 'compact' : ''}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .22 }}
      aria-label="Interpreted question"
    >
      <header>
        <div><Target size={ICON.sm} aria-hidden="true" /><small>Interpreted question</small></div>
        <span className={`plan-origin ${fallback ? 'fallback' : 'model'}`}>
          {fallback ? <TriangleAlert size={ICON.xs} aria-hidden="true" /> : <Check size={ICON.xs} aria-hidden="true" />}
          {fallback ? 'Planning unavailable · searched the raw question' : 'Model-derived plan'}
        </span>
      </header>
      <dl>
        {plan.intent && <div><dt>Intent</dt><dd className="plan-intent">{plan.intent.replaceAll('_', ' ')}</dd></div>}
        <div><dt><Sparkles size={ICON.xs} aria-hidden="true" /> Looking for</dt>
          <dd>{entities.length ? <Chips items={entities} tone="entity" /> : <em>No entities extracted</em>}</dd></div>
        {!compact && <div><dt>Fields</dt>
          <dd>{fields.length ? <Chips items={fields} tone="field" /> : <em>Any published field</em>}</dd></div>}
        <div><dt><Filter size={ICON.xs} aria-hidden="true" /> Filters</dt>
          <dd>{filters.length
            ? <Chips items={filters.map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value}`)} tone="field" />
            : <em>No constraints stated</em>}</dd></div>
      </dl>
      {!compact && <details className="plan-raw"><summary>View raw plan</summary><pre>{JSON.stringify(plan, null, 2)}</pre></details>}
    </motion.section>
  )
}
