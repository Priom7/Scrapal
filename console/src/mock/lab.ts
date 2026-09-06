// The retrieval workbench shows each stage of the pipeline separately, so the
// mock has to produce genuinely different candidate sets per stage rather than
// one list relabelled three times.
import type { EmbeddingProfile, RetrievalRun, SearchHit } from '../api'
import { search } from './search'

export const profiles: EmbeddingProfile[] = [
  {
    id: 'emb-nomic-1',
    provider: 'ollama',
    model: 'nomic-embed-text',
    dimensions: 768,
    normalization: 'l2',
    version: '1.5',
    active: true,
    healthy: true,
  },
  {
    id: 'emb-minilm',
    provider: 'local',
    model: 'all-MiniLM-L6-v2',
    dimensions: 384,
    normalization: 'l2',
    version: '2.2',
    active: false,
    healthy: true,
  },
]

let counter = 0

function candidate(hit: SearchHit, score: number): Record<string, unknown> {
  return {
    chunk_id: hit.chunk_id,
    document_id: hit.document_id,
    title: hit.title,
    heading: hit.heading,
    url: hit.url,
    excerpt: hit.excerpt,
    score: Number(score.toFixed(3)),
  }
}

export function runRetrieval(input: {
  query?: string
  mode?: string
  include_drafts?: boolean
  collection_id?: string | null
}): RetrievalRun {
  counter += 1
  const query = (input.query ?? '').trim()
  const mode = input.mode ?? 'hybrid'
  const hits = search(query, input.collection_id)

  // Each stage ranks the same pool differently — that difference is the whole
  // point of showing three columns.
  const lexical = [...hits].sort((a, b) => b.lexical_score - a.lexical_score).slice(0, 8)
  const vector = [...hits].sort((a, b) => b.vector_score - a.vector_score).slice(0, 8)
  const fused = hits.slice(0, 8)
  const context = fused.slice(0, 4)

  const supported = context.slice(0, 3).map((hit, index) => ({
    sentence: `${hit.title.split(' — ')[0]}: ${hit.excerpt.slice(0, 120).trim()}…`,
    supported: true,
    citations: [index + 1],
    reason: null,
  }))
  // One unsupported sentence, so the validator's failure state is visible.
  const unsupported = context.length
    ? [{
      sentence: 'Applications typically close six weeks before the intake begins.',
      supported: false,
      citations: [],
      reason: 'No retrieved passage states an application deadline.',
    }]
    : []

  const answer = context.length
    ? supported.map((item) => item.sentence).join(' ')
    : null

  return {
    id: `ret-${String(counter).padStart(4, '0')}`,
    query,
    mode,
    include_drafts: Boolean(input.include_drafts),
    query_plan: {
      intent: context.length ? 'evidence_lookup' : 'unknown',
      entities: [...new Set(context.map((hit) => hit.section_path[0]))],
      requested_fields: [...new Set(context.map((hit) => hit.heading.toLowerCase().replace(/\s+/g, '_')))],
      search_query: query,
      source: 'mock',
    },
    structured_matches: context.map((hit) => ({
      record_id: hit.document_id.replace('doc-', ''),
      field: hit.heading,
      value: hit.excerpt.slice(0, 80),
    })),
    lexical_candidates: lexical.map((hit) => candidate(hit, hit.lexical_score)),
    vector_candidates: vector.map((hit) => candidate(hit, hit.vector_score)),
    fused_candidates: fused,
    context_json: context,
    generated_answer: answer,
    citation_results: [...supported, ...unsupported],
    abstention_reason: context.length ? null : 'No published evidence matched the question.',
    answer_model: 'llama3.1:8b',
    exclusions_json: input.include_drafts
      ? []
      : [{ reason: 'unpublished_record', count: 28, detail: 'Records still in review were excluded.' }],
    timings_json: {
      plan_ms: 34,
      structured_ms: 12,
      lexical_ms: 21,
      vector_ms: 58,
      fusion_ms: 7,
      validation_ms: context.length ? 96 : 0,
      total_ms: 228,
    },
    created_at: new Date().toISOString(),
  }
}
