# Researcher provenance (console slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every research figure in the console say where it came from, and make an empty Radar able to tell "nothing matched" apart from "we have not harvested here".

**Architecture:** Phase 0 of the researcher-discovery design — frontend only. New provenance types in `api.ts`; the claim-bearing fields on `Researcher` and `Publication` become `Attributed<T>` wrappers carrying a source and a retrieval date; `mock/research.ts` emits provenance that deliberately varies; display helpers are pure functions in `student/radar/provenance.ts` so the logic is tested even though components are not.

**Tech Stack:** TypeScript 5.7, React 19, Vite 6, Vitest 3. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-10-researcher-discovery-sources-design.md`

## Global Constraints

- **Frontend only.** Nothing here needs Postgres, Redis, FastAPI or the Celery worker. Everything runs under `npm run dev:mock` and `npm test` from `console/`.
- **There is no jsdom and no testing-library in this project.** Do not add one, and do not write component render tests. Tests are pure-logic tests (`vitest.config` in `vite.config.ts` sets `VITE_MOCK: '1'` and loads `src/test-setup.ts` for `localStorage`). Anything that must be tested goes in a pure function; components stay thin enough to verify by eye.
- **Mock fixtures must stay deterministic.** `mock/research.ts` derives everything from the seeded `rng(seed)` or from the record index. Never use `Math.random()` or `Date.now()` in a fixture — reloads and screenshots have to stay comparable.
- **`api.ts` is a frozen backend contract.** The changes in Task 2 are a deliberate, spec-approved break the backend must later honour. Do not make further contract changes beyond what this plan specifies.
- **Licence rule, enforced by test:** a `SourceRef` with `licence: 'restricted'` may never appear as the `source` of any `Attributed` value. ORCID may say *this is the same person*; it may never supply a field value.
- **Existing guarantees must not regress.** `student/radar/fingerprint.ts` and its test are untouched: no phrase from a user's document may travel. `mock/radar.test.ts` scoring behaviour must be unchanged by this work — only `.value` accessors change in it.
- Run `npm run lint` and `npx tsc -b` alongside `npm test` before each commit. Working directory for every command is `console/`.

---

### Task 1: Provenance vocabulary and display helpers

Adds the types and the pure functions that turn them into the app's own wording. Nothing consumes them yet, so this task cannot break the build — which is why it comes first.

**Files:**
- Modify: `console/src/api.ts` (append to the research section, after `RadarQuery` at the end of the file's research block)
- Create: `console/src/student/radar/provenance.ts`
- Test: `console/src/student/radar/provenance.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - Types `SourceKey`, `Licence`, `SourceRef`, `Attributed<T>`, `Provenance`, `Coverage` in `api.ts`.
  - `sourceLabel(source: SourceKey): string`
  - `attributionText<T>(value: Attributed<T>): string`
  - `contributingSources(provenance: Provenance): string`

- [ ] **Step 1: Add the types to `api.ts`**

Append to the research section of `console/src/api.ts`, immediately after the `RadarQuery` type:

```ts
/* -------------------------------------------------------------- provenance */

export type SourceKey =
  | 'openalex' | 'crossref' | 'dblp' | 'datacite' | 'pubmed' | 'ror'
  | 'orcid' | 'ukri_gtr' | 'grants_gov' | 'institution_page'

/**
 * What we are allowed to do with what a source gave us.
 *
 * `restricted` is the load-bearing one: such a source may contribute
 * identifiers — evidence that two records are the same person — and may never
 * supply a field value. A test asserts this rather than a comment asking
 * people to be careful.
 */
export type Licence = 'cc0' | 'open' | 'restricted'

export type SourceRef = {
  source: SourceKey
  source_id: string
  url: string
  licence: Licence
  retrieved_at: string
}

/**
 * A value that makes a claim about a person, carrying where it came from.
 *
 * OpenAlex and DBLP will disagree about an h-index and neither is wrong, so
 * the number is not sayable on its own. Wrapping it means every display site
 * has to confront the source instead of quietly dropping it.
 */
export type Attributed<T> = { value: T; source: SourceKey; retrieved_at: string }

export type Provenance = {
  sources: SourceRef[]
  /** false when this came from live federation rather than the reconciled
      graph — per-request merging is genuinely weaker, and says so. */
  reconciled: boolean
}

/**
 * Whether the query fell inside the harvest manifest.
 *
 * This belongs to the query, not to a record: when nothing comes back there is
 * no record left to carry it, and "nothing matched" and "we have not harvested
 * here" are different answers that an empty page must not conflate.
 */
export type Coverage = { in_slice: boolean }
```

