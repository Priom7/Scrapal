import { beforeAll, describe, expect, it } from 'vitest'
import { mockConfig, mockFetch } from './http'

// Latency is the point in the browser and noise in a test run.
beforeAll(() => {
  mockConfig.minLatencyMs = 0
  mockConfig.maxLatencyMs = 0
  mockConfig.streamTickMs = 0
})

async function get<T>(path: string): Promise<T> {
  const response = await mockFetch(`/api${path}`)
  expect(response.ok).toBe(true)
  return (await response.json()) as T
}

describe('mock transport', () => {
  it('serves the seeded catalogue', async () => {
    const { items, total } = await get<{ items: { id: string }[]; total: number }>(
      '/v1/admin/course-gallery/courses?',
    )
    expect(items.length).toBeGreaterThan(50)
    expect(total).toBe(items.length)
  })

  it('narrows results by facet filters', async () => {
    const all = await get<{ total: number }>('/v1/admin/course-gallery/courses?')
    const filtered = await get<{ items: { level: string | null }[]; total: number }>(
      '/v1/admin/course-gallery/courses?level=Postgraduate&country=IE',
    )
    expect(filtered.total).toBeGreaterThan(0)
    expect(filtered.total).toBeLessThan(all.total)
    expect(filtered.items.every((course) => course.level === 'Postgraduate')).toBe(true)
  })

  it('reports facet counts for the current filter scope', async () => {
    const facets = await get<{ country: { value: string; count: number }[] }>(
      '/v1/admin/course-gallery/facets?country=NZ',
    )
    expect(facets.country).toEqual([{ value: 'NZ', count: expect.any(Number) }])
  })

  it('reads filters out of a natural-language query', async () => {
    const response = await mockFetch('/api/v1/admin/course-gallery/interpret', {
      method: 'POST',
      body: JSON.stringify({ query: 'part-time masters in Ireland under £18,000' }),
    })
    const { source, filters } = (await response.json()) as {
      source: string
      filters: { level: string; countries: string[]; study_modes: string[]; fee_max: number; q: string | null }
    }
    expect(source).toBe('fallback')
    expect(filters.level).toBe('Postgraduate')
    expect(filters.countries).toEqual(['IE'])
    expect(filters.study_modes).toEqual(['Part-time'])
    expect(filters.fee_max).toBe(18000)
  })

  it('rejects a shortlist add for an unknown record', async () => {
    const response = await mockFetch('/api/v1/admin/course-gallery/shortlist', {
      method: 'POST',
      body: JSON.stringify({ record_id: 'rec-does-not-exist' }),
    })
    expect(response.status).toBe(404)
  })

  it('injects faults on demand', async () => {
    mockConfig.failPathContains = '/v1/collections'
    const failed = await mockFetch('/api/v1/collections')
    const fine = await mockFetch('/api/v1/sources')
    mockConfig.failPathContains = ''
    expect(failed.status).toBe(503)
    expect(fine.ok).toBe(true)
  })

  // Every endpoint api.ts calls is now handled, so this guards the router
  // itself: an unknown path must announce it rather than answer emptily.
  it('flags an unimplemented route instead of failing silently', async () => {
    const response = await mockFetch('/api/v1/not-a-real-endpoint')
    expect(response.status).toBe(501)
  })
})

