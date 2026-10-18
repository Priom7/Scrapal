// What the operator film shows. It continues the student film: the same
// fictional Northbridge University and the same £17,500 fee Amara saw, traced
// back through the engine room. Fictional on purpose — see ../data.ts.

export const SITE = {
  name: 'Northbridge University — course catalogue',
  host: 'northbridge.ac.uk',
  start: 'https://www.northbridge.ac.uk/study/',
}

export const BLUEPRINT = {
  sampled: 42,
  links: '1,284',
  projected: 86,
  fields: [
    ['tuition', 0.92], ['duration', 0.96], ['intakes', 0.88],
    ['entry requirements', 0.81], ['english requirements', 0.74], ['scholarships', 0.38],
  ] as [string, number][],
  families: [['course', 412], ['fees', 96], ['entry', 88], ['scholarships', 24], ['news', 310], ['events', 142]] as [string, number][],
  include: ['/study/', '/fees/', '/entry-requirements/'],
  exclude: ['/news/', '/events/', '/alumni/'],
  maxPages: 600,
  depth: 3,
}

/** RunPath.tsx stages, with the counts a finished crawl reports. */
export const RUN = [
  { key: 'discover', label: 'Discover', count: 1284, unit: 'URLs found', seconds: 6.2 },
  { key: 'fetch', label: 'Fetch', count: 612, unit: 'pages checked', seconds: 94.8 },
  { key: 'extract', label: 'Extract', count: 598, unit: 'pages interpreted', seconds: 41.3 },
  { key: 'save', label: 'Save', count: 590, unit: 'new documents', seconds: 3.9 },
  { key: 'complete', label: 'Complete', count: 8, unit: 'policy skips', seconds: 0 },
]

/** The course page, as captured. Each fact's `source` names the sentence it was read from. */
export const PAGE = {
  url: 'northbridge.ac.uk/study/msc-data-science',
  title: 'MSc Data Science',
  sentences: [
    { id: 'start', text: 'Start dates: September 2027 and January 2028.' },
    { id: 'length', text: 'Duration: 1 year full-time, or 2 years part-time.' },
    { id: 'fee', text: 'Tuition for international students is £17,500 for the full course (2027/28 entry).' },
    { id: 'entry', text: 'You will need a 2:1 honours degree in a quantitative subject.' },
    { id: 'english', text: 'IELTS 6.5 overall, with no band below 6.0.' },
  ],
}

export const FACTS = [
  { field: 'tuition_international', value: '£17,500', source: 'fee', confidence: 0.97 },
  { field: 'duration', value: '1 year full-time', source: 'length', confidence: 0.99 },
  { field: 'intakes', value: 'Sep 2027 · Jan 2028', source: 'start', confidence: 0.94 },
  { field: 'entry_requirement', value: '2:1, quantitative', source: 'entry', confidence: 0.91 },
  { field: 'english_requirement', value: 'IELTS 6.5 (6.0 min)', source: 'english', confidence: 0.95 },
]

export const PROPOSALS = [
  { type: 'update_crawl_scope', risk: 'low' as const, title: 'Widen the Northbridge crawl to include the fees pages it skipped', why: 'Tuition is missing on 18 courses. The fees live under /study/fees, which the current include rules exclude.' },
  { type: 'republish_records', risk: 'medium' as const, title: 'Republish 6 courses whose entry requirements changed', why: 'The source pages changed after the last publish. The new text is captured and cited, but republishing changes what students see.' },
  { type: 'throttle_source', risk: 'low' as const, title: 'Lower the crawl rate for lakeshore.ie after repeated 503s', why: 'Three consecutive pages returned 503. Halving the rate should let the run finish.' },
]

export const QUESTION = 'What does the Data Science MSc at Northbridge cost for international students?'

/** The Retrieval Lab's decision matrix: three lanes, fused (RRF, k=60). */
export const RANKING = [
  { title: 'MSc Data Science · Fees', detail: 'northbridge.ac.uk · tuition_international', structured: 1, lexical: 2, semantic: 1, fused: 1, score: '0.0325', included: true },
  { title: 'MSc Data Science · Overview', detail: 'northbridge.ac.uk · course page', structured: 2, lexical: 1, semantic: 3, fused: 2, score: '0.0318', included: true },
  { title: 'Postgraduate fees 2027/28', detail: 'northbridge.ac.uk · fees table', structured: null, lexical: 3, semantic: 2, fused: 3, score: '0.0315', included: true },
  { title: 'MSc Data Analytics · Fees', detail: 'lakeshore.ie · tuition_international', structured: null, lexical: 5, semantic: 4, fused: 4, score: '0.0308', included: false },
]
