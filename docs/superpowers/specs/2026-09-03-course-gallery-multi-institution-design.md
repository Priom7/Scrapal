# Course Gallery and multi-institution course intelligence

Date: 2026-09-03
Status: approved for planning
Mockup: https://claude.ai/code/artifact/4b9343c9-8957-44ab-b0b0-d141ae4c553c

## Why

Two universities were added to the workspace and neither appears in Course
Intelligence. The cause is not a bug in the console; it is that the platform
has no concept of a university. A university exists today only as a `Source`
name and a hostname string, and course extraction runs for exactly one
hostname.

Confirmed against the running database on 2026-09-03:

| sources | kind | course records |
| --- | --- | --- |
| University of Greenwich (×5) | `greenwich`, `sitemap`, `website` | 211 |
| University of Buckingham | `sitemap` | 0 |
| University of Westminster | `website` | 0 |

All 211 `university.course` records belong to Greenwich. Buckingham and
Westminster crawl successfully and produce documents and chunks; they produce
no structured records at all.

Three independent defects produce that result.

1. **Extraction is bound to one hostname.** `services/ingestion.py:209` selects
   `GreenwichConnector` only for `SourceKind.greenwich`; every other source
   falls through to the generic `WebsiteConnector`, which emits no
   `structured_records`. `blueprints_api.py:124` assigns that kind by the
   literal test `"gre.ac.uk" in hostname`.
2. **The console reads one collection.** `App.tsx` passes
   `collections.data?.[0]?.id` to Course Intelligence, Knowledge, Retrieval Lab
   and the agent panel. The workspace has two collections; the second is
   invisible.
3. **There is no institution entity.** Nothing records a university's country,
   city, logo, or brand, so nothing can group, filter or present courses by
   the institution that offers them.

## What we are building

Six deliverables, sequenced so that the reported symptom is fixed by the third.

1. An `Institution` entity, with a backfill for existing records.
2. A generic university course extractor that works on any institution.
3. Removal of the single-collection assumption in the console.
4. A Course Gallery read API.
5. The Course Gallery console view.
6. A server-side shortlist.

Out of scope: a public unauthenticated catalogue, uploaded institution assets,
third-party logo or ranking services, and any change to the review and publish
lifecycle.

## Decisions taken

| Question | Decision | Rejected |
| --- | --- | --- |
| How do non-Greenwich sites yield course records? | Structural heuristics first, local LLM fills only what remains, every field excerpt-backed | LLM-only extraction; a hand-written connector per university |
| Who is the gallery for? | Super-admin console view, published records only, all collections | All statuses with badges; a public catalogue |
| Where do logos, flags and banners come from? | Harvested from pages already crawled, admin-overridable; flags as inline SVG | A third-party logo CDN; admin uploads |
| How does the shortlist persist? | Server-side, keyed to the principal | `localStorage` |

The rejected column is recorded so a later reader does not re-litigate it.

## 1. Institution

New table, migration `0009`:

```
institutions
  id, organization_id
  name              "University of Westminster"
  slug              "university-of-westminster"   unique per organization
  domain            "westminster.ac.uk"           unique per organization
  country_code      "GB"                          ISO 3166-1 alpha-2
  city              nullable
  website_url       nullable
  logo_url          nullable    harvested, admin-overridable
  banner_url        nullable    harvested, admin-overridable
  brand_color       nullable    "#2d2a75"
  settings          JSON        per-site extraction overrides
  created_at, updated_at
```

Two nullable foreign keys: `sources.institution_id` and
`structured_records.institution_id`. The record-level column is denormalised
deliberately so the gallery can filter and facet without joining
`structured_records → documents → sources` on every query; it is set at
persist time in `persist_structured_records` from the source's institution.

**Resolution.** An institution is identified by the registrable domain of a
source's URL (`www.gre.ac.uk` → `gre.ac.uk`). A helper
`resolve_institution(session, organization_id, url, name)` returns an existing
row or creates one. It is called from blueprint approval and from source
creation, so adding a fourth university stays a zero-code operation.

**Country.** Inferred from the TLD by a small explicit map (`.ac.uk` → GB,
`.edu.au` → AU, `.ac.nz` → NZ, `.edu.my` → MY, `.ie` → IE, `.nl` → NL, and so
on), falling back to `None` rather than a guess. A null country is shown in the
console as "Country not set" with an inline control to set it. We do not
geolocate an IP address and we do not ask a model.

**Brand and imagery.** During ingestion the website connector already parses
each page. It additionally records, on the institution's first crawled page:
`og:image` as `banner_url`, the first `<link rel="icon">` or a logo-classed
`<img>` as `logo_url`, and the dominant colour of a `theme-color` meta tag as
`brand_color`. Each is written only when the column is null, so an
administrator's override is never overwritten by a later crawl. There is no
outbound call to any third party.