describe('run simulator', () => {
  it('advances a started run and streams it to completion', async () => {
    const started = await mockFetch('/api/v1/runs', {
      method: 'POST',
      body: JSON.stringify({ source_id: 'src-greenwich' }),
    })
    const run = (await started.json()) as { id: string; status: string }
    expect(run.status).toBe('queued')

    const stream = await mockFetch(`/api/v1/runs/${run.id}/events`)
    expect(stream.headers.get('Content-Type')).toBe('text/event-stream')

    const reader = stream.body!.getReader()
    const decoder = new TextDecoder()
    const seen: string[] = []
    // Read a few frames rather than the whole run: the point is that progress
    // arrives in pieces, not that the simulated crawl finishes quickly.
    for (let i = 0; i < 3; i += 1) {
      const { value, done } = await reader.read()
      if (done) break
      decoder.decode(value).split('\n\n').filter(Boolean).forEach((frame) => {
        seen.push(JSON.parse(frame.replace('data: ', '')).status as string)
      })
    }
    await reader.cancel()
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((status) => ['queued', 'running', 'completed'].includes(status))).toBe(true)
  })

  it('cancels a run and reports it as cancelled', async () => {
    const started = await mockFetch('/api/v1/runs', {
      method: 'POST',
      body: JSON.stringify({ source_id: 'src-coventry' }),
    })
    const { id } = (await started.json()) as { id: string }
    const cancelled = await mockFetch(`/api/v1/runs/${id}/cancel`, { method: 'POST' })
    const run = (await cancelled.json()) as { status: string; cancel_requested: boolean }
    expect(run.status).toBe('cancelled')
    expect(run.cancel_requested).toBe(true)
  })

  it('counts a failed seeded run as an open incident', async () => {
    const response = await mockFetch('/api/v1/admin/observability/overview')
    const stats = (await response.json()) as { runs_total: number; failed_runs: number; open_incidents: number }
    expect(stats.runs_total).toBeGreaterThanOrEqual(4)
    expect(stats.failed_runs).toBeGreaterThan(0)
    expect(stats.open_incidents).toBe(stats.failed_runs)
  })

  it('resolves an incident and keeps it resolved', async () => {
    const list = await mockFetch('/api/v1/admin/observability/incidents')
    const [incident] = (await list.json()) as { id: string }[]
    const resolved = await mockFetch(`/api/v1/admin/observability/incidents/${incident.id}/resolve`, { method: 'POST' })
    expect(((await resolved.json()) as { status: string }).status).toBe('resolved')
    const again = await mockFetch('/api/v1/admin/observability/incidents')
    const found = ((await again.json()) as { id: string; status: string }[]).find((i) => i.id === incident.id)
    expect(found?.status).toBe('resolved')
  })

  it('404s on a run that does not exist', async () => {
    expect((await mockFetch('/api/v1/runs/run-9999')).status).toBe(404)
  })
})