- [ ] **Step 2: Write the failing test**

Create `console/src/student/radar/provenance.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Provenance } from '../../api'
import { attributionText, contributingSources, sourceLabel } from './provenance'

const REF = (source: Provenance['sources'][number]['source'], licence: 'cc0' | 'open' | 'restricted') => ({
  source, licence, source_id: 'x', url: 'https://example.org/x', retrieved_at: '2026-06-15T00:00:00Z',
})

describe('provenance wording', () => {
  it('names each source the way a reader would recognise it', () => {
    expect(sourceLabel('openalex')).toBe('OpenAlex')
    expect(sourceLabel('ukri_gtr')).toBe('UKRI Gateway to Research')
  })

  it('reads a figure the same way a money reference figure reads', () => {
    expect(attributionText({ value: 41, source: 'openalex', retrieved_at: '2026-06-15T00:00:00Z' }))
      .toBe('OpenAlex, checked June 2026')
  })

  it('lists every source that fed a record, in the order the record gives', () => {
    const provenance: Provenance = {
      sources: [REF('openalex', 'cc0'), REF('dblp', 'cc0'), REF('orcid', 'restricted')],
      reconciled: true,
    }
    expect(contributingSources(provenance)).toBe('OpenAlex, DBLP, ORCID')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- provenance`
Expected: FAIL — `Failed to resolve import "./provenance"`.

- [ ] **Step 4: Write the implementation**

Create `console/src/student/radar/provenance.ts`:

```ts
// Where a research figure came from, in the app's own voice.
//
// The student app already has one way of saying this: MoneyPage renders a
// reference figure as "Student living cost surveys, checked 2026-06". A number
// about a researcher says it the same way rather than inventing a second
// treatment for the same idea.
import type { Attributed, Provenance, SourceKey } from '../../api'

const LABELS: Record<SourceKey, string> = {
  openalex: 'OpenAlex',
  crossref: 'Crossref',
  dblp: 'DBLP',
  datacite: 'DataCite',
  pubmed: 'PubMed',
  ror: 'ROR',
  orcid: 'ORCID',
  ukri_gtr: 'UKRI Gateway to Research',
  grants_gov: 'Grants.gov',
  institution_page: 'the institution’s own page',
}

export function sourceLabel(source: SourceKey): string {
  return LABELS[source]
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "OpenAlex, checked June 2026". Month precision on purpose: a day would
    imply the figure changes daily, and a harvest does not. */
export function attributionText<T>(value: Attributed<T>): string {
  const at = new Date(value.retrieved_at)
  return `${sourceLabel(value.source)}, checked ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`
}

/** The sources that fed a record, in the order the record lists them.
    Identifier-only sources are named too: they are why we believe this is one
    person rather than two, which is a contribution worth showing. */
export function contributingSources(provenance: Provenance): string {
  return provenance.sources.map((ref) => sourceLabel(ref.source)).join(', ')
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- provenance`
Expected: PASS, 3 tests.

- [ ] **Step 6: Verify nothing else broke, then commit**

Run: `npx tsc -b && npm run lint && npm test`
Expected: clean build, no lint errors, all existing tests pass.

```bash
git add console/src/api.ts console/src/student/radar/provenance.ts console/src/student/radar/provenance.test.ts
git commit -m "feat(radar): provenance types and display helpers"
```

---

### Task 2: Attributed fields, provenance-varying fixtures, licence invariant

The breaking change, done in one commit because a type change and its consumers cannot be split without leaving the build red. Most of it is mechanical: read sites gain `.value`.

