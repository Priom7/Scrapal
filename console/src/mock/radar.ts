// Matching a research fingerprint against people, money and positions.
//
// The rule this module exists to enforce: nothing is returned unless the
// overlap that produced it can be named. A score with no reasons is exactly the
// kind of answer this product refuses to give elsewhere — the claim checker
// will not call a topical hit "evidence", and the Radar must not either. So
// `reasons` is built first and the score is derived from it; anything that
// produces no reasons is dropped before it is ranked.
import type {
  FundingCall, FundingMatch, Lab, LabMatch, MatchReason, PhdPosition, PositionMatch,
  Publication, RadarQuery, RadarResults, Researcher, ResearcherMatch,
} from '../api'
import { fundingCalls, labs, phdPositions, publications, researchers } from './research'

/** Everything the reader asked to be searched on, flattened. */
function terms(query: RadarQuery): string[] {
  return [...new Set([
    ...query.topics, ...query.methods, ...query.applications, ...query.keywords,
  ].map((term) => term.toLowerCase()).filter(Boolean))]
}

/** Terms shared between the fingerprint and something's own topic list. */
function shared(query: RadarQuery, topics: string[]): string[] {
  const wanted = new Set(terms(query))
  return topics.filter((topic) => wanted.has(topic.toLowerCase()))
}

