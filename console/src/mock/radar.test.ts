// Exercised through the api client and the mock transport, not by calling the
// matcher directly, so request building and error unwrapping stay on the tested
// path — the same reason the rest of the mock is tested this way.
import { beforeAll, describe, expect, it } from 'vitest'
import { api, type RadarQuery } from '../api'
import { fingerprint } from '../student/radar/fingerprint'
import { mockConfig } from './http'

const EXAMPLE = 'Graph neural networks for detecting financial fraud in transaction networks.'

function queryFor(text: string): RadarQuery {
  const print = fingerprint(text)
  return {
    topics: print.topics.map((term) => term.label),
    methods: print.methods.map((term) => term.label),
    applications: print.applications.map((term) => term.label),
    discipline: print.discipline,
    keywords: print.keywords,
  }
}

beforeAll(() => {
  // Latency belongs to the transport; the matcher is what is being tested here.
  mockConfig.minLatencyMs = 0
  mockConfig.maxLatencyMs = 0
})

describe('radar matching', () => {
  it('finds researchers who work on what was written about', async () => {
    const results = await api.radarMatch(queryFor(EXAMPLE))
    const names = results.researchers.map((match) => match.researcher.name)
    expect(names).toContain('Dr Priya Nair')
    expect(names).toContain('Prof. Lucas Moreau')
  })

  it('never returns a match it cannot explain', async () => {
    const results = await api.radarMatch(queryFor(EXAMPLE))
    const every = [
      ...results.researchers, ...results.funding, ...results.positions, ...results.labs,
    ]
    expect(every.length).toBeGreaterThan(0)
    for (const match of every) {
      expect(match.reasons.length).toBeGreaterThan(0)
      for (const reason of match.reasons) {
        expect(reason.detail.trim()).not.toBe('')
      }
    }
  })

  it('names the shared area rather than only scoring it', async () => {
    const results = await api.radarMatch(queryFor(EXAMPLE))
    const priya = results.researchers.find((match) => match.researcher.name === 'Dr Priya Nair')!
    const area = priya.reasons.find((reason) => reason.label === 'Shared research area')!
    expect(area.detail).toContain('financial fraud detection')
  })

  it('ranks the closest work first', async () => {
    const results = await api.radarMatch(queryFor(EXAMPLE))
    const scores = results.researchers.map((match) => match.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })

  it('returns nothing at all when the fingerprint is empty, rather than everything', async () => {
    const results = await api.radarMatch({
      topics: [], methods: [], applications: [], discipline: null, keywords: [],
    })
    expect(results.researchers).toHaveLength(0)
    expect(results.funding).toHaveLength(0)
    expect(results.next_deadline).toBeNull()
  })

  it('surfaces funding and PhD positions on the same terms', async () => {
    const results = await api.radarMatch(queryFor(EXAMPLE))
    expect(results.funding.length).toBeGreaterThan(0)
    expect(results.positions.length).toBeGreaterThan(0)
    const call = results.funding[0]
    expect(call.reasons.some((reason) => reason.label === 'Deadline')).toBe(true)
  })

  it('offers adjacent topics that are grounded in a matched researcher', async () => {
    const results = await api.radarMatch(queryFor(EXAMPLE))
    const searched = new Set(results.searched)
    for (const topic of results.adjacent) {
      expect(searched.has(topic.toLowerCase())).toBe(false)
      const grounded = results.researchers.some((match) => match.researcher.topics.includes(topic))
      expect(grounded).toBe(true)
    }
  })

  it('reports the soonest deadline still ahead, never one that has passed', async () => {
    const results = await api.radarMatch(queryFor(EXAMPLE))
    expect(results.next_deadline).not.toBeNull()
    expect(new Date(results.next_deadline!).getTime()).toBeGreaterThan(Date.now())
  })


  it('ranks by how much of the student\'s work is covered, not how narrow the profile is', async () => {
    // Dr Priya Nair works on graph neural networks *and* financial fraud
    // detection — the distinctive half of this query. Prof. Yuki Sato is a
    // bioinformatician who happens to list graph neural networks and deep
    // learning. Scoring against the researcher's own topic count put Sato
    // first, because two of his three topics matched, which is the wrong
    // question to ask.
    const results = await api.radarMatch(queryFor(EXAMPLE))
    const rank = (name: string) => results.researchers.findIndex((match) => match.researcher.name === name)
    expect(rank('Dr Priya Nair')).toBeGreaterThanOrEqual(0)
    expect(rank('Dr Priya Nair')).toBeLessThan(rank('Prof. Yuki Sato'))
  })

  it('weighs a rare shared topic above a common one', async () => {
    // "responsible AI" is listed by 20 of the 61 things the Radar knows about;
    // "quantum computing" by 2. Asking for both, a person who matches only the
    // rare half has told you far more than one who matches only the common
    // half, and the score has to reflect that.
    const results = await api.radarMatch({
      topics: ['responsible AI', 'quantum computing'],
      methods: [], applications: [], discipline: null,
      keywords: ['responsible AI', 'quantum computing'],
    })
    const rare = results.researchers.find((match) => match.researcher.topics.includes('quantum computing'))!
    const common = results.researchers.find((match) => (
      match.researcher.topics.includes('responsible AI')
      && !match.researcher.topics.includes('quantum computing')
    ))!
    expect(rare.score).toBeGreaterThan(common.score + 10)
  })

  it('spreads scores rather than calling everything a good match', async () => {
    const results = await api.radarMatch(queryFor(EXAMPLE))
    const scores = results.researchers.map((match) => match.score)
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(15)
  })

  it('refuses a request that carries the document itself', async () => {
    // The type forbids it, so a caller could only do this by casting — which is
    // exactly the mistake worth failing loudly on.
    const smuggled = { ...queryFor(EXAMPLE), text: 'my unpublished proposal' } as RadarQuery
    await expect(api.radarMatch(smuggled)).rejects.toThrow(/fingerprint, not the document/i)
  })
})

describe('researcher directory', () => {
  it('filters to people who are open to supervise', async () => {
    const { items } = await api.researchers({ open_to_supervise: true })
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((person) => person.open_to_supervise)).toBe(true)
  })

  it('searches across name, institution and topic', async () => {
    const { items } = await api.researchers({ q: 'oxford' })
    expect(items.every((person) => `${person.name} ${person.institution} ${person.topics.join(' ')}`
      .toLowerCase().includes('oxford'))).toBe(true)
  })


  it('sorts by standing, publications, experience and name on request', async () => {
    const standing = await api.researchers({ sort: 'standing' })
    expect(standing.items.map((p) => p.h_index)).toEqual(
      [...standing.items.map((p) => p.h_index)].sort((a, b) => b - a),
    )
    const published = await api.researchers({ sort: 'publications' })
    expect(published.items.map((p) => p.publication_count)).toEqual(
      [...published.items.map((p) => p.publication_count)].sort((a, b) => b - a),
    )
    const named = await api.researchers({ sort: 'name' })
    expect(named.items.map((p) => p.name)).toEqual([...named.items.map((p) => p.name)].sort())
  })

  it('counts a facet against the text search but not against itself', async () => {
    // Ticking "hiring PhD students" must not make its own count read zero, so
    // the number stays the same before and after the filter is applied.
    const before = await api.researchers({})
    const after = await api.researchers({ hiring_phd: true })
    expect(after.facets.hiring_phd).toBe(before.facets.hiring_phd)
    expect(after.total).toBe(before.facets.hiring_phd)
  })

  it('narrows facet counts when the text search narrows the pool', async () => {
    const all = await api.researchers({})
    const oxford = await api.researchers({ q: 'oxford' })
    expect(oxford.facets.open_to_supervise).toBeLessThan(all.facets.open_to_supervise)
  })

  it('offers research areas with the number of people working on each', async () => {
    const { facets } = await api.researchers({})
    expect(facets.topics.length).toBeGreaterThan(5)
    expect(facets.topics.map((t) => t.count)).toEqual(
      [...facets.topics.map((t) => t.count)].sort((a, b) => b - a),
    )
    const graph = facets.topics.find((t) => t.value === 'graph neural networks')!
    const filtered = await api.researchers({ topic: 'graph neural networks' })
    expect(filtered.total).toBe(graph.count)
  })

  it('combines a topic, an availability filter and a search', async () => {
    const { items } = await api.researchers({ topic: 'graph neural networks', open_to_supervise: true })
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((p) => p.topics.includes('graph neural networks') && p.open_to_supervise)).toBe(true)
  })

  it('returns an empty list rather than everything when nothing matches', async () => {
    const { items, total } = await api.researchers({ q: 'zzzz-no-such-person' })
    expect(items).toHaveLength(0)
    expect(total).toBe(0)
  })


  it('returns only the ids asked for, in both directories', async () => {
    const all = await api.researchers({})
    const wanted = [all.items[0].id, all.items[2].id]
    const some = await api.researchers({ ids: wanted })
    expect(some.items.map((p) => p.id).sort()).toEqual([...wanted].sort())

    const calls = await api.funding({})
    const twoCalls = [calls.items[0].id, calls.items[1].id]
    const someCalls = await api.funding({ ids: twoCalls, sort: 'deadline' })
    expect(someCalls.items.map((c) => c.id).sort()).toEqual([...twoCalls].sort())
  })

  it('returns nothing for an id that does not exist, rather than everything', async () => {
    // An empty saved list must not read as "no filter".
    const none = await api.researchers({ ids: ['r-nobody'] })
    expect(none.items).toHaveLength(0)
  })

  it('returns a profile with its publications newest first', async () => {
    const { items } = await api.researchers({})
    const detail = await api.researcher(items[0].id)
    expect(detail.researcher.id).toBe(items[0].id)
    const years = detail.publications.map((paper) => paper.year)
    expect(years).toEqual([...years].sort((a, b) => b - a))
  })

  it('404s for a researcher who does not exist', async () => {
    await expect(api.researcher('r-nobody')).rejects.toThrow(/not found/i)
  })
})

