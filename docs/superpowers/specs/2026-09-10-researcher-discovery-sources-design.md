# Researcher discovery data sources — design

Designed 2026-09-10. Supplies the Research Opportunity Radar (Phase 1B) with
real data, replacing the mock research layer in `console/src/mock/research.ts`.

## What it answers

The Radar already renders researchers, publications, funding calls, PhD
positions and labs, each with named reasons for the match. Every one of those
records is currently invented. This design says where they come from instead.

It also answers a question the shipped UI cannot answer today: **where did this
number come from, and are we allowed to use it?** OpenAlex and DBLP will
disagree about an h-index and neither is wrong; ORCID can tell you two records
are the same person but its free API may not be usable commercially. Both facts
have to live in the schema, not in a policy document.

## Sources

Track 1, the scholarly graph:

| Source | Supplies | Licence class |
|---|---|---|
| OpenAlex | Researchers, works, topics, institutions, co-authors, citations | `cc0` — the spine |
| Crossref | DOIs, authors, funders, affiliations, licences | `open` |
| DBLP | Computer-science authors, publications, venues | `cc0` |
| DataCite | Dataset and software creators, contributors | `open` |
| PubMed / NCBI | Biomedical authors and publications, via E-utilities | `open` |
| ROR | Canonical institutions and their aliases | `cc0` |
| ORCID | Researcher identity links only | `restricted` |

Track 2, the opportunity feed:

| Source | Supplies |
|---|---|
| UKRI Gateway to Research | Awarded projects, funded people |
| Grants.gov | Open US calls |
| University funding and vacancy pages | Funded PhDs, studentships, deadlines |

Not used, deliberately: Google Scholar, LinkedIn, ResearchGate, Academia.edu,
and email harvesting as a discovery strategy. Publicly visible personal data is
still personal data; the product claim is "we index open scholarly metadata",
not "we scraped fifty million researchers".

## Shape

Two tracks feeding one graph.

**Track 1** is OpenAlex-led. Each source becomes a connector in
`connectors/scholarly/`, alongside the existing `website.py` and `document.py`,
exposing one shape: given a harvest instruction, yield source-neutral records
with provenance attached. Nothing downstream knows which API a record came from
except through that provenance.

**The harvest boundary is an explicit manifest**, not an emergent property. A
checked-in file names the ROR institution IDs, the OpenAlex topic IDs and the
recency window defining the slice, so coverage is a reviewable decision rather
than a mystery. Queries outside the slice fall through to live federation,
cached on return and marked out-of-slice, so the UI can distinguish "nothing
matched" from "we have not harvested here".

Pipeline stages, each independently testable:

    fetch -> normalise -> reconcile -> merge -> corpus statistics -> read models

Corpus statistics are their own stage because the Radar's rarity weighting
depends on term document frequencies over the whole slice. That weighting
currently exists only in the mock (`console/src/mock/radar.ts`,
`log(documents.length / seen)`); the backend must reproduce its behaviour, and
`radar.test.ts` is the statement of what it does. They are computed once per harvest
and served as a table, so scoring never needs a full-corpus scan per query.

**Track 2** runs on a different cadence for a structural reason: calls expire
and papers do not. It needs a daily pass that transitions calls to closed and
emits change events, while track 1 refreshes weekly at most. Its crawling half
reuses the existing website connector and record-extraction path rather than
introducing a second crawler. It joins track 1 on topics and on ROR ID.

**The browser-direct fallback** is track 1's federation stage compiled to run in
the console against the CORS-friendly, no-auth subset (OpenAlex, Crossref,
ROR). It shares normalisation and merge code with the backend but skips the
corpus-statistics stage, so it ranks with a shipped static term-frequency table
and labels its results unreconciled.

## Identity

`Researcher.id` is minted by Scrapall and stable forever. It is not an OpenAlex
author ID, because those merge and retire when OpenAlex reruns disambiguation —
and `console/src/student/saved.ts` persists researcher IDs in `localStorage`
while `changes.ts` compares against what was there when the user saved it. An
upstream identity change must be a migration we run, not a broken bookmark on
someone's device.

Three tables:

| Table | Holds |
|---|---|
| `researchers` | Minted ID and the merged record |
| `researcher_identifiers` | `(researcher_id, source, source_id, confidence, evidence, first_seen)`, unique on `(source, source_id)` |
| `researcher_redirects` | `(old_id, new_id, reason, at)`, resolved on every read |

Uniqueness on `(source, source_id)` is what makes merging fall out of insertion:
finding an identifier already claimed *is* the merge signal.

Merge rules, strongest first: a shared ORCID is definitive; a shared OpenAlex
author ID is definitive within OpenAlex; shared DOIs plus a compatible name is
strong; name plus institution plus topic overlap is weak and merges only above a
threshold. **Name alone never merges, at any confidence.** Common names across
large disciplines would silently fuse distinct people, and a fused researcher is
worse than a duplicate — the duplicate looks odd, the fusion looks
authoritative.