**Files:**
- Modify: `console/src/api.ts:400-420` (the `Researcher` and `Publication` types)
- Modify: `console/src/mock/research.ts:110-165` (researcher and publication fixtures)
- Modify: `console/src/mock/radar.ts` (lines 44, 89, 202, 264, 265, 287, 289, 316)
- Modify: `console/src/student/radar/PersonCard.tsx:114-115,128`
- Modify: `console/src/student/radar/ResearcherPage.tsx:71,136,179,180`
- Modify: `console/src/mock/radar.test.ts:85,120,122,123,151,158,159,162,163,198`
- Test: `console/src/mock/provenance.test.ts` (new)

**Interfaces:**
- Consumes: `SourceKey`, `Licence`, `SourceRef`, `Attributed`, `Provenance` from Task 1.
- Produces:
  - `Researcher.provenance: Provenance`, `Researcher.topics: Attributed<string[]>`, `Researcher.publication_count: Attributed<number>`, `Researcher.h_index: Attributed<number>`.
  - `Publication.provenance: Provenance`, `Publication.citations: Attributed<number>`.
  - `HARVESTED_TOPICS: Set<string>` exported from `mock/research.ts` — the lowercased topic vocabulary the fixtures represent as harvested. Task 4 consumes it.

- [ ] **Step 1: Write the failing test**

Create `console/src/mock/provenance.test.ts`. This is the licence invariant — the test that turns the ORCID commercial-use question into something the build fails on.

```ts
// The licence rule, as a test rather than a policy note.
//
// A licence-restricted source may say "these two records are the same person"
// and may never say "this person's h-index is 41". Checking it here means a
// fixture that breaks the rule fails the build, rather than being noticed in a
// review months later.
import { describe, expect, it } from 'vitest'
import type { Attributed, Licence, SourceKey } from '../api'
import { publications, researchers } from './research'

/** Which licence each source's data carries, as the fixtures assert it. */
const LICENCES: Record<SourceKey, Licence> = {
  openalex: 'cc0', dblp: 'cc0', ror: 'cc0',
  crossref: 'open', datacite: 'open', pubmed: 'open',
  ukri_gtr: 'open', grants_gov: 'open', institution_page: 'open',
  orcid: 'restricted',
}

function attributed(): Attributed<unknown>[] {
  return [
    ...researchers.flatMap((person) => [person.topics, person.publication_count, person.h_index]),
    ...publications.map((paper) => paper.citations),
  ]
}

describe('licence invariant', () => {
  it('never lets a restricted source supply a field value', () => {
    for (const value of attributed()) {
      expect(LICENCES[value.source]).not.toBe('restricted')
    }
  })

  it('only claims a source on a record that record actually names', () => {
    for (const person of researchers) {
      const named = new Set(person.provenance.sources.map((ref) => ref.source))
      for (const value of [person.topics, person.publication_count, person.h_index]) {
        expect(named.has(value.source)).toBe(true)
      }
    }
  })

  it('still uses restricted sources for identity, or the rule is untested', () => {
    const restricted = researchers.filter((person) =>
      person.provenance.sources.some((ref) => ref.licence === 'restricted'))
    expect(restricted.length).toBeGreaterThan(0)
  })

  it('has both reconciled and unreconciled records, so both paths render', () => {
    expect(researchers.some((person) => person.provenance.reconciled)).toBe(true)
    expect(researchers.some((person) => !person.provenance.reconciled)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- mock/provenance`
Expected: FAIL — TypeScript/runtime error, `person.topics.source` is undefined because `topics` is still a bare `string[]`.

- [ ] **Step 3: Change the types in `api.ts`**

In `console/src/api.ts`, replace the corresponding lines of the `Researcher` type:

```ts
  discipline: string
  /** One source per record, never a blend. A merged topic list cannot honestly
      name a single source, so other sources' topics inform matching without
      being folded into the attributed set. */
  topics: Attributed<string[]>
  bio: string
  publication_count: Attributed<number>
  h_index: Attributed<number>
  years_active: number
  open_to_supervise: boolean
  hiring_phd: boolean
  has_funding: boolean
  open_to_collaborate: boolean
  provenance: Provenance
```