describe('funding directory', () => {
  it('orders by the soonest deadline by default', async () => {
    const { items } = await api.funding({})
    const dates = items.map((call) => new Date(call.deadline).getTime())
    expect(dates).toEqual([...dates].sort((a, b) => a - b))
  })

  it('hides calls that have already closed when asked', async () => {
    const open = await api.funding({ open_only: true })
    expect(open.items.length).toBeGreaterThan(0)
    for (const call of open.items) {
      expect(new Date(call.deadline).getTime()).toBeGreaterThan(Date.now())
    }
  })

  it('sorts by award size on request', async () => {
    const { items } = await api.funding({ sort: 'amount' })
    const amounts = items.map((call) => call.amount)
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a))
  })

  it('filters by kind, and the facet count agrees with the result', async () => {
    const all = await api.funding({})
    const phdCount = all.facets.kinds.find((entry) => entry.value === 'phd')!.count
    const phd = await api.funding({ kind: 'phd' })
    expect(phd.total).toBe(phdCount)
    expect(phd.items.every((call) => call.kind === 'phd')).toBe(true)
  })

  it('counts a facet against the search but not against itself', async () => {
    const before = await api.funding({})
    const after = await api.funding({ fully_funded: true })
    expect(after.facets.fully_funded).toBe(before.facets.fully_funded)
    expect(after.total).toBe(before.facets.fully_funded)
  })

  it('narrows facet counts when the text search narrows the pool', async () => {
    const all = await api.funding({})
    const narrowed = await api.funding({ q: 'doctoral' })
    expect(narrowed.facets.topics.length).toBeLessThan(all.facets.topics.length)
  })

  it('combines a topic, a kind and "fully funded"', async () => {
    const { items } = await api.funding({ topic: 'graph neural networks', kind: 'phd', fully_funded: true })
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((call) => (
      call.topics.includes('graph neural networks') && call.kind === 'phd' && call.fully_funded
    ))).toBe(true)
  })

  it('returns nothing rather than everything when nothing matches', async () => {
    const { items, total } = await api.funding({ q: 'zzzz-no-such-call' })
    expect(items).toHaveLength(0)
    expect(total).toBe(0)
  })
})
