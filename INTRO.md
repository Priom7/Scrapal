# Scrapal — Introduction

> Turning the public web into trustworthy, cited, structured knowledge about studying abroad —
> and building the tools that let students, counsellors, agencies, and universities act on it.

---

## 1. What Scrapal is today

Scrapal is a general-purpose scraping, RAG (retrieval-augmented generation), and agentic knowledge
platform. It takes public websites and documents and turns them into **structured, versioned,
cited** knowledge that a human can audit and an application can query.

The current codebase (`v2`) already ships:

| Capability | Where it lives |
|---|---|
| Pluggable connectors (website, sitemap, URL list, documents, domain-specific) | [src/scrapal/connectors/](src/scrapal/connectors/), entry points in [pyproject.toml](pyproject.toml) |
| Crawl blueprints — preview a site, approve a plan, then run it | [blueprints_api.py](src/scrapal/blueprints_api.py), [services/blueprints.py](src/scrapal/services/blueprints.py) |
| Deterministic extraction with per-field evidence (source URL, selector, excerpt, confidence) | [domain/university/schemas.py](src/scrapal/domain/university/schemas.py), [domain/university/greenwich.py](src/scrapal/domain/university/greenwich.py) |
| Document versioning, chunking, embeddings, hybrid search (pgvector + lexical) | [services/chunking.py](src/scrapal/services/chunking.py), [services/indexing.py](src/scrapal/services/indexing.py), [services/search.py](src/scrapal/services/search.py) |
| Grounded generation with abstention when evidence is missing | [services/generation.py](src/scrapal/services/generation.py) |
| Retrieval Lab — embedding profiles, retrieval runs, offline evaluation | [retrieval_api.py](src/scrapal/retrieval_api.py), [services/evaluation.py](src/scrapal/services/evaluation.py) |
| Course Intelligence — review / publish / reject structured course records with revision history | [course_intelligence_api.py](src/scrapal/course_intelligence_api.py) |
| Approval-gated agent actions (nothing executes without a human decision) | `action_proposals` in [api.py](src/scrapal/api.py) |
| Full crawler observability — events, incidents, workers, traces, Grafana/Prometheus/Loki/Tempo | [observability_api.py](src/scrapal/observability_api.py), [observability/](observability/) |
| Multi-tenant orgs, API keys, roles (`super_admin`/`admin`/`editor`/`viewer`) | [security.py](src/scrapal/security.py), [models.py](src/scrapal/models.py) |
| Accessible operator console (React + Vite) | [console/src/App.tsx](console/src/App.tsx) |

**Stack:** Python 3.12 · FastAPI · SQLAlchemy 2 + PostgreSQL/pgvector · Alembic · Celery +
RabbitMQ + Redis · Scrapy/httpx/trafilatura · local Ollama models (`qwen2.5:7b-instruct`,
`llama3.2:3b`, `nomic-embed-text`) · OpenTelemetry · React 19 + TanStack.

**Design principles that will not change as the product grows:**

1. **Evidence or silence.** Every published fact carries a source URL, an excerpt, and a
   confidence score. When the evidence is not there, the system abstains instead of guessing.
2. **Human-in-the-loop.** Extraction proposes; a reviewer publishes. Agents propose actions;
   a human approves them.
3. **Versioned truth.** Documents, records, and revisions are immutable and diffable, so "the
   tuition fee changed on 12 March" is a queryable fact, not a support ticket.
4. **Local-first AI.** Models run on Ollama by default — no student's personal data has to leave
   the deployment to make the product work.
5. **Accessible by default.** The console is keyboard-navigable, screen-reader labelled, and
   themable; the same bar applies to every future surface.

The first vertical proved on this engine is UK higher education (University of Greenwich
connector: awards, levels, campuses, study modes, durations, intakes, fees by residency, entry
and English requirements, application routes, deadlines, modules, accreditations, scholarships,
careers, UCAS codes).

---

## 2. Where Scrapal is going

Course data is the hard, boring, defensible foundation. On top of it we are building **a global
study-abroad operating system** with four first-class audiences, each with dedicated tools, and
a lead layer that connects them.