And in the `Publication` type:

```ts
  citations: Attributed<number>
  doi: string
  topics: string[]
  provenance: Provenance
```

`Publication.topics` stays a bare `string[]`: it describes the paper, not a person, so it makes no claim needing attribution.

- [ ] **Step 4: Update the fixtures in `mock/research.ts`**

Add above `export const researchers`:

```ts
/** The topic vocabulary the fixtures stand for as harvested. A query naming
    none of these fell outside the manifest — which is a different answer from
    "nothing matched", and the Radar has to be able to say so. */
export const HARVESTED_TOPICS = new Set(
  PEOPLE.flatMap((person) => person.topics).map((topic) => topic.toLowerCase()),
)

/** Deterministic retrieval dates. A harvest happens on a day, not continuously,
    so figures from one source share a date. */
const HARVESTED_AT = '2026-06-15T00:00:00Z'
const FEDERATED_AT = '2026-09-01T00:00:00Z'

function sourcesFor(index: number, discipline: string, slug: string, verified: boolean): Provenance {
  // Every record has the spine and the institution. Computer scientists also
  // have DBLP; verified people also have an ORCID — as an identifier only,
  // which is the whole point of the licence rule.
  const reconciled = index % 5 !== 4
  const at = reconciled ? HARVESTED_AT : FEDERATED_AT
  const sources: SourceRef[] = [
    { source: 'openalex', licence: 'cc0', source_id: `A${5000 + index * 13}`, url: `https://openalex.org/A${5000 + index * 13}`, retrieved_at: at },
    { source: 'ror', licence: 'cc0', source_id: `0${index % 9}rbrt${index}`, url: `https://ror.org/0${index % 9}rbrt${index}`, retrieved_at: at },
  ]
  if (discipline === 'Computer Science' && reconciled) {
    sources.push({ source: 'dblp', licence: 'cc0', source_id: `pers/${slug}`, url: `https://dblp.org/pid/${slug}`, retrieved_at: at })
  }
  if (verified && reconciled) {
    sources.push({ source: 'orcid', licence: 'restricted', source_id: `0000-000${1 + (index % 9)}-${1000 + index * 7}-${2000 + index * 3}`, url: 'https://orcid.org/', retrieved_at: at })
  }
  return { sources, reconciled }
}
```

Add `Provenance` and `SourceRef` to the existing `import type { ... } from '../api'` list at the top of the file.

Then, inside the `researchers` map, replace the three scalar fields and add provenance. `verified` is currently an inline expression in the object literal (`index % 4 !== 3`) but `sourcesFor` needs it too, so lift it to a local alongside the existing `slug`:

```ts
    const verified = index % 4 !== 3
    const provenance = sourcesFor(index, person.discipline, slug, verified)
    const at = provenance.sources[0].retrieved_at
```

and the fields become:

```ts
    verified,
    discipline: person.discipline,
    topics: { value: person.topics, source: 'openalex', retrieved_at: at },
    bio: bioFor(person.topics),
    publication_count: { value: 40 + Math.floor(random() * 140), source: 'openalex', retrieved_at: at },
    h_index: { value: 12 + Math.floor(random() * 48), source: 'openalex', retrieved_at: at },
    years_active: 4 + Math.floor(random() * 26),
    open_to_supervise: index % 3 !== 2,
    hiring_phd: index % 4 === 0 || index % 7 === 1,
    has_funding: index % 3 === 0,
    open_to_collaborate: index % 2 === 0,
    provenance,
```

**Order matters for determinism:** `publication_count` must be built before `h_index`, in that order, because both draw from the same `random()` sequence. Reordering them silently changes every fixture.

In the `publications` map, `researcher.topics` is now wrapped, and citations gain attribution:

```ts
    const topics = [...researcher.topics.value].sort(() => random() - 0.5).slice(0, 2)