**Backfill.** Migration `0009` walks existing sources, resolves an institution
for each, and updates `structured_records.institution_id` through the document
join. The 211 Greenwich records land on a Greenwich institution. The migration
is idempotent and reversible.

## 2. Generic university course extraction

`domain/university/` gains an extractor registry.

```
extractors/
  base.py        CourseExtractor protocol -> list[structured_record dict]
  generic.py     GenericUniversityExtractor      (default)
  greenwich.py   GreenwichExtractor              (site override, existing code)
  registry.py    resolve_extractor(institution, url)
```

**Selection order:** `institution.settings["extractor"]` → domain registry →
`GenericUniversityExtractor`. The trigger for running any of them becomes
`domain_pack == "university"`, which `blueprints_api` already records on the
blueprint and currently discards; it must be propagated into `Source.config`.
`SourceKind.greenwich` is retained so existing rows keep validating, but it
stops being how the pipeline decides anything.

**Generic extraction, in two passes.**

Pass one is structural and produces `FieldEvidence` exactly as the Greenwich
extractor does today:

- JSON-LD `Course` / `EducationalOccupationalProgram` blocks, which a growing
  number of universities publish and which give title, award, duration,
  provider and sometimes fees for free;
- `<h1>` for title, with the award parsed from a trailing comma-separated
  suffix or a leading abbreviation (`MSc`, `BEng (Hons)`, `LLM`);
- definition lists and two-column key/value tables, which is how most
  university course pages present duration, campus, start date and UCAS code;
- fee tables, matched on a currency symbol or ISO code with a residency word
  (`home`, `overseas`, `international`, `EU`) in the row or its header;
- section extraction by *heading text* rather than by anchor id — the Greenwich
  extractor's reliance on `#entry-requirements` is precisely what does not
  generalise. Headings are matched against a keyword set per field.

Pass two sends the page text and the still-empty required fields to Ollama in
one call, constrained to `CourseIntelligenceRecord`. The rule that makes this
safe: **a field is accepted only when the model returns a verbatim excerpt that
is present in the page text.** The excerpt is verified by substring match after
whitespace normalisation; a field whose excerpt does not verify is dropped, not
kept with lower confidence. This keeps the publish gate in
`course_intelligence_api.py:157` honest — a record cannot reach `published`
with a field that has no evidence, and that gate is unchanged.

Structural evidence is recorded with `method` naming the pass
(`jsonld`, `dl-pair`, `fee-table`, `heading-section`); model-filled evidence is
recorded with `method="llm-verified"` and its own confidence, so an operator can
always tell which facts were read and which were inferred. `extractor_version`
becomes `generic-university-v1`.

**Cost.** One model call per course page, and only for pages with unfilled
required fields. On a 500-page university crawl at local Ollama speeds this is
the slowest stage; it runs inside the existing Celery ingest task and is
therefore already asynchronous and already retried. A per-source
`max_llm_pages` config value caps it.

## 3. Multi-collection scope

`collections.data?.[0]?.id` is removed from `App.tsx` entirely. A collection
selector goes in the topbar, its value held in one place and persisted to
`localStorage`, with an explicit **All collections** option that is the default
for Course Intelligence and the Gallery. Both endpoints already treat
`collection_id` as optional, so "all" is expressed by omitting the parameter.

The Course Intelligence overview additionally returns a per-institution
breakdown so an operator can see at a glance that Buckingham has 0 published
records and Greenwich has 161.

## 4. Gallery API

`/v1/admin/course-gallery`, super-admin, published records only.

| Route | Returns |
| --- | --- |
| `GET /institutions` | institution cards with published-course counts |
| `GET /courses` | published records, faceted and cursor-paginated |
| `GET /facets` | every filter value with its count under the current filters |
| `GET /courses/{id}` | one record with evidence and revision trail |
| `GET/POST/DELETE /shortlist` | the principal's shortlist |

`GET /courses` accepts `q`, `institution_id[]`, `country[]`, `level`,
`study_mode[]`, `campus[]`, `intake_month[]`, `fee_min`, `fee_max`,
`duration[]`, `min_coverage`, `sort`, `cursor`, `limit`.

Facet counts are computed **excluding the facet being counted**, so ticking one
university does not zero every other university's count. This is what makes the
filter panel trustworthy and it is the detail most faceted-search
implementations get wrong.

Filtering runs against `structured_records.data` with Postgres JSON operators
plus a GIN index; at the current scale — hundreds of records, tens of thousands
projected — no denormalised search table is warranted. If that assumption
breaks, a materialised view is the next step, not a rewrite.

`q` is a substring match over title, award and institution name. Natural
language is handled separately, below.

## 5. Console view