```
                    ┌───────────────────────────────────────────┐
                    │   Scrapal Knowledge Core (this repo)      │
                    │   crawl → extract → evidence → review →   │
                    │   publish → index → retrieve → generate   │
                    └───────────────────┬───────────────────────┘
                                        │  one cited, versioned source of truth
        ┌───────────────┬───────────────┼───────────────┬────────────────┐
        ▼               ▼               ▼               ▼                ▼
   Student App    Counsellor      Agency Suite    University      Public/Partner
                  Workspace                        Portal          API
        └───────────────┴──────── Lead & Match Exchange ───────────┴────────┘
                     (consent-gated, two-way, auditable)
```

### 2.1 For students — plan, profile, compare, fund, track

The student product is free and is the demand side of the network.

- **Study planner.** A timeline from "I'm thinking about it" to "I have a visa": shortlisting,
  tests (IELTS/TOEFL/PTE/GRE/GMAT), documents, applications, offers, funding, visa, housing,
  arrival. Every step has real deadlines pulled from published, cited records.
- **Student profile.** Academic history, grades and their conversions, test scores, work
  experience, budget, target intake, preferred countries/cities, and constraints (family,
  disability access, dietary, religious, LGBTQ+ safety, work-rights needs). Owned by the
  student, portable, exportable, deletable.
- **Comparison tools.** Side-by-side course, university, city, and country comparison across
  fees, duration, intakes, entry requirements, campus, accreditation, post-study work rights,
  cost of living, and — crucially — *what the source page actually said, with a link*.