```

```ts
      citations: { value: Math.floor(random() * 420), source: 'openalex', retrieved_at: HARVESTED_AT },
      doi: `10.5555/scrapal.${index}.${n}`,
      topics,
      provenance: {
        sources: [
          { source: 'openalex', licence: 'cc0', source_id: `W${9000 + index * 31 + n}`, url: `https://openalex.org/W${9000 + index * 31 + n}`, retrieved_at: HARVESTED_AT },
          { source: 'crossref', licence: 'open', source_id: `10.5555/scrapal.${index}.${n}`, url: `https://doi.org/10.5555/scrapal.${index}.${n}`, retrieved_at: HARVESTED_AT },
        ],
        reconciled: true,
      },
```

Also at lines 232, 235, 245 and 249, `researcher.topics` becomes `researcher.topics.value` for the lab and PhD-position fixtures.

- [ ] **Step 5: Update `mock/radar.ts` — mechanical, eight sites**

| Line | Was | Becomes |
|---|---|---|
| 44 | `researchers.map((person) => person.topics)` | `researchers.map((person) => person.topics.value)` |
| 89 | `shared(query, researcher.topics)` | `shared(query, researcher.topics.value)` |
| 202 | `for (const topic of match.researcher.topics)` | `for (const topic of match.researcher.topics.value)` |
| 264 | `b.h_index - a.h_index` | `b.h_index.value - a.h_index.value` |
| 265 | `b.publication_count - a.publication_count` | `b.publication_count.value - a.publication_count.value` |
| 287 | `person.topics.some(...)` | `person.topics.value.some(...)` |
| 289 | `...person.topics]` | `...person.topics.value]` |
| 316 | `for (const topic of person.topics)` | `for (const topic of person.topics.value)` |

Scoring behaviour must be identical after this. If `mock/radar.test.ts` reports a different ranking, a `.value` was missed or the fixture field order changed — do not adjust the expectations to fit.

- [ ] **Step 6: Update the component read sites**

`PersonCard.tsx:114-115`:

```tsx
      {person.topics.value.slice(0, 3).map((topic) => <li key={topic}>{topic}</li>)}
      {person.topics.value.length > 3 && <li className="more">+{person.topics.value.length - 3}</li>}
```

`PersonCard.tsx:128`: `{paper.citations.value} citations`

`ResearcherPage.tsx:71`: `{person.topics.value.map((topic) => <li key={topic}>{topic}</li>)}`

`ResearcherPage.tsx:136`: `{paper.citations.value} citations`

`ResearcherPage.tsx:179-180`: `{person.publication_count.value} publications` and `h-index {person.h_index.value}`. Attribution wording is added in Task 3, not here.

- [ ] **Step 7: Update `mock/radar.test.ts` — expectations unchanged, accessors only**

Lines 85, 120, 122, 123, 198: `match.researcher.topics` → `match.researcher.topics.value`, and `p.topics.includes(...)` → `p.topics.value.includes(...)`.

Line 151: `${person.topics.join(' ')}` → `${person.topics.value.join(' ')}`.

Lines 158-159 and 162-163: `p.h_index` → `p.h_index.value`, `p.publication_count` → `p.publication_count.value`.

- [ ] **Step 8: Run the full suite**

Run: `npx tsc -b && npm run lint && npm test`
Expected: clean build; `mock/provenance.test.ts` passes all four; every previously-passing test still passes with unchanged assertions — including `fingerprint.test.ts`, which must not have been touched at all.

- [ ] **Step 9: Commit**

```bash
git add console/src/api.ts console/src/mock/research.ts console/src/mock/radar.ts console/src/mock/radar.test.ts console/src/mock/provenance.test.ts console/src/student/radar/PersonCard.tsx console/src/student/radar/ResearcherPage.tsx
git commit -m "feat(radar): attribute claim-bearing researcher figures to their source"
```

---

### Task 3: Attribution in the UI

Makes the provenance visible. There is no jsdom, so this task is verified by the build, the lint, and by looking at it under `npm run dev:mock` — the checks in Step 5 are the deliverable's test cycle.

**Files:**
- Modify: `console/src/student/radar/PersonCard.tsx` (after the `.topic-pills` list)
- Modify: `console/src/student/radar/ResearcherPage.tsx:179-180`
- Modify: `console/src/student.css` (near `.cost-source`, around line 522)

**Interfaces:**
- Consumes: `attributionText`, `contributingSources` from Task 1; `Researcher.provenance` from Task 2.
- Produces: no new exports.

- [ ] **Step 1: Add the styles**

In `console/src/student.css`, directly after the `.cost-source` rule:

```css
/* Where a research figure came from. Deliberately the same weight and colour
   as .cost-source above: the app already has a way of saying "here is the
   source", and a second, louder treatment would read as a different kind of
   claim. */