Every merge stores its evidence, which makes reconciliation re-runnable and
reversible. A merge that cannot be undone is a data-loss event wearing a
normal-looking migration.

**Splits** have no single successor, so a redirect cannot express one. Policy:
the minted ID stays with the largest fragment by work count, other fragments
mint new IDs, and a saved reference resolves to the retained record with the UI
able to say it was split. `changes.ts` already exists to tell someone what moved
since they saved something. Silently resolving to half a person is the failure
mode being avoided.

**Institutions** reconcile the same way through ROR's alias list, so
`University College London`, `UCL` and `University College, London` collapse to
one ROR ID. Unmatched strings are kept verbatim in a review queue rather than
guessed at. `services/institutions.py` is the existing home.

**A manual override table sits above all of it** — human corrections
reconciliation must not undo on the next run. Without it every re-harvest
re-breaks the same record and nothing can ever be permanently fixed.

## Provenance and licence

New types in `console/src/api.ts`:

```ts
export type SourceKey =
  | 'openalex' | 'crossref' | 'dblp' | 'datacite' | 'pubmed' | 'ror'
  | 'orcid' | 'ukri_gtr' | 'grants_gov' | 'institution_page'

/** cc0: reusable without condition. open: reusable, attribution or terms
    apply. restricted: identifiers only — may never supply a field value. */
export type Licence = 'cc0' | 'open' | 'restricted'

export type SourceRef = {
  source: SourceKey
  source_id: string
  url: string
  licence: Licence
  retrieved_at: string
}

/** A value that makes a claim about a person, carrying where it came from.
    OpenAlex and DBLP will disagree about an h-index and neither is wrong,
    so the number is not sayable without its source. */
export type Attributed<T> = { value: T; source: SourceKey; retrieved_at: string }

export type Provenance = {
  sources: SourceRef[]
  /** false when this came from live federation rather than the reconciled
      graph — per-request merging is genuinely weaker, and says so. */
  reconciled: boolean
  /** false when the query fell outside the harvest manifest, so the UI can
      distinguish "nothing matched" from "we have not harvested here". */
  in_slice: boolean
}
```

`Researcher` gains `provenance: Provenance`, and its claim-bearing fields become
`Attributed`: `publication_count`, `h_index`, `topics`. `Publication.citations`
likewise. Name, bio, institution and identifiers inherit the record's
provenance — nobody asks the origin of a name.

`topics` needs one rule stated, because it is the only claim-bearing field that
is a set and so could be assembled from several sources at once. A merged topic
set cannot honestly name a single source, so it does not try: topics come from
one source per record — OpenAlex where present, otherwise the highest-priority
source that has them — and other sources' topics are used for matching evidence
without being folded into the attributed set. Blending them would produce a
list attributed to a source that never said half of it.

**The licence rule is a checkable invariant, not a policy note:** a `SourceRef`
with `licence: 'restricted'` may never appear as the `source` of any
`Attributed` value. One test over the fixtures enforces it. This converts the
ORCID commercial-use question from a standing compliance risk into something the
build fails on — ORCID may say *this is the same person* and may never say
*this person's h-index is 41*.

This is a **deliberate breaking change to the frozen `api.ts` contract**, which
the backend must later honour. `h_index: number` becoming `Attributed<number>`
touches `PersonCard`, `ResearcherPage`, the `standing` and `publications` sorts,
and `mock/radar.ts`. The cheaper alternative — a side-car
`attribution: Record<string, SourceRef>` map leaving scalars alone — was
rejected because it lets a field be displayed with no attribution while nothing
complains, which is the exact failure the wrapper exists to prevent. `RadarQuery`
already establishes that this codebase enforces guarantees through the compiler
rather than through comments.

## Console slice

Shaped so the backend later conforms to it rather than redesigning it.

**Reuse the existing visual language.** `student/reference.ts` already models
figures as `{ source, checked }` and `MoneyPage.tsx` renders them as
`{source}, checked {checked}`; `CoursePage.tsx` already says
`Read from {hostname}`. Attributed research figures should look like the money
figures rather than introducing a competing treatment:
`h-index 41 · OpenAlex, checked June 2026`.

1. **Types** — the additions above; consumers updated mechanically to `.value`.
2. **Mock fixtures** — `mock/research.ts` emits provenance that actually varies:
   some researchers reconciled from OpenAlex plus DBLP plus ORCID-as-identifier,
   some from OpenAlex alone, some `reconciled: false`, some `in_slice: false`.
   Deterministic as always. Uniformly perfect fixtures would leave every
   honest-disclosure path untested.
3. **Attribution in the UI** — `PersonCard` gains a compact contributing-sources
   line; `ResearcherPage` attributes claim-bearing figures individually.
   `PersonCard` stays one component, as it already is for Radar and directory.