describe('answer streaming', () => {
  const read = async (response: Response) => {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      if (done) break
    }
    return buffer
  }

  const frames = (raw: string) => raw.split('\n\n').filter(Boolean).map((frame) => ({
    event: frame.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim(),
    id: frame.split('\n').find((line) => line.startsWith('id:'))?.slice(3).trim(),
    comment: frame.startsWith(':'),
  }))

  const ask = async (question: string) => {
    const conversation = await mockFetch('/api/v1/conversations', { method: 'POST', body: '{}' })
    const { id } = (await conversation.json()) as { id: string }
    const message = await mockFetch(`/api/v1/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: question, request_id: 'req-1' }),
    })
    const generation = (await message.json()) as { id: string }
    return { conversationId: id, generationId: generation.id }
  }

  it('drops the first connection and resumes from Last-Event-ID', async () => {
    const { conversationId, generationId } = await ask('Which MBA courses have a September intake?')
    const first = frames(await read(
      await mockFetch(`/api/v1/conversations/${conversationId}/events?generation_id=${generationId}`),
    ))
    // The cut connection must stop short of a terminal event, or the client
    // would never exercise its resume path.
    expect(first.some((f) => f.event === 'completed')).toBe(false)
    expect(first[0].comment).toBe(true)

    const lastId = first.filter((f) => f.id).at(-1)!.id!
    const second = frames(await read(await mockFetch(
      `/api/v1/conversations/${conversationId}/events?generation_id=${generationId}`,
      { headers: { 'Last-Event-ID': lastId } },
    )))
    // The resume continues after the last delivered frame; it does not repeat.
    expect(Number(second.filter((f) => f.id)[0].id)).toBe(Number(lastId) + 1)
    expect(second.some((f) => f.event === 'completed')).toBe(true)
    expect(second.some((f) => f.event === 'answer.withheld')).toBe(true)
  })

  it('abstains when nothing in the evidence matches', async () => {
    const { conversationId, generationId } = await ask('zzzz qqqq vvvv')
    const raw = await read(await mockFetch(
      `/api/v1/conversations/${conversationId}/events?generation_id=${generationId}`,
      { headers: { 'Last-Event-ID': '0' } },
    ))
    const seen = frames(raw).map((f) => f.event)
    expect(seen).toContain('abstained')
    expect(seen).not.toContain('answer.delta')
  })

  it('emits citations before the answer they support', async () => {
    const { conversationId, generationId } = await ask('Data Science courses in Ireland')
    // Skip the deliberate drop by resuming from the start.
    await read(await mockFetch(`/api/v1/conversations/${conversationId}/events?generation_id=${generationId}`))
    const seen = frames(await read(await mockFetch(
      `/api/v1/conversations/${conversationId}/events?generation_id=${generationId}`,
      { headers: { 'Last-Event-ID': '0' } },
    ))).map((f) => f.event)
    expect(seen.indexOf('citation')).toBeLessThan(seen.indexOf('answer.delta'))
    expect(seen.filter((e) => e === 'answer.delta').length).toBeGreaterThan(5)
  })

  it('404s for a generation that was never started', async () => {
    const response = await mockFetch('/api/v1/conversations/conv-1/events?generation_id=gen-nope')
    expect(response.status).toBe(404)
  })

  it('rejects an empty question', async () => {
    const conversation = await mockFetch('/api/v1/conversations', { method: 'POST', body: '{}' })
    const { id } = (await conversation.json()) as { id: string }
    const response = await mockFetch(`/api/v1/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: '  ' }),
    })
    expect(response.status).toBe(422)
  })
})

describe('course intelligence', () => {
  const get = async <T,>(path: string): Promise<T> => {
    const response = await mockFetch(`/api${path}`)
    expect(response.ok).toBe(true)
    return (await response.json()) as T
  }

  type Overview = {
    total: number; published: number; review: number; rejected: number
    average_coverage: number
    by_institution: { institution_id: string; total: number; published: number }[]
    missing_fields: { field: string; count: number }[]
  }

  it('tallies every record into exactly one status', async () => {
    const summary = await get<Overview>('/v1/admin/course-intelligence/overview')
    expect(summary.published + summary.review + summary.rejected).toBe(summary.total)
    expect(summary.review).toBeGreaterThan(0)
    expect(summary.by_institution.length).toBeGreaterThan(1)
  })

  it('filters records by status and institution', async () => {
    const inReview = await get<{ id: string; status: string }[]>(
      '/v1/admin/course-intelligence/records?status=review',
    )
    expect(inReview.length).toBeGreaterThan(0)
    expect(inReview.every((record) => record.status === 'review')).toBe(true)

    const scoped = await get<{ id: string }[]>(
      '/v1/admin/course-intelligence/records?institution_id=inst-ucd&status=published',
    )
    expect(scoped.every((record) => record.id.startsWith('rec-ucd'))).toBe(true)
  })

  // The whole reason both views share one store: publishing must move a course
  // into the gallery, not just change a badge.
  it('publishing a record adds it to the gallery', async () => {
    const [pending] = await get<{ id: string }[]>('/v1/admin/course-intelligence/records?status=review')
    const before = await get<{ total: number }>('/v1/admin/course-gallery/courses?')
    const missing = await get<{ items: { id: string }[] }>('/v1/admin/course-gallery/courses?')
    expect(missing.items.some((course) => course.id === pending.id)).toBe(false)

    const published = await mockFetch(`/api/v1/admin/course-intelligence/records/${pending.id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ note: 'Checked against the source page.' }),
    })
    const record = (await published.json()) as { status: string; published: boolean; revision: number }
    expect(record.status).toBe('published')
    expect(record.published).toBe(true)

    const after = await get<{ total: number; items: { id: string }[] }>('/v1/admin/course-gallery/courses?')
    expect(after.total).toBe(before.total + 1)
    expect(after.items.some((course) => course.id === pending.id)).toBe(true)
  })

  it('rejecting a record removes it from the gallery', async () => {
    const [live] = (await get<{ items: { id: string }[] }>('/v1/admin/course-gallery/courses?')).items
    await mockFetch(`/api/v1/admin/course-intelligence/records/${live.id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note: 'Fees contradict the prospectus.' }),
    })
    const after = await get<{ items: { id: string }[] }>('/v1/admin/course-gallery/courses?')
    expect(after.items.some((course) => course.id === live.id)).toBe(false)
  })

  it('404s on a record that does not exist', async () => {
    // A valid note, so this reaches the lookup rather than stopping at
    // body validation the way FastAPI would.
    const response = await mockFetch('/api/v1/admin/course-intelligence/records/rec-nope/publish', {
      method: 'POST',
      body: JSON.stringify({ note: 'Checked against source.' }),
    })
    expect(response.status).toBe(404)
  })

  it('approves an agent proposal', async () => {
    const proposals = await get<{ id: string; status: string }[]>('/v1/action-proposals')
    expect(proposals.every((proposal) => proposal.status === 'pending')).toBe(true)
    const response = await mockFetch(`/api/v1/action-proposals/${proposals[0].id}/approve`, { method: 'POST' })
    expect(((await response.json()) as { status: string }).status).toBe('approved')
  })
})