.attributed-source { display: block; color: var(--s-faint); font-size: 0.74rem; }
.card-sources { margin-top: 0.4rem; color: var(--s-faint); font-size: 0.72rem; }
.card-sources .unreconciled { color: var(--s-unmet); }
```

- [ ] **Step 2: Add the sources line to `PersonCard.tsx`**

Add `import { contributingSources } from './provenance'` to the imports, then insert immediately after the `</ul>` closing the `topic-pills` list and before `<p className="match-bio">`:

```tsx
    <p className="card-sources">
      {person.provenance.reconciled
        ? <>From {contributingSources(person.provenance)}</>
        : <><span className="unreconciled">Live result, not yet merged</span> · {contributingSources(person.provenance)}</>}
    </p>
```

The unreconciled wording says what is actually weaker about it — that this record was assembled per-request rather than from accumulated evidence, so it may be a duplicate of another person on the page. "Unverified" would have been the wrong word: it is not a claim about the researcher.

- [ ] **Step 3: Attribute the figures on `ResearcherPage.tsx`**

Add `import { attributionText } from './provenance'` to the imports, then replace lines 179-180:

```tsx
          <li>
            <FileText size={ICON.sm} aria-hidden="true" /> {person.publication_count.value} publications
            <small className="attributed-source">{attributionText(person.publication_count)}</small>
          </li>
          <li>
            <Quote size={ICON.sm} aria-hidden="true" /> h-index {person.h_index.value}
            <small className="attributed-source">{attributionText(person.h_index)}</small>
          </li>