- **Profile matching.** Match score against each course's entry requirements, split into
  `met` / `close` / `not met` per requirement, with the exact gap named ("you need 6.5 overall
  with no band below 6.0; your reading is 5.5"). Explainable, never a black-box number.
- **Finance & funding.** Total-cost-of-attendance modelling (tuition + living + visa + IHS +
  flights + deposits), affordability check against declared budget, funding gap, loan and
  sponsor options by nationality, currency-aware.
- **Scholarship tracker and reminders.** A crawled, deduplicated, evidence-backed scholarship
  index with eligibility filters, and per-student reminders for deadlines, document windows,
  and intake cut-offs — email, push, and calendar feed.
- **Ask Scrapal.** A grounded assistant that answers only from published records and cites them,
  and says "I don't have a source for that" rather than inventing a fee.
- **Reach out, or be reached.** A student can request help from counsellors or agencies, or opt
  in to be contacted — always consent-first (see §2.5).

### 2.2 For student counsellors — a caseload, not a spreadsheet

Independent counsellors and school/college career advisors get:

- A **caseload dashboard**: every student, stage, blocker, and next deadline in one view.
- **Shortlist builder** with rationale notes that the student sees, plus safety/target/reach
  banding driven by the match engine.
- **Document checklists** per university and per country, generated from published requirements.
- **Deadline and reminder automation** shared with the student.
- **Change alerts**: "Greenwich moved the September intake deadline" fires to every affected case.
- **Outcome tracking** — offers, rejections, visa results — feeding a private benchmark of what
  actually works for which profile.

### 2.3 For recruitment agencies — a real operating system

Agencies are the commercial backbone, and today they run on WhatsApp and Excel.

- **Multi-branch, multi-counsellor org** with roles, territories, and permissions (the
  `Organization` / `APIKey` / `Role` model already in the schema generalises to this).
- **Lead inbox and routing.** Inbound student interest routed by country, course level, budget,
  and language, with SLA timers and ownership.
- **Application pipeline** per university partner, with commission terms, status sync, and
  document packs.
- **Compliance vault**: contracts, agent codes, GDPR consent records, audit trail of every
  contact with every student.
- **Marketing toolkit**: landing pages and course listings generated from *published, cited*
  records (so nobody publishes a stale fee), campaign UTM tracking, lead-source attribution,
  and content that updates itself when the source page changes.
- **Performance analytics**: conversion by counsellor, by university, by source, by intake.

### 2.4 For universities — see demand, meet it, and correct the record

- **Institution portal** to claim their profile, verify extracted records, and correct anything
  the crawler got wrong — corrections land as reviewed revisions with provenance, never silent
  overwrites.
- **Demand analytics**: which nationalities, profiles, and budgets are shortlisting which
  courses, and where students drop out of the funnel.
- **Direct outreach** to consenting matched students, and to agencies that perform on their
  programmes.
- **Partner and agent management**: who is authorised to represent them, with contract status.
- **Recruitment marketing**: intake campaigns, scholarship promotion, and event/webinar
  distribution to the matched audience.
- **Feed integration**: push authoritative course data in, so Scrapal prefers first-party data
  over crawled data and marks it as such.

### 2.5 The Lead & Match Exchange — how everyone reaches everyone

The connective tissue, and the thing that must be built carefully or not at all.

- A student who wants help raises a **request** (country, level, budget, timeline). Verified
  counsellors and agencies see it and can respond.
- An agency or university can **discover** matching students only where the student has opted in
  to that audience, and only at the field granularity the student chose.
- Universities can **reach a student directly**, bypassing agencies, when the student allows it.
- Every introduction is **consent-gated, logged, rate-limited, and revocable**. Students can
  see exactly who has their data, why, and can cut it off in one click.
- Quality is enforced by **verification badges** (registered entity, accreditation, response
  rate, outcome history) and by student ratings — not by whoever pays most.

**Non-negotiable:** the student is the customer of the student product, never the inventory.
Monetisation comes from the professional tools and from performance-based introductions the
student explicitly asked for.

---

## 3. Roadmap

| Phase | Theme | Outcome |
|---|---|---|
| **0 — now** | Knowledge core | Crawl → extract → review → publish → retrieve, with evidence and observability. One university proven end-to-end. |
| **1** | Coverage | 50+ UK institutions, then IE/NL/DE/AU/CA/US. Scholarship and funding connectors. Country-level cost-of-living and visa data. Automated re-crawl with change detection. |
| **2** | Student app | Profiles, shortlists, comparison, match scoring, planner, reminders. Public grounded search. |
| **3** | Professional tools | Counsellor workspace and agency suite: caseloads, pipelines, document packs, analytics, marketing pages. |
| **4** | Two-sided exchange | Consent-gated lead routing, verification, university portal, first-party data feeds, outcome tracking. |
| **5** | Scale & trust | Public/partner API, multi-language, regional deployments, SOC2/GDPR posture, marketplace of connectors and country packs. |

---

## 4. What we need to build (engineering view)

Extensions to the existing core, in rough dependency order:

1. **Identity beyond API keys** — student accounts, OAuth/passkeys, org membership, and consent
   records as a first-class, auditable table.
2. **Entity layer** — `Institution`, `Course`, `Scholarship`, `Intake`, `Country`, `City`, with
   stable IDs, dedup/merge, and provenance links back to `StructuredRecord` revisions.
3. **Profile & matching service** — deterministic, explainable requirement matching with an
   evaluation harness (the Retrieval Lab pattern, applied to match quality).
4. **Money service** — currency, cost-of-attendance modelling, funding-gap computation.
5. **Reminders & change detection** — diff published revisions, fan out to subscribed students,
   counsellors, and agencies; email/push/ICS delivery.
6. **Lead exchange** — requests, routing rules, consent scopes, SLA timers, audit log.
7. **Public surfaces** — student web app and partner API, separate from the operator console,
   sharing the same grounded retrieval layer.
8. **Trust & safety** — verification workflows, abuse rate limits, data-subject requests
   (export/delete), regional data residency.

Everything above inherits the core's rules: evidence, versioning, human approval, and
observability. A feature that cannot cite its sources does not ship.

---

## 5. Getting started

```bash
cp .env.example .env
docker compose up --build
```

- Console: http://localhost:3000
- API + OpenAPI: http://localhost:8000/docs
- Local dev API key: `scrapal-local-dev-key`

Ollama runs on the host (not containerised) with `qwen2.5:7b-instruct`, `llama3.2:3b`, and
`nomic-embed-text` installed. Optional observability stack:
`docker compose --profile observability up --build`.

See [README.md](README.md) for local development, migrations, and the observability profile.

---

## 6. Why this matters

Around six million students study outside their home country each year. Most of them make a
six-figure, life-shaping decision using fragmented university pages, out-of-date agency PDFs,
and advice with an undisclosed commission attached. The information exists, publicly — it is
just unstructured, inconsistent, and stale by the time it reaches the person who needs it.

Scrapal's bet is that if you do the unglamorous work properly — crawl carefully, extract with
evidence, version everything, and let a human approve before it is published — then the tools
built on top can finally be honest: a student sees where every number came from, a counsellor
stops re-checking fees by hand, an agency stops running on stale spreadsheets, and a university
gets its own data represented correctly.

**Cited by default, or not published at all.**
