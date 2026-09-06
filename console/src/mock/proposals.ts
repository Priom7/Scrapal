// Actions the agent wants a person to approve before they touch the workspace.
import type { Proposal } from '../api'

const store: Proposal[] = [
  {
    id: 'prop-0001',
    title: 'Widen the Coventry crawl to include the fees pages it skipped',
    action_type: 'update_crawl_scope',
    rationale: 'Tuition is missing on 18 Coventry courses. The fees live under /study/fees, which the current include rules exclude.',
    risk: 'low',
    status: 'pending',
  },
  {
    id: 'prop-0002',
    title: 'Republish 6 Greenwich courses whose entry requirements changed',
    action_type: 'republish_records',
    rationale: 'The source pages changed after the last publish. The new text is captured and cited, but republishing changes what students see.',
    risk: 'medium',
    status: 'pending',
  },
  {
    id: 'prop-0003',
    title: 'Lower the crawl rate for tudublin.ie after repeated 503s',
    action_type: 'throttle_source',
    rationale: 'Three consecutive pages returned 503. Halving the rate should let the run finish without further failures.',
    risk: 'low',
    status: 'pending',
  },
]

export function listProposals(): Proposal[] {
  return store
}

export function setProposalStatus(id: string, status: string): Proposal | undefined {
  const proposal = store.find((item) => item.id === id)
  if (!proposal) return undefined
  proposal.status = status
  return proposal
}