describe('knowledge search', () => {
  const hits = async (query: string) => {
    const response = await mockFetch(`/api/v1/search?q=${encodeURIComponent(query)}&mode=hybrid`)
    expect(response.ok).toBe(true)
    return ((await response.json()) as { hits: { lexical_score: number; excerpt: string; document_id: string }[] }).hits
  }

  it('indexes only published courses', async () => {
    const documents = await (await mockFetch('/api/v1/documents')).json() as { id: string }[]
    const gallery = await (await mockFetch('/api/v1/admin/course-gallery/courses?')).json() as { total: number }
    expect(documents.length).toBe(gallery.total)
  })

  it('finds passages that contain the words', async () => {
    const found = await hits('entry requirements honours degree')
    expect(found.length).toBeGreaterThan(0)
    expect(found[0].lexical_score).toBeGreaterThan(0)
  })

  // The point of hybrid retrieval: a question whose words appear nowhere still
  // finds the right passage, and the console can say so.
  it('finds fees for a question that never says "fees"', async () => {
    const found = await hits('how much does it cost')
    expect(found.length).toBeGreaterThan(0)
    expect(found.every((hit) => hit.lexical_score < 0.5)).toBe(true)
    expect(found.some((hit) => /£|tuition/i.test(hit.excerpt))).toBe(true)
  })

  it('returns nothing for a query of only stopwords', async () => {
    expect(await hits('what are the')).toEqual([])
  })
})