4. **The two honest states** — `in_slice: false` renders as *outside what we
   have harvested*, not *no matches*; `reconciled: false` renders as a live,
   unmerged result. An empty page that cannot tell these apart is saying
   something false.

Testing: an invariant test that no `Attributed` value names a `restricted`
source; `fingerprint.test.ts` untouched and still passing; `radar.test.ts`
updated for `.value` with scoring behaviour unchanged; coverage of both new
empty states. Runs under `npm run dev:mock` — no Postgres, Redis or worker.

## Refresh, limits and failure

**Be identifiable.** Every request carries a `User-Agent` naming Scrapall with a
contact address; OpenAlex and Crossref also get their `mailto` parameter. This
is what puts the harvest in Crossref's polite pool. Anonymous bulk harvesting is
how an IP gets blocked, and a blocked IP is an outage that does not appear in
the logs.

**Per-source budgets, one limiter each**, shared across workers rather than
per-process — four workers each politely doing three requests a second is twelve
requests a second and a ban. PubMed's limit differs sharply with and without an
API key, so budgets are configuration, not constants.

**Incremental by default.** Track 1 re-harvests weekly on updated-since cursors;
track 2 daily, because noticing a passed deadline is its whole job. Conditional
requests (`ETag`, `If-Modified-Since`) wherever offered.

**Harvests write to a staging generation and promote atomically.** Corpus
statistics derive from the whole slice, so a half-finished harvest does not just
mean missing records — it changes `log(documents.length / seen)` for every term,
and therefore every score on every query. A partial harvest must never serve.
The previous generation keeps serving until the new one completes, and term
frequencies are recomputed only at promotion, so scores never drift mid-harvest.

**A source being down degrades the answer; it does not fail the query.**
Per-source circuit breakers, backoff honouring `Retry-After`. When DBLP is
unavailable the CS results are thinner, the provenance omits it, and the UI says
so — which is what `reconciled` and `in_slice` are for. A degraded answer that
admits what it is missing is a feature; a spinner hiding it is not.

**Upstream disappearance is a tombstone, not a delete.** Someone may hold that
ID on their device, and "this record was withdrawn" beats a 404.

**The browser-direct fallback carries a hard cap.** No API key can ship in a
browser bundle, so it is limited to no-auth sources, and it must be throttled
client-side — a fallback fanning out per keystroke would make every user a small
denial-of-service against a free public good the product depends on.

## Privacy

The Radar's existing guarantee is unchanged and unweakened: the uploaded
document is analysed on the device, and only derived fingerprint terms travel.
`RadarQuery` has no `text` field, the mock route rejects one, and
`student/radar/fingerprint.ts` has a test asserting no phrase from the source
ever leaves. Every source in this design is queried with fingerprint terms only.

The browser-direct fallback changes who sees what and must be stated plainly:
the terms go from the user's own browser to OpenAlex, Crossref and ROR, exposing
the user's IP to those services while no Scrapall server sees the query at all.
That is a different trade, not a strictly better or worse one, and it is a
reason to keep the fallback flagged.

## Build order

Six phases, but only **phase 0 is the target of the next implementation plan**.
Each later phase gets its own plan when it is unblocked; phases 2 onward cannot
be planned honestly until the hardware constraint lifts and the two open
questions below are answered.

Unblocked today, no backend:

| Phase | Work |
|---|---|
| 0 | Console slice: types, provenance-varying fixtures, attribution UI, honest empty states, licence invariant test |
| 1 | Browser-direct federation behind a flag over OpenAlex, Crossref, ROR; static term-frequency table; labelled unreconciled |

Blocked on the hardware upgrade (see the frontend-first constraint):

| Phase | Work |
|---|---|
| 2 | OpenAlex and Crossref connectors, normalisation, staging-and-promote generations, ROR reconciliation, a small first manifest |
| 3 | Identity: the three tables, merge rules with stored evidence, redirects, manual overrides, corpus-statistics stage |
| 4 | Breadth: DBLP, DataCite, PubMed. Additive only — no schema change, which is the payoff of normalising at the connector boundary |
| 5 | Track 2: UKRI GtR, Grants.gov, permitted crawling. `/student/funding` stops being mock |
| 6 | Alerts. Needs track 2 plus change detection. The retention product, and it genuinely cannot come earlier |

Phase 1 stays flagged rather than default-on until the unreconciled results have
been read in situ: per-request merging produces visible duplicates, and that
should be judged before users see it.

## Open questions

Two verification tasks, both cheap, both before phase 2 commits anything:

1. **OpenAlex pricing and rate terms.** Decides whether the harvest is free at
   the volume the manifest implies.
2. **ORCID commercial-use position.** Decides whether even identifier-only use
   is clean. The schema rule above assumes identifier-only use is permissible;
   if it is not, ORCID drops out entirely and merging loses its strongest
   signal.

Neither blocks phases 0 or 1.
