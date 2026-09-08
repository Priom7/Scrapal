// Turning a piece of research into a fingerprint.
//
// This is the privacy boundary of the whole Radar feature, so it is worth being
// precise about what it is for. Someone may paste an unpublished proposal, a
// patentable idea or a confidential dataset description. That text must never
// reach an external scholarly search — sending someone's unpublished paragraph
// to a third-party API discloses their idea.
//
// So the flow is: raw text stays on the device, this module reduces it to a
// small set of published terms, and only those terms travel. The fingerprint
// deliberately holds no free text and no sentences from the source: every field
// is drawn from the vocabulary below or is a short published n-gram, which is
// what makes it safe to send. `Fingerprint` is the only thing the match API
// accepts, so the boundary is enforced by the types rather than by discipline.
//
// Pure on purpose: no fetching, no model, no React. On device this stands in
// for the local Ollama pass; the shape it produces is the contract either way.

export type Term = {
  /** The published phrase that will be searched. */
  label: string
  /** How strongly it carries the work, 0–1. Drives ordering, not truth. */
  weight: number
}

export type CareerStage =
  | 'undergraduate' | 'masters' | 'phd-applicant' | 'phd-researcher' | 'postdoc' | 'faculty' | 'unknown'

export type Fingerprint = {
  topics: Term[]
  methods: Term[]
  applications: Term[]
  discipline: string | null
  careerStage: CareerStage
  /** Words the reader can strike out before anything is searched. */
  keywords: string[]
  /** Length of the source, so the UI can say how much it had to work with. */
  words: number
}

type Entry = { label: string; match: RegExp; kind: 'topic' | 'method' | 'application'; discipline?: string }

/** The vocabulary this stand-in recognises. A real local model would not need a
    list, but the list keeps the mock honest: it can only claim to have found
    something it can actually name. */
const VOCABULARY: Entry[] = [
  // --- machine learning -----------------------------------------------------
  { label: 'graph neural networks', match: /\bgraph neural networks?\b|\bgnns?\b/i, kind: 'method', discipline: 'Computer Science' },
  { label: 'deep learning', match: /\bdeep learning\b|\bneural networks?\b/i, kind: 'method', discipline: 'Computer Science' },
  { label: 'machine learning', match: /\bmachine learning\b|\bstatistical learning\b/i, kind: 'topic', discipline: 'Computer Science' },
  { label: 'transformers', match: /\btransformers?\b|\battention mechanisms?\b/i, kind: 'method', discipline: 'Computer Science' },
  { label: 'natural language processing', match: /\bnatural language processing\b|\bnlp\b/i, kind: 'topic', discipline: 'Computer Science' },
  { label: 'computer vision', match: /\bcomputer vision\b|\bimage recognition\b/i, kind: 'topic', discipline: 'Computer Science' },
  { label: 'reinforcement learning', match: /\breinforcement learning\b/i, kind: 'method', discipline: 'Computer Science' },
  { label: 'explainable AI', match: /\bexplainab(le|ility)\b|\binterpretab(le|ility)\b|\bxai\b/i, kind: 'topic', discipline: 'Computer Science' },
  { label: 'responsible AI', match: /\bresponsible ai\b|\bai (safety|ethics)\b|\balgorithmic fairness\b|\bfairness\b/i, kind: 'topic', discipline: 'Computer Science' },
  { label: 'anomaly detection', match: /\banomaly detection\b|\boutlier detection\b/i, kind: 'topic', discipline: 'Computer Science' },
  { label: 'federated learning', match: /\bfederated learning\b/i, kind: 'method', discipline: 'Computer Science' },
  { label: 'causal inference', match: /\bcausal inference\b|\bcausality\b/i, kind: 'method', discipline: 'Statistics' },
  { label: 'network science', match: /\bnetwork (science|analysis)\b|\btransaction networks?\b|\bgraph theory\b/i, kind: 'topic', discipline: 'Computer Science' },

  // --- application areas ----------------------------------------------------
  { label: 'financial fraud detection', match: /\b(financial )?fraud\b|\bmoney laundering\b|\baml\b/i, kind: 'application', discipline: 'Computer Science' },
  { label: 'healthcare', match: /\bhealthcare\b|\bclinical\b|\bmedical\b|\bdiagnos(is|tic)\b|\bpatients?\b/i, kind: 'application', discipline: 'Medicine' },
  { label: 'drug discovery', match: /\bdrug discovery\b|\bmolecular\b|\bproteins?\b/i, kind: 'application', discipline: 'Biochemistry' },
  { label: 'climate science', match: /\bclimate\b|\bcarbon\b|\bemissions?\b|\bglobal warming\b/i, kind: 'application', discipline: 'Environmental Science' },
  { label: 'sustainability', match: /\bsustainab(le|ility)\b|\brenewable\b|\bnet zero\b/i, kind: 'application', discipline: 'Environmental Science' },
  { label: 'materials science', match: /\bmaterials? (science|discovery)\b|\bsemiconductors?\b/i, kind: 'application', discipline: 'Materials Science' },
  { label: 'robotics', match: /\brobotics?\b|\bautonomous (systems?|vehicles?)\b|\bhuman-robot\b/i, kind: 'topic', discipline: 'Engineering' },
  { label: 'quantum computing', match: /\bquantum (computing|information|technolog)/i, kind: 'topic', discipline: 'Physics' },
  { label: 'cybersecurity', match: /\bcyber ?security\b|\bintrusion detection\b|\bmalware\b/i, kind: 'application', discipline: 'Computer Science' },
  { label: 'education', match: /\beducation(al)?\b|\bpedagog(y|ical)\b|\blearning analytics\b/i, kind: 'application', discipline: 'Education' },
  { label: 'public policy', match: /\bpublic policy\b|\bgovernance\b|\bregulation\b/i, kind: 'application', discipline: 'Social Science' },
  { label: 'social good', match: /\bsocial good\b|\bsocial impact\b|\binequality\b/i, kind: 'application', discipline: 'Social Science' },

  // --- research methods -----------------------------------------------------
  { label: 'randomised controlled trials', match: /\brandomi[sz]ed controlled trials?\b|\brcts?\b/i, kind: 'method', discipline: 'Medicine' },
  { label: 'qualitative methods', match: /\bqualitative\b|\bethnograph(y|ic)\b|\binterviews?\b/i, kind: 'method', discipline: 'Social Science' },
  { label: 'simulation', match: /\bsimulations?\b|\bagent-based model/i, kind: 'method', discipline: null as unknown as string },
  { label: 'time series analysis', match: /\btime series\b|\btemporal (data|dynamics|graphs?)\b/i, kind: 'method', discipline: 'Statistics' },
  { label: 'bayesian statistics', match: /\bbayesian\b|\bprobabilistic model/i, kind: 'method', discipline: 'Statistics' },
]