function list(values: string[]): string {
  if (values.length === 1) return values[0]
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`
}

/**
 * How rare each topic is across everything the Radar knows about.
 *
 * Without this, matching on "deep learning" — which half the corpus lists —
 * counted the same as matching on "financial fraud detection", which three
 * people do. Rare terms are the ones that make a match meaningful, so they
 * carry more weight.
 */
const rarity = (() => {
  const documents = [
    ...researchers.map((person) => person.topics),
    ...fundingCalls.map((call) => call.topics),
    ...phdPositions.map((position) => position.topics),
    ...labs.map((lab) => lab.topics),
  ]
  const frequency = new Map<string, number>()
  for (const topics of documents) {
    for (const topic of new Set(topics.map((topic) => topic.toLowerCase()))) {
      frequency.set(topic, (frequency.get(topic) ?? 0) + 1)
    }
  }
  return (topic: string): number => {
    const seen = frequency.get(topic.toLowerCase()) ?? 0
    // A term nothing in the corpus uses cannot discriminate, so it scores zero
    // rather than counting as maximally rare.
    if (!seen) return 0
    return Math.log(documents.length / seen) + 0.35
  }
})()

/**
 * A score in 0–100, built from what was actually found rather than chosen
 * first and justified afterwards.
 *
 * The denominator is how much of the *student's* work is covered, not how much
 * of the other party's profile. Dividing by the profile rewarded people who
 * list few topics: a bioinformatician matching two of their three topics
 * outranked a fraud researcher matching two of four, even though the fraud
 * researcher matched the more distinctive half of what the student wrote.
 *
 * The extras only ever nudge, so nothing reaches a high score on availability
 * alone.
 */
function score(query: RadarQuery, overlap: string[], bonus: number): number {
  if (!overlap.length) return 0
  // Terms nothing in the corpus uses are dropped from both sides: a student who
  // writes about something no one here works on should not be marked down.
  const askedFor = terms(query).map(rarity).filter((weight) => weight > 0)
  const wanted = askedFor.reduce((total, weight) => total + weight, 0)
  const found = overlap.reduce((total, topic) => total + rarity(topic), 0)
  const coverage = wanted > 0 ? Math.min(1, found / wanted) : 0
  return Math.max(18, Math.min(97, Math.round((0.3 + coverage * 0.62 + bonus) * 100)))
}

function matchResearcher(query: RadarQuery, researcher: Researcher, papers: Publication[]): ResearcherMatch | null {
  const overlap = shared(query, researcher.topics)
  // No named overlap, no match. This is the whole discipline of the feature.
  if (!overlap.length) return null

  const reasons: MatchReason[] = [{
    label: 'Shared research area',
    detail: `Works on ${list(overlap)}.`,
  }]

  const related = papers.filter((paper) => shared(query, paper.topics).length)
  if (related.length) {
    reasons.push({
      label: 'Related publications',
      detail: `${related.length} publication${related.length === 1 ? '' : 's'} on ${
        list([...new Set(related.flatMap((paper) => shared(query, paper.topics)))].slice(0, 2))
      }.`,
    })
  }

  const position = phdPositions.find((item) => item.supervisor_id === researcher.id) ?? null
  if (position) {
    reasons.push({
      label: 'Open position',
      detail: `Advertising a ${position.fully_funded ? 'fully funded' : 'self-funded'} PhD: ${position.title}.`,
    })
  } else if (researcher.open_to_supervise) {
    reasons.push({ label: 'Availability', detail: 'Listed as open to supervise.' })
  }

  if (query.discipline && researcher.discipline === query.discipline) {
    reasons.push({ label: 'Same discipline', detail: `Based in ${researcher.discipline}.` })
  }

  const bonus = (related.length ? 0.04 : 0) + (position ? 0.04 : 0)
    + (researcher.has_funding ? 0.02 : 0)
  return {
    researcher,
    score: score(query, overlap, bonus),
    reasons,
    publications: related.slice(0, 4),
    position,
  }
}

function matchFunding(query: RadarQuery, call: FundingCall): FundingMatch | null {
  const overlap = shared(query, call.topics)
  if (!overlap.length) return null

  const days = Math.ceil((new Date(call.deadline).getTime() - Date.now()) / 86_400_000)
  const reasons: MatchReason[] = [
    { label: 'Matches your topics', detail: `Funds work on ${list(overlap)}.` },
    {
      label: 'Deadline',
      detail: days <= 0 ? 'Closed.' : days === 1 ? 'Closes tomorrow.' : `Closes in ${days} days.`,
    },
  ]
  if (call.fully_funded) {
    reasons.push({ label: 'Cover', detail: 'Fully funded, including fees and stipend.' })
  }
  // A deadline that has already gone is never urgent, only over — so it loses
  // the bonus rather than gaining one for being close.
  const bonus = (call.fully_funded ? 0.03 : 0) + (days > 0 && days < 45 ? 0.03 : 0)
  return { call, score: score(query, overlap, bonus), reasons }
}

function matchPosition(query: RadarQuery, position: PhdPosition): PositionMatch | null {
  const overlap = shared(query, position.topics)
  if (!overlap.length) return null
  const supervisor = researchers.find((person) => person.id === position.supervisor_id)
  if (!supervisor) return null

  const days = Math.ceil((new Date(position.deadline).getTime() - Date.now()) / 86_400_000)
  const reasons: MatchReason[] = [
    { label: 'Matches your topics', detail: `On ${list(overlap)}.` },
    { label: 'Supervisor', detail: `${supervisor.name}, ${supervisor.institution}.` },
    {
      label: 'Deadline',
      detail: days <= 0 ? 'Closed.' : days === 1 ? 'Closes tomorrow.' : `Closes in ${days} days.`,
    },
  ]
  if (position.fully_funded) {
    reasons.push({
      label: 'Funding',
      detail: `Fully funded, ${position.currency} ${position.stipend.toLocaleString('en-GB')} a year.`,
    })
  }
  const bonus = (position.fully_funded ? 0.04 : 0) + (days > 0 && days < 45 ? 0.02 : 0)
  return { position, supervisor, score: score(query, overlap, bonus), reasons }
}

function matchLab(query: RadarQuery, lab: Lab): LabMatch | null {
  const overlap = shared(query, lab.topics)
  if (!overlap.length) return null
  const lead = researchers.find((person) => person.id === lab.lead_id)
  if (!lead) return null
  const reasons: MatchReason[] = [
    { label: 'Shared research area', detail: `Group works on ${list(overlap)}.` },
    { label: 'Led by', detail: `${lead.name}, ${lab.institution}.` },
  ]
  if (lab.recruiting) reasons.push({ label: 'Recruiting', detail: 'Currently taking on new researchers.' })
  return { lab, lead, score: score(query, overlap, lab.recruiting ? 0.03 : 0), reasons }
}

/**
 * Topics that sit next to the fingerprint without being in it — the things a
 * researcher probably should be reading and is not. Derived from what the
 * matched people also work on, so every suggestion is grounded in someone real
 * rather than in a thesaurus.
 */
function adjacentTopics(query: RadarQuery, matched: ResearcherMatch[]): string[] {
  const known = new Set(terms(query))
  const counts = new Map<string, number>()
  for (const match of matched) {
    for (const topic of match.researcher.topics) {
      if (known.has(topic.toLowerCase())) continue
      counts.set(topic, (counts.get(topic) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([topic]) => topic)
}

function soonest(values: string[]): string | null {
  const future = values
    .filter((value) => new Date(value).getTime() > Date.now())
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
  return future[0] ?? null
}

export function runRadar(query: RadarQuery): RadarResults {
  const searched = terms(query)
  if (!searched.length) {
    return {
      searched: [], researchers: [], funding: [], positions: [], labs: [],
      adjacent: [], next_deadline: null,
    }
  }

  const byResearcher = new Map<string, Publication[]>()
  for (const paper of publications) {
    const bucket = byResearcher.get(paper.researcher_id) ?? []
    bucket.push(paper)
    byResearcher.set(paper.researcher_id, bucket)
  }

  const rank = <T extends { score: number }>(values: (T | null)[]): T[] => values
    .filter((value): value is T => value !== null)
    .sort((a, b) => b.score - a.score)

  const matchedResearchers = rank(
    researchers.map((person) => matchResearcher(query, person, byResearcher.get(person.id) ?? [])),
  )
  const matchedFunding = rank(fundingCalls.map((call) => matchFunding(query, call)))
  const matchedPositions = rank(phdPositions.map((position) => matchPosition(query, position)))
  const matchedLabs = rank(labs.map((lab) => matchLab(query, lab)))

  return {
    searched,
    researchers: matchedResearchers,
    funding: matchedFunding,
    positions: matchedPositions,
    labs: matchedLabs,
    adjacent: adjacentTopics(query, matchedResearchers),
    next_deadline: soonest([
      ...matchedFunding.map((match) => match.call.deadline),
      ...matchedPositions.map((match) => match.position.deadline),
    ]),
  }
}

/** Ordering the directory. "Relevance" without a query is not a real ordering,
    so the default is the one fact that stands for standing: h-index. */
const SORTS: Record<string, (a: Researcher, b: Researcher) => number> = {
  standing: (a, b) => b.h_index - a.h_index,
  publications: (a, b) => b.publication_count - a.publication_count,
  experience: (a, b) => b.years_active - a.years_active,
  name: (a, b) => a.name.localeCompare(b.name),
}

/** An explicit id list, for "the ones I kept". Filtering the whole corpus in
    the client would work here and fall over on a real dataset. */
function idFilter(params: URLSearchParams): Set<string> | null {
  const raw = params.get('ids')
  if (!raw) return null
  const ids = raw.split(',').map((id) => id.trim()).filter(Boolean)
  return ids.length ? new Set(ids) : new Set()
}

function matches(person: Researcher, params: URLSearchParams): boolean {
  const ids = idFilter(params)
  if (ids && !ids.has(person.id)) return false
  const q = (params.get('q') ?? '').trim().toLowerCase()
  const topic = (params.get('topic') ?? '').trim().toLowerCase()
  if (params.get('open_to_supervise') && !person.open_to_supervise) return false
  if (params.get('hiring_phd') && !person.hiring_phd) return false
  if (params.get('has_funding') && !person.has_funding) return false
  if (topic && !person.topics.some((value) => value.toLowerCase() === topic)) return false
  if (q) {
    const haystack = [person.name, person.title, person.institution, person.discipline, ...person.topics]
      .join(' ')
      .toLowerCase()
    if (!haystack.includes(q)) return false
  }
  return true
}

export function listResearchers(params: URLSearchParams): {
  items: Researcher[]
  total: number
  facets: { topics: { value: string; count: number }[]; open_to_supervise: number; hiring_phd: number; has_funding: number }
} {
  const items = researchers.filter((person) => matches(person, params))
  const sort = SORTS[params.get('sort') ?? 'standing'] ?? SORTS.standing

  // Facets are counted against everything that matches the *text* search but
  // not the availability filters, so a count never drops to zero the moment
  // you tick the box it belongs to.
  const base = new URLSearchParams(params)
  base.delete('open_to_supervise')
  base.delete('hiring_phd')
  base.delete('has_funding')
  const pool = researchers.filter((person) => matches(person, base))

  const topics = new Map<string, number>()
  for (const person of pool) {
    for (const topic of person.topics) topics.set(topic, (topics.get(topic) ?? 0) + 1)
  }

  return {
    items: [...items].sort(sort),
    total: items.length,
    facets: {
      topics: [...topics.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
      open_to_supervise: pool.filter((person) => person.open_to_supervise).length,
      hiring_phd: pool.filter((person) => person.hiring_phd).length,
      has_funding: pool.filter((person) => person.has_funding).length,
    },
  }
}


/** Ordering funding. Deadline first by default: a call you cannot apply to any
    more is worthless however well it matches, and the one closing next is the
    one that needs a decision today. */
const FUNDING_SORTS: Record<string, (a: FundingCall, b: FundingCall) => number> = {
  deadline: (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
  amount: (a, b) => b.amount - a.amount,
  name: (a, b) => a.name.localeCompare(b.name),
}

function fundingMatches(call: FundingCall, params: URLSearchParams): boolean {
  const ids = idFilter(params)
  if (ids && !ids.has(call.id)) return false
  const q = (params.get('q') ?? '').trim().toLowerCase()
  const kind = params.get('kind')
  const country = params.get('country')
  const topic = (params.get('topic') ?? '').trim().toLowerCase()
  if (kind && call.kind !== kind) return false
  if (country && call.country_code !== country) return false
  if (params.get('fully_funded') && !call.fully_funded) return false
  // "Still open" is a filter people actually want, and the default view keeps
  // closed calls out of the way rather than pretending they are options.
  if (params.get('open_only') && new Date(call.deadline).getTime() <= Date.now()) return false
  if (topic && !call.topics.some((value) => value.toLowerCase() === topic)) return false
  if (q) {
    const haystack = [call.name, call.funder, call.summary, ...call.topics].join(' ').toLowerCase()
    if (!haystack.includes(q)) return false
  }
  return true
}

export function listFunding(params: URLSearchParams): {
  items: FundingCall[]
  total: number
  facets: {
    kinds: { value: string; count: number }[]
    countries: { value: string; count: number }[]
    topics: { value: string; count: number }[]
    fully_funded: number
    open_only: number
  }
} {
  const items = fundingCalls.filter((call) => fundingMatches(call, params))
  const sort = FUNDING_SORTS[params.get('sort') ?? 'deadline'] ?? FUNDING_SORTS.deadline

  // Counted against the text search only, so a facet never zeroes itself out
  // the moment you use it.
  const base = new URLSearchParams(params)
  for (const key of ['kind', 'country', 'fully_funded', 'open_only', 'topic']) base.delete(key)
  const pool = fundingCalls.filter((call) => fundingMatches(call, base))

  const tally = (pick: (call: FundingCall) => string[]) => {
    const counts = new Map<string, number>()
    for (const call of pool) {
      for (const value of new Set(pick(call))) counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  }

  return {
    items: [...items].sort(sort),
    total: items.length,
    facets: {
      kinds: tally((call) => [call.kind]),
      countries: tally((call) => [call.country_code]),
      topics: tally((call) => call.topics),
      fully_funded: pool.filter((call) => call.fully_funded).length,
      open_only: pool.filter((call) => new Date(call.deadline).getTime() > Date.now()).length,
    },
  }
}

export function researcherDetail(id: string) {
  const researcher = researchers.find((person) => person.id === id)
  if (!researcher) return null
  return {
    researcher,
    publications: publications
      .filter((paper) => paper.researcher_id === id)
      .sort((a, b) => b.year - a.year),
    positions: phdPositions.filter((position) => position.supervisor_id === id),
    labs: labs.filter((lab) => lab.lead_id === id),
  }
}