New sidebar entry **Course gallery**, built on the existing token system
(`--cobalt`, `--mint`, `--amber`, `--coral`, Sora, Atkinson Hyperlegible,
`motion`, `lucide-react`). No new dependencies.

The design's organising idea: **every figure is receipted.** Mastersportal can
show a fee; Scrapal can show the fee *and the sentence on the university's page
it was read from*. Evidence is therefore not a hidden tab, it is the primary
interaction — the one place the design spends its boldness.

- **AI search** across the top. A natural-language question resolves through
  the existing query-plan vocabulary into typed slots, each of which becomes a
  real, editable filter chip marked as AI-set. The interpretation is shown, not
  hidden, and slots the planner could not resolve are named with the reason —
  "rankings come from third parties, so there is nothing to cite". This reuses
  the closed-vocabulary slot constraint already built in `services/generation.py`.
- **Country rail** of inline-SVG flags with counts, joined to the page below.
- **Filter bar** — a segmented level control, popovers with counted checkbox
  lists, and a dual-range tuition slider over a histogram of the fee
  distribution. Zero-count options are disabled and visible, not hidden. An
  active-filter row carries removable chips and distinguishes AI-set filters.
- **Course dossiers** — a 4px spine and crest in the institution's brand
  colour, the award set in the display face, and a 2×2 fact strip where each
  fact carries an evidence pip (evidenced / partial / not stated). "Not stated"
  is shown rather than hidden: it tells the operator which field to go fix.
  Tapping a fact unfolds its source excerpt in place.
- **Course detail** — banner, a key-facts strip lifted over the banner edge
  with six receipted facts, a sticky scroll-spy section nav, fees as a table
  with per-row receipts, a twelve-month intake timeline marking starts and
  application deadlines, English tests, modules split core/optional,
  scholarships, and a right rail carrying a coverage ring, the full evidence
  ledger, and a "similar, cheaper" list.
- **Shortlist tray** docked bottom, opening a comparison table.

**Banner imagery.** Where a harvested `og:image` exists it is used. Where it
does not, a deterministic contour field is generated from the institution's
brand colour and the course title, so a course without imagery looks
intentional rather than broken.

**Mobile.** Filter popovers become bottom sheets with a drag handle, 48px rows
and a thumb-reachable confirm that live-counts the result set. The filter row
and active-filter row scroll edge-to-edge with a fade cue. The fee table
restacks; the intake timeline becomes a horizontal strip; cards drop to a
single fact column below 400px. Bottom-docked elements respect
`env(safe-area-inset-bottom)`. Verified at 390px with no horizontal overflow,
consistent with the bar already held elsewhere in the console.

## 6. Shortlist

Migration `0009` adds `course_shortlist_entries` — `id`, `principal_key`,
`record_id`, `note`, `created_at`, unique on `(principal_key, record_id)`.
`principal_key` is derived from the authenticated principal. Every route
filters by it; a shortlist is never readable across principals.

## Testing

Backend, pytest:

- generic extractor against saved Buckingham and Westminster page fixtures in
  `tests/fixtures/`, asserting each required field and its evidence excerpt;
- the excerpt-verification rule: a model response whose excerpt is absent from
  the page text drops the field;
- extractor registry selection order;
- TLD to country mapping, including the unmapped fallback;
- migration `0009` backfill, asserting the 211 existing records resolve to one
  Greenwich institution and that re-running changes nothing;
- facet counts excluding their own facet;
- shortlist isolation between principals.

Frontend, vitest:

- filter state reducer, including AI-set flag clearing on manual edit;
- the query-plan slot parser and its unresolved-slot reporting;
- shortlist optimistic update and rollback on failure.

The existing Course Intelligence tests must continue to pass unchanged; the
review and publish lifecycle is not modified.

## Sequencing

| Step | Delivers | Symptom fixed |
| --- | --- | --- |
| 1 | Institution entity, resolution, backfill | — |
| 2 | Generic extractor and registry | Buckingham and Westminster produce course records |
| 3 | Multi-collection console | The second collection becomes visible |
| 4 | Gallery API | — |
| 5 | Gallery console view | — |
| 6 | Shortlist | — |

Steps 1 to 3 resolve the reported problem and are worth shipping on their own.

## Risks

**Generic extraction accuracy.** A generic extractor will be less accurate than
a hand-written one. The mitigation is structural rather than statistical: a
record with unevidenced required fields cannot be published, so inaccuracy
surfaces as a record stuck in review rather than as a wrong fact in the
gallery. Coverage per institution is the metric to watch.

**LLM latency on large crawls.** Capped by `max_llm_pages` per source and
confined to pages with unfilled required fields.

**Institution identity by registrable domain.** A university on multiple
domains, or two institutions sharing one, will resolve wrongly. Both are
correctable by an administrator editing the institution's domain, and neither
is silent — the console shows the domain on the institution card.