describe('add source wizard', () => {
  const preview = (body: Record<string, unknown>) => mockFetch('/api/v1/crawl-blueprints/preview', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  const valid = {
    collection_id: 'col-uk-courses',
    name: 'Greenwich courses',
    start_url: 'https://www.gre.ac.uk/',
    objective: 'Find every course with its fees, intakes and entry requirements.',
    domain_pack: 'university',
    required_fields: ['title', 'fees', 'deadlines'],
  }

  it('projects coverage from what the seeded pages actually contain', async () => {
    const blueprint = (await (await preview(valid)).json()) as {
      id: string
      discovery_json: { coverage_projection: { field_rates: Record<string, number>; confidence: string } }
    }
    const rates = blueprint.discovery_json.coverage_projection.field_rates
    expect(rates.title).toBe(1)
    // Deadlines are absent from every fixture, so the projection must say so
    // rather than inventing a plausible-looking number.
    expect(rates.deadlines).toBe(0)
    expect(blueprint.discovery_json.coverage_projection.confidence).toBe('high')
  })

  it('is candid about a domain it has never crawled', async () => {
    const blueprint = (await (await preview({ ...valid, start_url: 'https://example.edu/' })).json()) as {
      discovery_json: { coverage_projection: { confidence: string }; sitemaps: string[]; warnings: string[] }
    }
    expect(blueprint.discovery_json.coverage_projection.confidence).toBe('low')
    expect(blueprint.discovery_json.sitemaps).toEqual([])
    expect(blueprint.discovery_json.warnings.join(' ')).toContain('has not crawled example.edu before')
  })

  it('rejects a start URL that is not a URL, and a thin objective', async () => {
    expect((await preview({ ...valid, start_url: 'gre.ac.uk' })).status).toBe(422)
    expect((await preview({ ...valid, objective: 'courses' })).status).toBe(422)
  })

  it('edits scope, approves, and starts a crawl on a new source', async () => {
    const blueprint = (await (await preview(valid)).json()) as { id: string; version: number }

    const patched = (await (await mockFetch(`/api/v1/crawl-blueprints/${blueprint.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ max_pages: 120, exclude_patterns: ['/news'] }),
    })).json()) as { suggested_config: { max_pages: number }; version: number }
    expect(patched.suggested_config.max_pages).toBe(120)
    expect(patched.version).toBe(blueprint.version + 1)

    const approved = (await (await mockFetch(`/api/v1/crawl-blueprints/${blueprint.id}/approve`, { method: 'POST' })).json()) as { status: string }
    expect(approved.status).toBe('approved')

    const before = ((await (await mockFetch('/api/v1/sources')).json()) as unknown[]).length
    const run = (await (await mockFetch(`/api/v1/crawl-blueprints/${blueprint.id}/run`, { method: 'POST' })).json()) as { id: string; status: string; source_id: string }
    const after = ((await (await mockFetch('/api/v1/sources')).json()) as { id: string }[])
    expect(after.length).toBe(before + 1)
    expect(after.at(-1)!.id).toBe(run.source_id)
    expect(run.status).toBe('queued')
  })

  it('404s on a blueprint that does not exist', async () => {
    expect((await mockFetch('/api/v1/crawl-blueprints/bp-nope/approve', { method: 'POST' })).status).toBe(404)
  })
})

describe('returning a record to review', () => {
  it('undoes a publish by sending the record back to review', async () => {
    const [pending] = (await (await mockFetch('/api/v1/admin/course-intelligence/records?status=review')).json()) as { id: string }[]
    await mockFetch(`/api/v1/admin/course-intelligence/records/${pending.id}/publish`, {
      method: 'POST', body: JSON.stringify({ note: 'Checked against source.' }),
    })
    const inGallery = (await (await mockFetch('/api/v1/admin/course-gallery/courses?')).json()) as { items: { id: string }[] }
    expect(inGallery.items.some((course) => course.id === pending.id)).toBe(true)

    const undone = (await (await mockFetch(`/api/v1/admin/course-intelligence/records/${pending.id}/review`, {
      method: 'POST', body: JSON.stringify({ note: 'Returned to review.' }),
    })).json()) as { status: string; published: boolean }
    expect(undone.status).toBe('review')
    expect(undone.published).toBe(false)

    const after = (await (await mockFetch('/api/v1/admin/course-gallery/courses?')).json()) as { items: { id: string }[] }
    expect(after.items.some((course) => course.id === pending.id)).toBe(false)
  })

  it('requires a review note, as the API does', async () => {
    const [record] = (await (await mockFetch('/api/v1/admin/course-intelligence/records?status=review')).json()) as { id: string }[]
    const response = await mockFetch(`/api/v1/admin/course-intelligence/records/${record.id}/review`, {
      method: 'POST', body: JSON.stringify({ note: 'ok' }),
    })
    expect(response.status).toBe(422)
  })
})