const STAGES: { stage: CareerStage; match: RegExp }[] = [
  { stage: 'phd-applicant', match: /\bphd (proposal|application|applicant)\b|\bdoctoral proposal\b|\bapplying for a phd\b/i },
  { stage: 'phd-researcher', match: /\b(my )?(phd|doctoral) (thesis|research|project)\b|\bi am a phd (student|candidate)\b/i },
  { stage: 'postdoc', match: /\bpostdoc(toral)?\b|\bfellowship application\b/i },
  { stage: 'faculty', match: /\b(i am|as) a (professor|lecturer|principal investigator)\b|\bmy (lab|group)\b/i },
  { stage: 'masters', match: /\b(msc|master'?s) (thesis|dissertation|project)\b/i },
  { stage: 'undergraduate', match: /\b(ba|bsc|undergraduate|final year) (project|dissertation|thesis)\b/i },
]

const STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'their', 'these', 'those', 'have',
  'has', 'been', 'are', 'was', 'were', 'will', 'would', 'can', 'could', 'should', 'which', 'when',
  'where', 'what', 'how', 'why', 'our', 'its', 'his', 'her', 'they', 'them', 'using', 'used', 'use',
  'based', 'such', 'also', 'more', 'most', 'other', 'than', 'then', '但', 'research', 'paper',
  'study', 'work', 'propose', 'proposed', 'approach', 'method', 'methods', 'results', 'show',
  'shows', 'shown', 'novel', 'new', 'we', 'i', 'a', 'an', 'of', 'in', 'on', 'to', 'is', 'it', 'as',
  'by', 'be', 'at', 'or', 'not', 'but',
])

/** How often the term appears, damped so a word repeated forty times does not
    drown out everything else. */
function weigh(text: string, pattern: RegExp): number {
  const all = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`)
  const hits = text.match(all)?.length ?? 0
  if (!hits) return 0
  return Math.min(1, 0.45 + Math.log2(hits + 1) * 0.22)
}

/** Words that carry the work but are not in the vocabulary. Kept because a
    fingerprint made only of a fixed list would miss what is actually new about
    the research — and novelty is the reason someone is searching at all. */
function salientWords(text: string, already: string[]): string[] {
  const known = new Set(already.flatMap((label) => label.toLowerCase().split(/\s+/)))
  const counts = new Map<string, number>()
  for (const raw of text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []) {
    if (STOP.has(raw) || known.has(raw)) continue
    counts.set(raw, (counts.get(raw) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([word]) => word)
}

/**
 * Reduce a piece of writing to the terms that can safely be searched.
 *
 * Nothing from `text` survives into the result except published vocabulary
 * terms and single salient words — no sentences, no phrasing, nothing that
 * would disclose the idea itself.
 */
export function fingerprint(text: string): Fingerprint {
  const clean = text.trim()
  const words = clean ? clean.split(/\s+/).length : 0

  const found = VOCABULARY
    .map((entry) => ({ entry, weight: weigh(clean, entry.match) }))
    .filter((hit) => hit.weight > 0)
    .sort((a, b) => b.weight - a.weight)

  const byKind = (kind: Entry['kind']): Term[] => found
    .filter((hit) => hit.entry.kind === kind)
    .map((hit) => ({ label: hit.entry.label, weight: Number(hit.weight.toFixed(2)) }))

  // The discipline is whichever one the most matched terms point at, so a paper
  // that mentions healthcare once but graphs throughout is not filed as medicine.
  const tally = new Map<string, number>()
  for (const hit of found) {
    if (!hit.entry.discipline) continue
    tally.set(hit.entry.discipline, (tally.get(hit.entry.discipline) ?? 0) + hit.weight)
  }
  const discipline = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const stage = STAGES.find((candidate) => candidate.match.test(clean))?.stage ?? 'unknown'
  const labels = found.map((hit) => hit.entry.label)

  return {
    topics: byKind('topic'),
    methods: byKind('method'),
    applications: byKind('application'),
    discipline,
    careerStage: stage,
    keywords: [...labels, ...salientWords(clean, labels)],
    words,
  }
}

/** Nothing recognised means nothing can honestly be matched. */
export function isEmpty(print: Fingerprint): boolean {
  return print.keywords.length === 0
}

export const STAGE_LABELS: Record<CareerStage, string> = {
  undergraduate: 'Undergraduate',
  masters: "Master's",
  'phd-applicant': 'Applying for a PhD',
  'phd-researcher': 'PhD researcher',
  postdoc: 'Postdoctoral',
  faculty: 'Faculty',
  unknown: 'Not stated',
}