```

- [ ] **Step 4: Build and lint**

Run: `npx tsc -b && npm run lint && npm test`
Expected: clean, and every test from Tasks 1 and 2 still passing.

- [ ] **Step 5: Look at it**

Run: `npm run dev:mock`, then check each of these and fix anything that looks wrong before committing:

1. `/student/people` — every card carries a sources line. Most read `From OpenAlex, ROR…`; roughly one in five reads `Live result, not yet merged`.
2. Computer scientists name DBLP; verified people name ORCID; unreconciled people name neither.
3. `/student/researchers/r-sarah-mitchell` — the publications count and h-index each sit above a small grey `OpenAlex, checked June 2026`, matching the weight of the source lines on `/student/money`.
4. The sources line does not push the standing chip, the score ring or the action buttons out of alignment at a narrow window width.

- [ ] **Step 6: Commit**

```bash
git add console/src/student/radar/PersonCard.tsx console/src/student/radar/ResearcherPage.tsx console/src/student.css
git commit -m "feat(radar): show where each researcher figure came from"
```

---

### Task 4: Coverage, and the honest empty state

The point of the whole provenance model: an empty Radar that can tell the reader which kind of empty it is.

**Files:**
- Modify: `console/src/api.ts` (the `RadarResults` type)
- Modify: `console/src/mock/radar.ts` (the function building `RadarResults`, around lines 236-250)
- Modify: `console/src/student/radar/RadarPage.tsx:345-349`
- Test: `console/src/mock/radar.test.ts` (append a new `describe`)

**Interfaces:**
- Consumes: `Coverage` from Task 1; `HARVESTED_TOPICS` from Task 2.
- Produces: `RadarResults.coverage: Coverage`.

- [ ] **Step 1: Write the failing test**

Append to `console/src/mock/radar.test.ts`:

```ts
describe('coverage', () => {
  it('reports a query about a harvested area as in slice', async () => {
    const results = await api.radarMatch(queryFor(EXAMPLE))
    expect(results.coverage.in_slice).toBe(true)
  })

  it('says an unharvested area is unharvested rather than unmatched', async () => {
    // Nothing in the fixtures is about medieval literature, and nothing ever
    // will be: the manifest is the claim about coverage, so a query outside it
    // must not come back looking like a query that simply found nothing.
    const results = await api.radarMatch({
      topics: ['medieval literature'], methods: [], applications: [],
      discipline: null, keywords: ['manuscripts'],
    })
    expect(results.researchers).toHaveLength(0)
    expect(results.coverage.in_slice).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- mock/radar`
Expected: FAIL — `results.coverage` is undefined.

- [ ] **Step 3: Add `coverage` to the contract**

In `console/src/api.ts`, add to `RadarResults` after `next_deadline`:

```ts
  /** Whether any searched term falls inside the harvest manifest. An empty
      result means something different in each case, so the reader is told
      which. */
  coverage: Coverage
```

- [ ] **Step 4: Compute it in `mock/radar.ts`**

Add `HARVESTED_TOPICS` to the existing import from `./research`, and in the function that assembles `RadarResults`, add alongside the other fields:

```ts
    coverage: {
      in_slice: terms(query).some((term) => HARVESTED_TOPICS.has(term)),
    },
```

`terms()` already lowercases and de-duplicates, and `HARVESTED_TOPICS` is built lowercased, so the two sides agree without further normalising.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- mock/radar`
Expected: PASS, including every pre-existing scoring test unchanged.

- [ ] **Step 6: Say it in the UI**

In `console/src/student/radar/RadarPage.tsx`, replace the `if (!total)` block at lines 345-349:

```tsx
  if (!total) {
    return results.coverage.in_slice
      ? <EmptyState title="Nothing matched those terms yet">
        Scrapal only returns something when it can name why it matched, so an empty result means no
        overlap rather than a hidden list. Try adding a method or an application area to your text.
      </EmptyState>
      : <EmptyState title="We have not covered this area yet">
        This is not "nothing matched" — Scrapal has not harvested research in this area, so there was
        nothing to match against. Coverage grows over time.
        {results.adjacent.length > 0 && <> The closest areas we do cover are {results.adjacent.slice(0, 3).join(', ')}.</>}
      </EmptyState>
  }
```

Telling someone their field found no overlap, when the truth is that we never looked, is the specific failure this replaces.

- [ ] **Step 7: Build, lint, test**

Run: `npx tsc -b && npm run lint && npm test`
Expected: all clean.

- [ ] **Step 8: Look at it**

Run: `npm run dev:mock`, go to `/student/radar`, and paste a paragraph about medieval manuscript conservation. Expected: the "We have not covered this area yet" state, not "Nothing matched those terms yet". Then paste the graph-neural-networks example from `radar.test.ts` and confirm normal results still render with scores and reasons.

- [ ] **Step 9: Commit**

```bash
git add console/src/api.ts console/src/mock/radar.ts console/src/mock/radar.test.ts console/src/student/radar/RadarPage.tsx
git commit -m "feat(radar): tell an unharvested area apart from an unmatched one"
```

---

## Notes for the executor

**Two things the spec does not say, decided here:**

1. **`Coverage` lives on `RadarResults`, not on `ResearcherPage`.** The spec puts `in_slice` inside per-record `Provenance`, but with zero results there is no record to carry it, and the empty state is exactly where the distinction matters. It is therefore query-level. It was not added to the People directory because every topic filter there comes from the corpus facets and so is in-slice by construction — adding it would be a field that can never be false.

2. **`Provenance` here has no `in_slice` field**, for the same reason. If the backend later needs per-record slice membership, that is an additive change.

**A known limit of the current fixtures:** because a topic overlap always produces at least one match, `in_slice: true` with zero Radar results is not reachable through the mock. The existing "Nothing matched those terms yet" copy is kept as the branch a real backend can reach — with filters, thresholds and partial harvests — but Task 4's test can only cover the out-of-slice branch honestly. Do not fabricate a test for the unreachable one.

**Out of scope for this plan** (phase 1 and later in the spec): browser-direct federation against real OpenAlex/Crossref/ROR, the static term-frequency table, any connector, and anything touching `src/scrapal/`.
