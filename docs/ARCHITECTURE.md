# Scrapal Architecture Reference

**Document type:** Complete component architecture and workflow reference
**Repository snapshot:** branch `v3`, commit `75ef7a8` (includes the extraction-guard fix in `1144e7b`)
**Verified against:** the running local stack and the live PostgreSQL schema on 5 September 2026
**Companion document:** [`SCRAPAL_MASTER.md`](SCRAPAL_MASTER.md) covers product position, roadmap and honesty gates. This document covers *only* what the software is made of and how each piece behaves.

Every diagram below is also a standalone Mermaid source in [`diagrams/architecture/`](diagrams/architecture/), and every count in the census was derived by querying the code and the live database rather than by reading prose. The derivation commands are listed in [§12](#12-how-every-number-here-was-derived).

---

## 1. How to read this document

Scrapal is one system that can be sliced eight different ways. A "component" therefore needs a definition, or the count is meaningless.

**A component is a named unit that owns a distinct responsibility and can be reasoned about, tested, or replaced on its own.** Layers are *views of the same system*, not disjoint piles of hardware: the three Celery tasks in Layer 8 execute inside the `worker` runtime service in Layer 1, and the eleven domain services in Layer 4 run inside both `api` and `worker`. Counting them separately is deliberate — they fail, scale and change independently — but the layers overlap by design, so **do not add the layer totals expecting physical machines.**

---

## 2. Component census

**60 software components across 8 layers, backed by 26 database tables and 9 state enums.**

| # | Layer | Components | What lives here |
|---|---|---|---|
| 1 | Runtime services | **14** | Docker Compose services: 7 core, 7 observability-profile |
| 2 | API routers | **6** | 62 HTTP endpoints, plus `/health` and the `/metrics` mount |
| 3 | Platform core | **9** | Config, DB, ORM, schemas, security, Celery app, telemetry, extension registry, app factory |
| 4 | Domain services | **11** | Ingestion, indexing, chunking, search, generation, blueprints, events, evaluation, Ollama, institutions, artifacts |
| 5 | Connectors and extractors | **6** | 3 connectors, 1 registry, 2 course extractors |
| 6 | Persistence | **26 tables** | + 9 enums, pgvector HNSW and GIN indexes |
| 7 | Console | **11 modules** | 9 operator views in a single React application |
| 8 | Async tasks | **3** | `scrapal.ingest`, `scrapal.generate`, `scrapal.reindex` |

One external dependency sits outside all eight layers: **host Ollama**, reached at `host.docker.internal:11434`, serving three models (`qwen2.5:7b-instruct` for chat, `llama3.2:3b` fast, `nomic-embed-text` for 768-dimension embeddings).

### 2.1 System context

```mermaid
flowchart TB
    subgraph people["People"]
        Operator["Operator / reviewer<br/>super_admin, admin, editor, viewer"]
        Student["Student / partner client<br/>NOT public yet"]
    end

    subgraph scrapal["Scrapal platform"]
        Console["Operator console<br/>React + Vite, served by Nginx"]
        API["FastAPI application<br/>6 routers, 62 endpoints"]
        Worker["Celery workers<br/>ingest / ai / default queues"]
        Store[("PostgreSQL 16 + pgvector<br/>26 tables")]
        Cache[("Redis<br/>event stream + heartbeats")]
        Broker[("RabbitMQ<br/>task broker")]
        Files[("Artifact volume<br/>raw page bytes")]
    end

    subgraph external["Outside the trust boundary"]
        Web["Public university websites,<br/>sitemaps, robots.txt, PDFs"]
        Ollama["Host Ollama<br/>chat + fast + embedding models"]
        Grafana["Grafana / Prometheus / Loki / Tempo"]
    end

    Operator --> Console
    Student -. "planned" .-> API
    Console -->|"X-API-Key"| API
    API --> Store
    API --> Cache
    API -->|"enqueue"| Broker
    Broker --> Worker
    Worker --> Store
    Worker --> Cache
    Worker --> Files
    Worker -->|"fetch, robots-gated"| Web
    Worker --> Ollama
    API --> Ollama
    API -.->|"OTLP + /metrics"| Grafana
    Worker -.->|"OTLP"| Grafana
```

### 2.2 The full component map

```mermaid
flowchart TB
    subgraph L7["Layer 7 — Console (11 modules, 9 views)"]
        direction LR
        V1["App.tsx<br/>shell + 7 views"]
        V2["CourseGallery.tsx<br/>gallery, dossier, compare"]
        V3["api.ts<br/>typed HTTP client"]
        V4["CollectionScope · GalleryState<br/>RunPath · QueryPlan · ui · lib"]
    end

    subgraph L2["Layer 2 — API routers (6 modules, 62 endpoints)"]
        direction LR
        R1["api.py · /v1<br/>25 endpoints"]
        R2["blueprints_api.py<br/>5"]
        R3["course_intelligence_api.py<br/>8"]
        R4["course_gallery_api.py<br/>8"]
        R5["retrieval_api.py<br/>6"]
        R6["observability_api.py<br/>10"]
    end

    subgraph L3["Layer 3 — Platform core (9 modules)"]
        direction LR
        P1["security.py<br/>API key, Principal, RBAC"]
        P2["config.py · db.py"]
        P3["models.py · schemas.py"]
        P4["jobs.py<br/>Celery app + 3 tasks"]
        P5["telemetry.py · extensions.py · main.py"]
    end

    subgraph L4["Layer 4 — Domain services (11 modules)"]
        direction LR
        S1["ingestion"]
        S2["blueprints"]
        S3["indexing · chunking"]
        S4["search · generation"]
        S5["ollama"]
        S6["institutions · artifacts"]
        S7["crawl_events · evaluation"]
    end

    subgraph L5["Layer 5 — Connectors and extraction (6 units)"]
        direction LR
        C1["WebsiteConnector"]
        C2["DocumentConnector"]
        C3["GreenwichConnector"]
        E1["registry.resolve_extractor"]
        E2["GenericUniversityExtractor"]
        E3["GreenwichCourseExtractor"]
    end

    subgraph L6["Layer 6 — Persistence (26 tables, 9 enums)"]
        direction LR
        D1[("Tenancy + catalogue")]
        D2[("Crawl + telemetry")]
        D3[("Documents + chunks + vectors")]
        D4[("Records + revisions")]
        D5[("Conversations + retrieval")]
    end

    subgraph L1["Layer 1 — Runtime (14 services + host Ollama)"]
        direction LR
        N1["api"]
        N2["worker"]
        N3["scheduler"]
        N4["console"]
        N5["postgres · redis · rabbitmq"]
        N6["7 observability-profile services"]
    end

    L7 -->|"HTTPS + X-API-Key"| L2
    L2 --> L3
    L2 --> L4
    L3 --> L4
    L4 --> L5
    L4 --> L6
    L5 --> L6
    L3 -.->|"hosted by"| L1
    L4 -.->|"hosted by"| L1
```

---

## 3. Layer 1 — Runtime services (14)

Defined in [`docker-compose.yml`](../docker-compose.yml). Seven services always run; seven more are gated behind the `observability` Compose profile so a laptop can run the product without the telemetry stack.

### 3.1 Core profile (7)

| Service | Image / command | Responsibility | Notes |
|---|---|---|---|
| `postgres` | `pgvector/pgvector:pg16` | System of record and vector store | Health-gated; every other backend service waits on it |
| `rabbitmq` | `rabbitmq:4-management-alpine` | Celery broker | Management UI on `:15672`; Prometheus plugin enabled |
| `redis` | `redis:7-alpine` | Live event stream and worker heartbeats | `--save 60 1`; loss is tolerated, never fatal |
| `api` | `alembic upgrade head && uvicorn` | HTTP surface on `:8000` | **Migrations run in the API container's start command**, so the schema is current before the first request |
| `worker` | `celery worker --queues=ingest,ai,default --concurrency=2` | All long-running work | `--without-gossip --without-mingle` for quiet startup |
| `scheduler` | `celery beat` | Recurring schedules | Present and running; **no recurring crawl schedule is configured yet** |
| `console` | Nginx + built React bundle | Operator UI on `:3000` | Proxies `/api` to the API container; waits for API health |

### 3.2 Observability profile (7)

`otel-collector` (OTLP `:4317`/`:4318`) fans traces into `tempo` and logs into `loki`. `prometheus` scrapes `/metrics` and feeds `alertmanager`. `grafana` (`:3001`) reads all three. `flower` (`:5555`) inspects the Celery broker directly.

### 3.3 Runtime topology

```mermaid
flowchart LR
    Browser["Browser<br/>:3000"]

    subgraph core["Core profile — always running (7 services)"]
        Console["console<br/>Nginx + React build<br/>:80 -> :3000"]
        API["api<br/>alembic upgrade head<br/>uvicorn :8000"]
        Worker["worker<br/>celery worker<br/>queues: ingest, ai, default<br/>concurrency 2"]
        Beat["scheduler<br/>celery beat"]
        PG[("postgres<br/>pgvector/pgvector:pg16")]
        MQ[("rabbitmq<br/>4-management-alpine<br/>:15672")]
        RD[("redis<br/>7-alpine")]
    end

    subgraph obs["observability profile — opt-in (7 services)"]
        OTEL["otel-collector<br/>:4317 :4318"]
        PROM["prometheus :9090"]
        LOKI["loki :3100"]
        TEMPO["tempo :3200"]
        GRAF["grafana :3001"]
        ALERT["alertmanager :9093"]
        FLOWER["flower :5555"]
    end

    Host["Host Ollama :11434<br/>reached via host.docker.internal"]
    Vol[("artifacts volume<br/>/data/artifacts")]

    Browser --> Console
    Console -->|"/api proxy"| API
    API --> PG
    API --> RD
    API -->|"publish task"| MQ
    MQ --> Worker
    Beat -->|"schedule"| MQ
    Worker --> PG
    Worker --> RD
    Worker --> Vol
    API --> Vol
    API --> Host
    Worker --> Host

    API -.->|"OTLP"| OTEL
    Worker -.->|"OTLP"| OTEL
    OTEL --> TEMPO
    OTEL --> LOKI
    PROM -->|"scrape /metrics"| API
    PROM --> ALERT
    GRAF --> PROM
    GRAF --> LOKI
    GRAF --> TEMPO
    FLOWER --> MQ
```

**Volumes (6):** `artifacts` holds raw fetched bytes and is mounted into every backend container; `postgres_data`, `prometheus_data`, `loki_data`, `tempo_data` and `grafana_data` persist their respective stores.

---

## 4. Layer 2 — API routers (6 modules, 62 endpoints)

All six are mounted in [`main.py`](../src/scrapal/main.py). Every endpoint resolves a `Principal` before touching data.

| Router | Prefix | Endpoints | Minimum role | Owns |
|---|---|---|---|---|
| [`api.py`](../src/scrapal/api.py) | `/v1` | 25 | mixed | Collections, sources, runs, documents, uploads, search, records, conversations, action proposals |
| [`blueprints_api.py`](../src/scrapal/blueprints_api.py) | `/v1/crawl-blueprints` | 5 | editor | Preview, patch, approve, run |
| [`course_intelligence_api.py`](../src/scrapal/course_intelligence_api.py) | `/v1/admin/course-intelligence` | 8 | super_admin | Coverage overview, record review, publish gate, revisions |
| [`course_gallery_api.py`](../src/scrapal/course_gallery_api.py) | `/v1/admin/course-gallery` | 8 | super_admin | Published-course discovery, facets, dossiers, shortlist |
| [`retrieval_api.py`](../src/scrapal/retrieval_api.py) | `/v1/admin/retrieval-lab` | 6 | super_admin | Retrieval traces, embedding profiles, evaluations |
| [`observability_api.py`](../src/scrapal/observability_api.py) | `/v1/admin/observability` | 10 | super_admin | Fleet overview, run timelines, events, incidents, workers, dependencies |

Two surfaces sit outside the routers: `GET /health` and the Prometheus ASGI app mounted at `/metrics`.

### 4.1 Request authentication and tenancy

```mermaid
sequenceDiagram
    autonumber
    participant C as Console
    participant F as FastAPI
    participant S as security.get_principal
    participant DB as PostgreSQL
    participant H as Route handler

    C->>F: request + X-API-Key header
    F->>S: resolve APIKeyHeader dependency
    alt header absent
        S-->>C: 401 Missing API key
    else header present
        S->>S: sha256(key)
        S->>DB: select APIKey where key_hash = digest
        DB-->>S: row or none
        alt no row, or row.active is false
            S-->>C: 401 Invalid API key
        else active key
            S-->>F: Principal(organization_id, role, scopes, key_id)
            alt route requires editor
                F->>F: role in super_admin, admin, editor
            else route requires super admin
                F->>F: role == super_admin
            end
            alt permission denied
                F-->>C: 403
            else allowed
                F->>H: invoke with Principal + AsyncSession
                H->>DB: query filtered by principal.organization_id
                DB-->>H: tenant-scoped rows
                H-->>C: 200 response model
            end
        end
    end
```

---

## 5. Layer 3 — Platform core (9 modules)

| Module | Responsibility | Workflow worth knowing |
|---|---|---|
| [`main.py`](../src/scrapal/main.py) | App factory and lifespan | On startup: create the artifact dir, `init_db()`, `bootstrap_identity()`, `ensure_default_profile()`, then seed a first collection if none exists |
| [`config.py`](../src/scrapal/config.py) | `Settings` via pydantic-settings | `SCRAPAL_` env prefix, `@lru_cache` singleton. Caps live here: `max_pages_per_run=500`, `request_timeout_seconds=25`, `max_upload_bytes=25MB`, `embedding_dimensions=768` |
| [`db.py`](../src/scrapal/db.py) | Async engine and session factory | `init_db()` creates the `vector` extension, then **three indexes**: HNSW cosine on `chunks.embedding`, GIN on `to_tsvector('english', chunks.content)`, HNSW on `chunk_embeddings.embedding` |
| [`models.py`](../src/scrapal/models.py) | 26 ORM tables, 9 enums | Every id is a 36-char UUID string; `metadata_json` avoids SQLAlchemy's reserved `metadata` |
| [`schemas.py`](../src/scrapal/schemas.py) | Pydantic request/response models | The API never returns an ORM object unshaped |
| [`security.py`](../src/scrapal/security.py) | Identity and RBAC | SHA-256 key hashing, `Principal` dataclass, three dependency gates, `bootstrap_identity` seeds the first org and super-admin key |
| [`jobs.py`](../src/scrapal/jobs.py) | Celery app and 3 tasks | Queue routing, late acks, and the `engine.dispose()` event-loop isolation described in §11.3 |
| [`telemetry.py`](../src/scrapal/telemetry.py) | Metrics, tracing, structured logs | 12 Prometheus instruments; `SECRET_KEY` regex redacts `authorization`, `cookie`, `secret`, `token`, `password`, `api_key` from every log |
| [`extensions.py`](../src/scrapal/extensions.py) | Plugin contract | `Connector` ABC + `ExtensionManifest`; `extension_catalog()` scans six entry-point groups |

### 5.1 The tenancy and egress boundary

```mermaid
flowchart TD
    A["Inbound request"] --> B["X-API-Key -> sha256 -> APIKey row"]
    B --> C["Principal(organization_id, role, scopes)"]

    C --> D{"role gate on the route"}
    D -->|"get_principal — any active key"| E["read endpoints"]
    D -->|"require_editor — super_admin, admin, editor"| F["create sources, runs, uploads"]
    D -->|"require_super_admin"| G["course intelligence, course gallery,<br/>retrieval lab, observability"]

    E --> H
    F --> H
    G --> H

    H["Every query joins back to organization_id"]
    H --> I[("Collection.organization_id")]
    H --> J[("Institution.organization_id")]
    H --> K[("Conversation.organization_id")]

    I --> L["Documents, chunks, structured records<br/>reached only through their Collection"]
    J --> M["Institutions and their records"]
    K --> N["Messages, generations, proposals"]

    subgraph egress["Outbound safety, enforced before any fetch"]
        O["validate_public_url"]
        O --> P{"scheme is http or https?"}
        P -- no --> X1(["reject"])
        P -- yes --> Q{"hostname is localhost or<br/>host.docker.internal?"}
        Q -- yes --> X1
        Q -- no --> R["getaddrinfo — resolve every address"]
        R --> S{"any address private, loopback,<br/>link-local, multicast, reserved<br/>or unspecified?"}
        S -- yes --> X1
        S -- no --> T(["fetch allowed"])
    end

    F -.->|"before crawling"| O
    G -.->|"blueprint preview"| O
```

---

## 6. Layer 4 — Domain services (11)

### 6.1 `ingestion` — the crawl engine

The largest single component (719 lines). Entry point `ingest_run(run_id)`; per-source work in `_ingest_source`.

**Workflow.** Load run and source → pick connector by `source.kind` → build the frontier (three ways: replay a previous run's failed URLs, expand a sitemap, or seed a single start URL) → loop pages until the frontier drains or `min(max_pages, 500)` is reached.

Per page: heartbeat → re-read `cancel_requested` → robots check → `safe_fetch` (3 attempts, backoff on 429 and 5xx) → connector extract → course extraction inside the LLM budget → persist → enqueue in-scope links if depth allows.

**Failure design, and it is the interesting part:**
- Each page's persistence runs inside `session.begin_nested()`. A `SAVEPOINT` means one unreadable page rolls back alone; the 500-page run continues.
- `mark_run_terminal` retries **6 times with exponential backoff** in its own session, because the run's own transaction may already be poisoned by the exception that ended it.
- Cancellation is cooperative and checked once per page, never mid-fetch.
- A failed run raises an `Incident` with fingerprint `run-failed:{run_id}`.

```mermaid
flowchart TD
    Start(["ingest_task(run_id)"]) --> Iso["engine.dispose — fresh event loop<br/>asyncio.run isolation"]
    Iso --> Load["load Run + Source"]
    Load --> Missing{"source exists?"}
    Missing -- no --> Failed(["status=failed<br/>'Source no longer exists'"])
    Missing -- yes --> Running["status=running<br/>ACTIVE_RUNS.inc<br/>heartbeat"]
    Running --> Pick{"source.kind"}

    Pick -- greenwich --> GC["GreenwichConnector<br/>+ GreenwichConfig"]
    Pick -- other --> WC["WebsiteConnector<br/>+ WebsiteConfig"]

    GC --> Frontier
    WC --> Frontier

    Frontier{"how is the frontier built?"}
    Frontier -- "retry_of_run_id set" --> FR["replay non-policy RunIssue URLs"]
    Frontier -- "sitemap / greenwich / .xml" --> FS["parse sitemap locs<br/>apply include and exclude"]
    Frontier -- "otherwise" --> FW["seed with start_url, depth 0"]

    FR --> Queue[["queue: deque of (url, depth)"]]
    FS --> Queue
    FW --> Queue

    Queue --> Loop{"queue non-empty AND<br/>seen < min(max_pages, 500)?"}
    Loop -- no --> Done
    Loop -- yes --> Pop["pop url, mark seen<br/>publish_worker_heartbeat"]
    Pop --> Cancel{"run.cancel_requested?"}
    Cancel -- yes --> Cancelled(["raise RunCancelled<br/>status=cancelled"])
    Cancel -- no --> Robots{"respect_robots and<br/>robots allows this URL?"}

    Robots -- denied --> Skip["RunIssue stage=policy<br/>CrawlEvent robots policy_skipped<br/>pages_processed += 1"]
    Skip --> Loop

    Robots -- allowed --> Fetch["safe_fetch — 3 attempts,<br/>backoff on 429/5xx"]
    Fetch -- FetchFailure --> FetchErr["RunIssue stage=fetch<br/>CrawlEvent fetch failed<br/>retryable flag preserved"]
    FetchErr --> Loop

    Fetch -- ok --> Nested["open SAVEPOINT<br/>session.begin_nested"]
    Nested --> Extract["connector.extract<br/>trafilatura text + title"]
    Extract --> Budget{"HTML and<br/>llm_pages < max_llm_pages?"}
    Budget -- yes --> WithLLM["use_model = True<br/>llm_pages += 1"]
    Budget -- no --> NoLLM["use_model = False<br/>log llm_budget_exhausted once"]
    WithLLM --> Persist
    NoLLM --> Persist

    Persist["persist_extraction — see diagram 11"]
    Persist -- raises --> ExtErr["SAVEPOINT rolled back<br/>RunIssue stage=extract retryable<br/>created = False"]
    ExtErr --> Tally
    Persist -- ok --> Tally["pages_processed += 1<br/>documents_created += created<br/>CrawlEvent page completed"]

    Tally --> Links{"text/html and depth < max_depth?"}
    Links -- yes --> Enqueue["extract_links — same domain,<br/>include/exclude honoured<br/>append at depth + 1"]
    Links -- no --> Commit
    Enqueue --> Commit["session.commit"]
    Commit --> Loop

    Done(["status=completed"])
    Done --> Terminal
    Cancelled --> Terminal
    Failed --> Terminal
    Terminal["mark_run_terminal — 6 attempts, exponential backoff<br/>set finished_at, source.last_run_at,<br/>RUNS_TOTAL metric, CrawlEvent run outcome"]
    Terminal --> Incident{"status == failed?"}
    Incident -- yes --> Inc["upsert_incident<br/>rule_id=crawler_run_failed severity=critical"]
    Incident -- no --> End(["ACTIVE_RUNS.dec"])
    Inc --> End
```

The same loop as a state machine, per page:

```mermaid
stateDiagram-v2
    direction TB
    [*] --> Queued: url appended to frontier
    Queued --> Started: popped, marked seen, heartbeat published

    Started --> PolicySkipped: robots.txt disallows
    Started --> Fetching: robots allows or checks disabled

    Fetching --> FetchFailed: FetchFailure after 3 attempts
    Fetching --> Fetched: 2xx response

    Fetched --> Extracting: content-type resolved
    Extracting --> ExtractFailed: connector or extractor raised
    Extracting --> Extracted: title, text, metadata produced

    Extracted --> Persisting: SAVEPOINT open
    Persisting --> Unchanged: content_hash already on this document
    Persisting --> Versioned: new DocumentVersion written

    Versioned --> Indexed: chunked and embedded
    Unchanged --> RecordsRefreshed: structured records re-checked
    Indexed --> RecordsRefreshed

    RecordsRefreshed --> Expanded: html and depth < max_depth
    RecordsRefreshed --> Complete: leaf page or depth budget spent
    Expanded --> Complete: links appended at depth + 1

    PolicySkipped --> [*]: counted in policy_skips_count
    FetchFailed --> [*]: RunIssue retryable, replayable by retry-issues
    ExtractFailed --> [*]: SAVEPOINT rolled back, run survives
    Complete --> [*]: pages_processed incremented

    note right of ExtractFailed
        The savepoint is why one unreadable page
        cannot abort a 500-page run.
    end note
```

And the run's own status transitions:

```mermaid
stateDiagram-v2
    direction LR
    [*] --> queued: POST /v1/runs or blueprint run
    queued --> running: worker picks the task up
    queued --> failed: worker never claimed it — console shows worker_timeout

    running --> completed: frontier drained
    running --> cancelled: cancel_requested seen at page boundary
    running --> failed: unhandled exception at the run boundary
    running --> waiting_for_ai: model dependency unavailable

    waiting_for_ai --> running: provider recovered
    failed --> queued: POST /runs/{id}/retry-issues — replays only failed URLs

    completed --> [*]
    cancelled --> [*]
    failed --> [*]

    note right of cancelled
        Cancellation is cooperative: the flag is
        re-read once per page, never mid-fetch.
    end note
```

### 6.2 `blueprints` — plan before you crawl

Samples a site *before* any bulk fetch, so an operator approves a scope with evidence rather than optimism.

`preview_blueprint` validates the URL against the SSRF guard, fetches `robots.txt` and the start page concurrently, gathers candidates (sitemap `<loc>` entries if advertised, otherwise in-scope page links, capped at 5000), classifies each by `classify_page_type`, picks up to **16 representative URLs**, samples them, and runs `detect_evidence_fields` to produce a **per-field coverage projection**. Confidence is reported as `medium` only when at least 6 pages formed the basis.

The output is a `CrawlBlueprint` in `draft`. Patching it bumps `version`. Approval creates the `Source` — and calls `resolve_institution`, which is the only place an `Institution` row is born.

```mermaid
sequenceDiagram
    autonumber
    actor Op as Operator
    participant UI as AddSource dialog
    participant API as blueprints_api
    participant BP as services.blueprints
    participant Site as Target website
    participant INS as services.institutions
    participant Q as Celery ingest queue

    Op->>UI: start URL + objective + required fields
    UI->>API: POST /v1/crawl-blueprints/preview
    API->>BP: preview_blueprint(...)
    BP->>BP: validate_public_url — block private and reserved IPs
    BP->>Site: GET /robots.txt and the start page
    Site-->>BP: robots text + HTML or XML
    BP->>BP: collect candidates from sitemap, else page links
    BP->>BP: classify_page_type per URL
    BP->>BP: representative_urls — up to 16
    BP->>Site: sample those pages
    Site-->>BP: HTML per sample
    BP->>BP: detect_evidence_fields — per-field hit rates
    BP-->>API: discovery + suggested_config + required_fields
    API-->>UI: CrawlBlueprint status=draft, version=1

    Op->>UI: edit include/exclude, max_pages, max_depth
    UI->>API: PATCH /v1/crawl-blueprints/{id}
    API-->>UI: version incremented

    Op->>UI: Approve scope and start
    UI->>API: POST /{id}/approve
    API->>INS: resolve_institution(org, start_url, name)
    INS-->>API: Institution — found or created
    API->>API: create Source with approved config
    API-->>UI: status=approved
    UI->>API: POST /{id}/run
    API->>Q: ingest_task.delay(run_id)
    API-->>UI: 202 Run queued
```

### 6.3 `institutions` — one door for a new university

`resolve_institution(session, organization_id, url, name)` derives the registrable domain, returns the existing institution or creates one with a uniqueness-retried slug, and infers `country_code` from the domain suffix. Returns `None` for an unreadable domain rather than inventing an institution. Both source-creation routes call it, which is why adding a fourth university needs no code.

### 6.4 `artifacts` — raw bytes, content-addressed

`store_artifact(content, suffix)` returns `(sha256_digest, path)`. The digest is the deduplication key for `DocumentVersion`; the file is the auditable original behind every extracted claim.

### 6.5 `chunking` — structure-aware splitting

`chunk_text(text, target_tokens=600, overlap_tokens=80)` produces `TextChunk`s carrying `position`, `heading`, `section_path`, a `stable_anchor` slug, and `content_hash`. Version-stamped `CHUNKER_VERSION = "structure-v1"`, so changing the algorithm invalidates indexes deliberately.

### 6.6 `indexing` — chunks, vectors, and index state

`index_document_version` is idempotent: if a `DocumentIndex` is already `ready` with the same `content_hash` *and* `chunker_version`, it returns immediately. Otherwise it deletes stale chunks, re-chunks, embeds, and writes `ChunkEmbedding` rows.

Three distinct failure outcomes rather than one:
- **`waiting`** — Ollama unreachable. Chunks are kept, embeddings are zero, the work is resumable.
- **`failed`** — wrong vector count or wrong dimensions. Also flips `profile.healthy = False` so retrieval stops trusting that profile.
- **`ready`** — sets `document.current_version_id` and marks every older ready index `stale`.

### 6.7 `ollama` — the local model gateway

Wraps chat, `structured` (JSON-schema-constrained), and `embed`. Exposes a `workload()` async lock so a generation holds the model rather than interleaving with a competing request, and `unload_chat=True` lets an embedding call evict the chat model on a memory-constrained machine. Raises `OllamaUnavailable`, which every caller treats as *degrade*, never *crash*.

### 6.8 `search` — three-lane hybrid retrieval

Covered in full in §9.1.

### 6.9 `generation` — grounded answers or silence

Covered in full in §9.2.

### 6.10 `crawl_events` — the observability spine

Covered in §10.

### 6.11 `evaluation` — retrieval quality runs

`run_evaluation(evaluation_id)` replays a question set against a chosen embedding profile and records scores on `EvaluationRun`, so an embedding change is a measured decision rather than a vibe.

---

## 7. Layer 5 — Connectors and extractors (6)

### 7.1 Connectors (3)

| Connector | Handles | Extract behaviour |
|---|---|---|
| `WebsiteConnector` | HTML and PDF over HTTP(S) | `trafilatura` for main text with links and tables preserved, BeautifulSoup fallback |
| `DocumentConnector` | Uploaded PDF, DOCX, HTML, Markdown, text | PDF keeps **per-page** text so citations can name a page number |
| `GreenwichConnector` | `gre.ac.uk` | Subclasses `WebsiteConnector` with a site-specific config |

`WebsiteConnector` also owns the crawl-safety primitives: `validate_public_url` (the SSRF guard), `robots_allowed`, `allowed_link` and `extract_links`.

### 7.2 Extraction registry and extractors (3)

Extractor choice is **decoupled from connector choice** — a deliberate fix, because extraction was once selected by the literal hostname `gre.ac.uk`, which is precisely why every other university crawled cleanly and produced nothing.

```mermaid
flowchart TD
    A(["extract_course_records(source, url, html)"]) --> B{"source.config.domain_pack<br/>== 'university'?"}
    B -- no --> Z(["return [] — connector output stands alone"])
    B -- yes --> C["domain = registrable_domain(source.url or url)"]
    C --> D{"explicit override<br/>in NAMED_EXTRACTORS?"}
    D -- "'generic'" --> G
    D -- "'greenwich'" --> H
    D -- none --> E{"domain in<br/>DOMAIN_EXTRACTORS?"}
    E -- "gre.ac.uk" --> H["GreenwichCourseExtractor<br/>stable anchor ids"]
    E -- "any other domain" --> G["GenericUniversityExtractor<br/>structure first, model second"]

    G --> I{"ollama injected?"}
    I -- "yes, page within LLM budget" --> J["structural pass + bounded model pass"]
    I -- "no, budget spent" --> K["structural pass only"]

    H --> L
    J --> L
    K --> L
    L["extractor.extract_records(url, html)"] --> M{"raised?"}
    M -- yes --> N(["log exception, return []<br/>one bad page never ends the crawl"])
    M -- no --> O(["list of course record dicts"])

    note1["Adding a university needs no registry entry:<br/>the generic extractor is the default."]
    E -.- note1
```

### 7.3 The generic extraction pipeline

Deterministic structure first; a bounded model pass second; every model-supplied value verified against the page before it is kept.

```mermaid
flowchart TD
    A(["GenericUniversityExtractor.extract_records"]) --> B["structural(url, html)"]
    B --> C["_from_json_ld — schema.org Course blocks<br/>confidence 0.95 to 0.99"]
    C --> D["_from_heading — h1 and title, AWARD_PATTERN"]
    D --> E{"_looks_like_a_course?"}

    E --> E1{"title present?"}
    E1 -- no --> X(["return [] — no record"])
    E1 -- yes --> E2{"URL matches<br/>NOT_A_COURSE_URL_HINTS?"}
    E2 -- "yes: /accommodation, /student-life,<br/>/open-days-and-events, /course-search, ..." --> X
    E2 -- no --> E3{"title ends with '?'"}
    E3 -- "yes: 'Thinking of doing a PhD?'" --> X
    E3 -- no --> E4{"award recognised?"}
    E4 -- yes --> F
    E4 -- no --> E5{"URL contains<br/>/course/ /courses/ /programme/<br/>/program/ /degree/ ?"}
    E5 -- no --> X
    E5 -- yes --> F

    F["_from_key_values — dl and 2-column tables"] --> G["_from_fee_tables — currency + amount + residency"]
    G --> H["_from_sections — heading-word matching"]
    H --> I["_derive — intakes, study modes, level"]
    I --> J{"required field still empty<br/>AND ollama available?"}

    J -- yes --> K["model_pass — at most max_llm_fields prompts"]
    K --> L{"verify_excerpt: is the quote<br/>literally on the page?"}
    L -- no --> M["drop the value — model invented it"]
    L -- yes --> N["accept, record evidence method=model"]
    M --> O
    N --> O
    J -- no --> O

    O["build_record"] --> P["CourseIntelligenceRecord.model_validate"]
    P --> Q["course_coverage — 8 REQUIRED_COURSE_FIELDS"]
    Q --> R{"coverage == 1.0 and<br/>every required field has evidence?"}
    R -- yes --> S(["status = published"])
    R -- no --> T(["status = review<br/>validation.missing_fields + review_reasons"])
```

**The `_looks_like_a_course` gate deserves its own note.** A campus page, an accommodation page and a course page all have an `<h1>`. Without a course signal the extractor mints a "course" from any heading. The gate now requires, in order: a title; no match against `NOT_A_COURSE_URL_HINTS`; a title that is not a question; then either a recognised award or a URL containing a course-naming path segment (`/course/`, `/courses/`, `/programme/`, `/program/`, `/degree/`).

Section prefixes were removed from the positive hints because they are not course signals — a university that files accommodation, open days and student profiles under `/study/` will otherwise produce a catalogue of halls of residence.

**Evidence is the output, not a side effect.** Every field carries `source_url`, `method` (`jsonld`, `keyvalue`, `heading`, `model`, …), `excerpt`, optional `section`, and `confidence`. A model-supplied value whose quote is not literally on the page is discarded by `verify_excerpt`.

Coverage is computed over 8 `REQUIRED_COURSE_FIELDS`: `title`, `award`, `level`, `campuses`, `durations`, `intake_months`, `fees`, `entry_requirements`.

---

## 8. Layer 6 — Persistence (26 tables, 9 enums)

### 8.1 Table groups

| Group | Tables |
|---|---|
| Tenancy | `organizations`, `api_keys` |
| Catalogue | `collections`, `institutions`, `sources`, `crawl_blueprints` |
| Crawl execution | `runs`, `run_issues` |
| Telemetry | `crawl_events`, `incidents` |
| Content | `documents`, `document_versions` |
| Retrieval index | `chunks`, `chunk_embeddings`, `embedding_profiles`, `document_indexes` |
| Structured knowledge | `structured_records`, `structured_record_revisions`, `course_shortlist_entries` |
| Conversation and RAG | `conversations`, `messages`, `message_generations`, `generation_events`, `retrieval_runs`, `evaluation_runs` |
| Governance | `action_proposals` |

The live database also carries `alembic_version`, which is migration bookkeeping rather than an application table.

### 8.2 Enums (9)

`Role`, `SourceKind`, `RunStatus`, `ProposalStatus`, `IndexStatus`, `GenerationStatus`, `EvaluationStatus`, `RecordStatus`, `BlueprintStatus`.

### 8.3 Entity relationships

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ API_KEYS : "issues"
    ORGANIZATIONS ||--o{ COLLECTIONS : "owns"
    ORGANIZATIONS ||--o{ INSTITUTIONS : "owns"
    ORGANIZATIONS ||--o{ CRAWL_BLUEPRINTS : "owns"
    ORGANIZATIONS ||--o{ CONVERSATIONS : "owns"
    ORGANIZATIONS ||--o{ CRAWL_EVENTS : "scopes"
    ORGANIZATIONS ||--o{ INCIDENTS : "scopes"
    ORGANIZATIONS ||--o{ RETRIEVAL_RUNS : "scopes"
    ORGANIZATIONS ||--o{ EVALUATION_RUNS : "scopes"
    ORGANIZATIONS ||--o{ ACTION_PROPOSALS : "scopes"

    COLLECTIONS ||--o{ SOURCES : "contains"
    COLLECTIONS ||--o{ DOCUMENTS : "contains"
    COLLECTIONS ||--o{ STRUCTURED_RECORDS : "contains"
    COLLECTIONS ||--o{ CRAWL_BLUEPRINTS : "planned for"
    COLLECTIONS ||--o{ CONVERSATIONS : "scopes"
    COLLECTIONS ||--o{ RETRIEVAL_RUNS : "scopes"
    COLLECTIONS ||--o{ EVALUATION_RUNS : "scopes"

    INSTITUTIONS ||--o{ SOURCES : "publishes"
    INSTITUTIONS ||--o{ STRUCTURED_RECORDS : "attributed to"

    SOURCES ||--o{ RUNS : "executes"
    SOURCES ||--o{ DOCUMENTS : "produces"
    SOURCES ||--o{ CRAWL_EVENTS : "emits"
    SOURCES ||--o{ INCIDENTS : "raises"
    SOURCES ||--o{ CRAWL_BLUEPRINTS : "approved into"

    RUNS ||--o{ RUN_ISSUES : "records"
    RUNS ||--o{ CRAWL_EVENTS : "times"
    RUNS ||--o{ DOCUMENT_VERSIONS : "captures"
    RUNS ||--o{ INCIDENTS : "triggers"
    RUNS ||--o| RUNS : "retry_of"

    DOCUMENTS ||--o{ DOCUMENT_VERSIONS : "versioned as"
    DOCUMENTS ||--o{ CHUNKS : "split into"
    DOCUMENTS ||--o{ DOCUMENT_INDEXES : "indexed by"
    DOCUMENTS ||--o{ STRUCTURED_RECORDS : "evidences"

    DOCUMENT_VERSIONS ||--o{ CHUNKS : "chunked into"
    DOCUMENT_VERSIONS ||--o{ DOCUMENT_INDEXES : "index state"

    CHUNKS ||--o{ CHUNK_EMBEDDINGS : "embedded as"
    EMBEDDING_PROFILES ||--o{ CHUNK_EMBEDDINGS : "produced by"
    EMBEDDING_PROFILES ||--o{ DOCUMENT_INDEXES : "governs"
    EMBEDDING_PROFILES ||--o{ EVALUATION_RUNS : "measured"
    EMBEDDING_PROFILES ||--o{ MESSAGE_GENERATIONS : "used by"

    STRUCTURED_RECORDS ||--o{ STRUCTURED_RECORD_REVISIONS : "history"
    STRUCTURED_RECORDS ||--o{ COURSE_SHORTLIST_ENTRIES : "shortlisted"

    CONVERSATIONS ||--o{ MESSAGES : "holds"
    CONVERSATIONS ||--o{ MESSAGE_GENERATIONS : "answers"
    CONVERSATIONS ||--o{ ACTION_PROPOSALS : "proposes"
    MESSAGES ||--o{ MESSAGE_GENERATIONS : "prompts"
    MESSAGE_GENERATIONS ||--o{ GENERATION_EVENTS : "streams"
    RETRIEVAL_RUNS ||--o{ MESSAGE_GENERATIONS : "grounds"

    ORGANIZATIONS {
        string id PK
        string name
    }
    STRUCTURED_RECORDS {
        string id PK
        string collection_id FK
        string institution_id FK
        string document_id FK
        string schema_name "university.course"
        string external_id "canonical source URL"
        json data "typed course facts"
        json evidence "per-field excerpts"
        json validation_json "coverage, missing_fields"
        enum status "review | published | rejected"
        int revision
        string extractor_version
    }
    DOCUMENT_VERSIONS {
        string id PK
        string document_id FK
        string content_hash "sha256 — dedupe key"
        text text
        string artifact_path
    }
    CHUNK_EMBEDDINGS {
        string id PK
        string chunk_id FK
        string embedding_profile_id FK
        vector embedding "pgvector, HNSW cosine"
    }
```

### 8.4 Invariants the schema enforces

1. **Tenant reachability.** Every content row reaches an `organization_id` through `Collection`, `Institution` or `Conversation`. There is no unscoped read path.
2. **Content addressing.** `(document_id, content_hash)` decides whether a fetch is a new version or a no-op. An unchanged page costs no re-embedding.
3. **One current version.** `documents.current_version_id` names the indexed version; retrieval joins `Document.current_version_id == Chunk.document_version_id`, so superseded chunks are invisible to search without being deleted.
4. **Revision, never overwrite.** Any change to a `structured_record` writes a `structured_record_revisions` snapshot and increments `revision`.
5. **Cascade only where history is worthless.** `structured_record_revisions` and `course_shortlist_entries` cascade from their record; documents and versions do not cascade from collections, so deleting a collection is a deliberate, ordered operation.
6. **Institution freshness.** A revisited record refreshes `institution_id` even when nothing else changed — otherwise a page that never changes again keeps a stale institution and silently drops out of institution joins.

### 8.5 Versioning and indexing workflow

```mermaid
flowchart TD
    A(["persist_extraction(source, run, url, raw, content_type, extracted)"]) --> B{"content is text/html?"}
    B -- yes --> C["fill_institution_branding<br/>only fills columns that are still NULL —<br/>never overwrites an operator's value"]
    B -- no --> D
    C --> D{"connector produced<br/>structured_records?"}
    D -- no, and html --> E["extract_course_records — see diagram 10"]
    D -- yes --> F
    E --> F["store_artifact(raw) -> sha256 digest + path"]

    F --> G{"Document exists for<br/>(source_id, canonical_url)?"}
    G -- no --> H["INSERT Document<br/>created = True"]
    G -- yes --> I["reuse Document<br/>created = False"]
    H --> J
    I --> J{"DocumentVersion with this<br/>content_hash already present?"}

    J -- "yes — page unchanged" --> K["persist_structured_records only<br/>return False: no new version, no re-embed"]
    J -- no --> L["INSERT DocumentVersion<br/>text, metadata, artifact_path, run_id"]

    L --> M["index_document_version"]
    M --> N{"DocumentIndex ready with same<br/>content_hash and chunker_version?"}
    N -- yes --> O["reuse — set document.current_version_id"]
    N -- no --> P["status=indexing, attempts += 1<br/>DELETE old chunks for this version"]
    P --> Q["chunk_text — target 600 tokens, overlap 80<br/>heading, section_path, stable anchor"]
    Q --> R["ollama.embed(chunk contents)"]

    R -- OllamaUnavailable --> S(["status=waiting<br/>chunks kept, 0 embeddings<br/>RAG_INDEX_FAILURES ollama_unavailable"])
    R -- "wrong count or dimensions" --> T(["status=failed<br/>profile.healthy = False<br/>RAG_INDEX_FAILURES invalid_embedding"])
    R -- ok --> U["INSERT ChunkEmbedding per chunk"]
    U --> V["status=ready<br/>document.current_version_id = version.id<br/>older ready indexes -> stale"]

    V --> W
    O --> W
    K --> W
    W["persist_structured_records"] --> X{"record exists for<br/>(collection, schema_name, external_id)?"}
    X -- no --> Y["INSERT StructuredRecord<br/>+ revision 1 'Initial crawler extraction'"]
    X -- yes --> Z["always refresh institution_id"]
    Z --> AA{"data, evidence or validation changed?"}
    AA -- no --> AB(["no revision written"])
    AA -- yes --> AC["update fields, revision += 1<br/>+ StructuredRecordRevision snapshot"]
```

---

## 9. Cross-cutting workflow: retrieval and generation

### 9.1 Three-lane hybrid retrieval

`retrieve_knowledge` runs a structured lane, a lexical lane and a semantic lane, then fuses them.

Two details that look like noise and are not:
- `session.rollback()` **before** query planning and `session.commit()` **before** embedding. Both release the PostgreSQL connection across a call to Ollama that can take minutes on a constrained machine. Without them the database sits idle-in-transaction for the duration.
- Caller-supplied filters are **re-validated** through the same slot vocabulary as the model's plan. Caller input is free text too.

Fusion is reciprocal rank fusion weighted **structured 1.35, lexical 1.0, vector 1.0** — structured records outrank prose because they already passed the publish gate. A per-document cap of 3 chunks stops one verbose page from filling the context window; every drop is recorded as an exclusion, so the Retrieval Lab can show *why* a passage is missing.

```mermaid
flowchart TD
    Q(["retrieve_knowledge(query, org, collection, mode, limit)"]) --> RB["session.rollback — release the auth transaction<br/>before the model call"]
    RB --> PL["plan_query via Ollama structured output"]
    PL --> PLF{"model available?"}
    PLF -- no --> PLD["deterministic fallback plan"]
    PLF -- yes --> PLM["QueryPlan: search_query, slots, filters"]
    PLD --> MERGE
    PLM --> MERGE["merge caller filters,<br/>re-validated through the same slot vocabulary"]
    MERGE --> RQ["resolved_query = plan.search_query or query<br/>query_terms, text_query"]

    RQ --> L1
    RQ --> L2
    RQ --> L3

    subgraph lanes["Three independent evidence lanes"]
        L1["Lane 1 — structured<br/>StructuredRecord joined to Collection<br/>org-scoped, published only unless drafts allowed<br/>record_matches_plan score, top 50"]
        L2["Lane 2 — lexical<br/>PostgreSQL to_tsvector + websearch_to_tsquery<br/>ts_rank_cd, top 50<br/>(SQLite: term counting fallback)"]
        L3["Lane 3 — semantic<br/>active healthy EmbeddingProfile<br/>ollama.embed(resolved_query)<br/>pgvector cosine_distance, top 50"]
    end

    L3 --> DIM{"vector length ==<br/>profile.dimensions?"}
    DIM -- no --> EX1["exclusion: provider_unavailable"]
    DIM -- yes --> FUSE
    L1 --> BRIDGE["structured hits -> up to 3 chunks<br/>per matched document"]
    BRIDGE --> FUSE
    L2 --> FUSE
    EX1 --> FUSE

    FUSE["reciprocal_rank_fusion<br/>weights: structured 1.35, lexical 1.0, vector 1.0"]
    FUSE --> CAP{"per-document cap:<br/>already 3 chunks from this document?"}
    CAP -- yes --> DROP["exclusion: document_cap"]
    CAP -- no --> SEL["select until limit reached"]
    DROP --> SEL
    SEL --> OUT(["RetrievalResult:<br/>hits, structured_matches, candidates,<br/>exclusions, timings, plan + plan_source"])
    OUT --> PERSIST{"persist requested?"}
    PERSIST -- yes --> RR[("RetrievalRun row —<br/>the Retrieval Lab trace")]
```

### 9.2 Generation with sentence-level validation

```mermaid
sequenceDiagram
    autonumber
    participant W as Celery ai queue
    participant G as generate_answer
    participant DB as PostgreSQL
    participant R as retrieve_knowledge
    participant O as Ollama
    participant SSE as /conversations/{id}/events

    W->>G: generate_task(generation_id)
    G->>DB: load MessageGeneration, Conversation, Message
    G->>DB: status = retrieving
    G-->>SSE: retrieval.started
    G->>O: acquire ollama.workload lock
    G->>R: retrieve_knowledge(question, history, hybrid, limit 10)
    R-->>G: RetrievalResult + retrieval_run_id
    G-->>SSE: retrieval.completed (plan, timings, counts)

    alt evidence_catalog is empty
        G->>DB: status = abstained, reason no_published_evidence
        G-->>SSE: abstained
    else evidence present
        G->>DB: status = generating, model recorded
        G-->>SSE: generation.started
        loop each streamed sentence
            O-->>G: token stream
            G->>G: split on sentence boundary
            G->>G: validate_sentence_support — does a [n] citation<br/>point at a real evidence item?
            alt sentence is supported
                G-->>SSE: token / sentence emitted
            else unsupported
                G->>G: drop the sentence entirely
                G-->>SSE: withheld (reason only, never the text)
            end
        end
        G->>DB: status = completed, citations recorded
    end

    Note over G,O: OllamaUnavailable -> status failed, retryable true.<br/>Any other exception -> status failed, retryable false.
```

The rule that shapes this component: **a sentence that cannot cite real evidence never reaches the user.** Validation happens per sentence during streaming, and a withheld sentence is reported by reason only — the text stays out of the payload because it may contain the invented fee that failed validation in the first place. With no evidence at all the generation abstains rather than answering.

### 9.3 Review and publication

```mermaid
stateDiagram-v2
    direction LR
    [*] --> review: crawler extraction, coverage < 1
    [*] --> published: crawler extraction, coverage == 1 with full evidence

    review --> published: POST /records/{id}/publish
    review --> rejected: POST /records/{id}/reject
    review --> review: POST /records/{id}/review — operator edits data

    published --> review: re-opened for correction
    published --> rejected: withdrawn
    rejected --> review: re-opened

    note right of published
        The publish gate refuses unless ALL hold:
        coverage == 1, no missing_fields,
        no contradictions, and every one of the 8
        REQUIRED_COURSE_FIELDS carries evidence.
        Otherwise 409 with the exact gaps listed.
    end note

    note left of review
        Every transition writes a
        StructuredRecordRevision snapshot
        and increments record.revision,
        so history is never overwritten.
    end note
```

The publish gate refuses with `409` unless coverage is exactly `1`, `missing_fields` is empty, `contradictions` is empty, **and** all 8 required fields carry evidence. The response names the specific gaps. Publishing also triggers `reindex_task`, because a published record changes what retrieval should see.

### 9.4 Course gallery

```mermaid
flowchart TD
    A(["Operator opens Course gallery"]) --> B["GET /course-gallery/institutions<br/>GET /facets<br/>GET /courses"]
    B --> C[["_published_courses — org-scoped,<br/>status = published only"]]

    A2(["Natural-language brief:<br/>'cheap January MSc data science in London'"]) --> D["POST /course-gallery/interpret"]
    D --> E["build AVAILABLE from live facets:<br/>countries, study_modes, intake_months,<br/>durations, levels, institution names"]
    E --> F["ollama.structured against<br/>GalleryInterpretation JSON schema"]
    F --> G{"model reachable and<br/>output valid?"}
    G -- no --> H["fallback: whole brief becomes q,<br/>source = 'fallback'"]
    G -- yes --> I["_guard_interpretation —<br/>discard any value not in AVAILABLE"]
    H --> J
    I --> J["visible, editable filters returned<br/>with a plain-language explanation"]

    J --> K["GET /courses with filters"]
    C --> K
    K --> L["FilterBar chips + facet counts + fee range"]
    L --> M{"operator action"}
    M -- "open a card" --> N["GET /courses/{record_id}<br/>CourseDossier: every fact with its excerpt,<br/>method, confidence and source URL"]
    M -- "save" --> O["POST /shortlist<br/>CourseShortlistEntry"]
    M -- "compare" --> P["Compare view — side-by-side facts,<br/>'Not stated' where evidence is absent"]
    O --> Q["GET /shortlist"]
    Q --> P
    N --> O

    note1["Nothing unpublished can appear here.<br/>The gallery reads only what passed<br/>the Course Intelligence publish gate."]
    C -.- note1
```

The natural-language brief is interpreted into **visible, editable filters** rather than a hidden query. `_guard_interpretation` discards any value the model produced that is not in the live facet vocabulary, and an unreachable model degrades to keyword search with `source: "fallback"` stated in the response.

---

## 10. Layer 7 — Observability pipeline

```mermaid
flowchart TD
    subgraph emit["Emission — inside every crawl stage"]
        A["record_crawl_event(stage, outcome, ...)"]
        A --> B["resolve organization_id from Collection"]
        B --> C["sequence = max(sequence for run) + 1"]
        C --> D["sanitize_url — strip query and credentials"]
        D --> E["attach trace_id + span_id from the active span"]
    end

    E --> F[("CrawlEvent row<br/>durable, 90-day retention")]
    E --> G["PAGES_TOTAL counter<br/>STAGE_DURATION histogram"]
    E --> H["structlog 'crawl.stage'<br/>secrets redacted by SECRET_KEY regex"]
    E --> I["Redis XADD scrapal:crawl-events<br/>maxlen 50000 — best effort"]

    I -.->|"stream unavailable is logged,<br/>never fatal"| I2["warning only"]

    J["publish_worker_heartbeat<br/>SETEX 90s per host:pid"] --> K[("Redis worker keys")]

    F --> L["GET /observability/runs/{id}/timeline"]
    I --> M["live run monitor in the console"]
    K --> N["GET /observability/workers"]

    O{"run finished with status=failed?"} -- yes --> P["upsert_incident<br/>fingerprint run-failed:{run_id}<br/>rule crawler_run_failed, severity critical"]
    P --> Q[("Incident row<br/>occurrence_count deduplicated")]
    Q --> R["GET /observability/incidents<br/>acknowledge / resolve"]

    G --> S["/metrics — Prometheus scrape"]
    H --> T["OTLP -> otel-collector -> Loki"]
    E --> U["OTLP spans -> otel-collector -> Tempo"]
    S --> V["Prometheus -> Alertmanager"]
    T --> W["Grafana"]
    U --> W
    V --> W
```

Every crawl stage calls `record_crawl_event`, which emits **four ways at once**: a durable `CrawlEvent` row, Prometheus counters and histograms, a redacted structured log line, and a best-effort Redis stream push for the live console. The Redis push is wrapped so a stream outage is a warning, never a failed crawl.

`sanitize_url` strips query strings and credentials before any URL is persisted or logged. Trace and span ids are attached to each event, so a row in the console links to its Tempo trace.

**Prometheus instruments (12):** `RUNS_TOTAL`, `ACTIVE_RUNS`, `PAGES_TOTAL`, `STAGE_DURATION`, `FETCH_BYTES`, `OUTPUT_TOTAL`, `RAG_STAGE_DURATION`, `RAG_CANDIDATES`, `RAG_QUERIES`, `RAG_CITATIONS`, `RAG_CONTEXT_SIZE`, `RAG_INDEX_FAILURES`.

---

## 11. Layer 8 — Async tasks (3) and the console (11 modules)

### 11.1 Queue topology

```mermaid
flowchart LR
    subgraph producers["Producers"]
        API1["POST /v1/runs"]
        API2["POST /crawl-blueprints/{id}/run"]
        API3["POST /conversations/{id}/messages"]
        API4["POST /course-intelligence/records/{id}/publish"]
        Beat["celery beat scheduler"]
    end

    subgraph broker["RabbitMQ"]
        Qi[["queue: ingest"]]
        Qa[["queue: ai"]]
        Qd[["queue: default"]]
    end

    subgraph worker["worker container — concurrency 2"]
        T1["scrapal.ingest<br/>retry: ConnectionError, backoff, max 4"]
        T2["scrapal.generate<br/>retry: ConnectionError, backoff, max 3"]
        T3["scrapal.reindex<br/>retry: ConnectionError, backoff, max 3"]
    end

    API1 --> Qi
    API2 --> Qi
    API3 --> Qa
    API4 -->|"republish changes the<br/>indexed content"| Qa
    Beat --> Qd

    Qi --> T1
    Qa --> T2
    Qa --> T3

    T1 --> W1["ingest_run"]
    T2 --> W2["generate_answer"]
    T3 --> W3["reindex_document_version"]

    note1["task_acks_late + task_reject_on_worker_lost:<br/>a killed worker returns the task to the queue.<br/>prefetch_multiplier 1 keeps long crawls<br/>from starving the AI queue."]
    broker -.- note1

    note2["Every task wraps its coroutine in<br/>engine.dispose() before and after:<br/>asyncpg connections belong to the loop<br/>that created them, and asyncio.run()<br/>makes a new loop per task."]
    worker -.- note2
```

### 11.2 Task table

| Task | Queue | Retries | Entry point |
|---|---|---|---|
| `scrapal.ingest` | `ingest` | `ConnectionError`, backoff, max 4 | `ingest_run` |
| `scrapal.generate` | `ai` | `ConnectionError`, backoff, max 3 | `generate_answer` |
| `scrapal.reindex` | `ai` | `ConnectionError`, backoff, max 3 | `reindex_document_version` |

### 11.3 The event-loop isolation every task shares

Celery runs many tasks in one long-lived forked process, while `asyncio.run()` creates a **fresh event loop per task**. AsyncPG connections belong to the loop that created them. Each task therefore calls `await engine.dispose()` both before and after its coroutine, so a pooled connection can never leak into the next task's loop. Skipping this produces intermittent, near-undebuggable cross-task failures.

### 11.4 Console

```mermaid
flowchart TB
    Shell["App.tsx shell<br/>sidebar, theme, CollectionPicker,<br/>connection banner, agent toggle"]
    Scope["useCollectionScope<br/>localStorage 'scrapal-collection-scope'<br/>isStaleScope clears a deleted collection"]
    Shell --- Scope

    Shell --> V1["Overview<br/>active run, sources, runs, documents"]
    Shell --> V2["Sources<br/>list, launch run, AddSource dialog"]
    Shell --> V3["Knowledge<br/>hybrid search over documents"]
    Shell --> V4["Course intelligence<br/>coverage orbit, status tally,<br/>university filter, evidence ledger"]
    Shell --> V5["Course gallery<br/>FilterBar, Dossier, Compare, shortlist"]
    Shell --> V6["Retrieval Lab<br/>QueryPlan, lane traces, candidate table"]
    Shell --> V7["Observability<br/>fleet health, incidents, workers"]
    Shell --> V8["Reviews<br/>approval-gated action proposals"]
    Shell --> V9["Settings<br/>Ollama status and models"]

    Shell -.-> AP["AgentPanel — cited Q&A, SSE stream"]
    V2 --> AS["AddSource -> BlueprintPreview<br/>sampled coverage before any bulk crawl"]
    V1 --> RM["RunMonitor — RunPath stages,<br/>EventTimeline, live SSE"]
    V2 --> RM
    V7 --> RM

    subgraph scoped["Views bound to the collection scope"]
        V3
        V4
        V5
        V6
    end

    Scope -.->|"collection_id query param"| scoped
```

Nine views in one React application. State is TanStack Query over a typed `api.ts` client; the collection scope persists in `localStorage`, and `isStaleScope` clears a scope whose collection no longer exists — necessary because `CollectionPicker` hides itself below two collections, so a stale id would otherwise filter every view to nothing with no control left to clear it.

---

## 12. How every number here was derived

Counts in this document are query results, not estimates. Re-run these to re-verify:

```bash
grep -c '__tablename__' src/scrapal/models.py                       # 26 tables
grep -c '^class .*enum.Enum' src/scrapal/models.py                  # 9 enums
grep -l 'APIRouter(' src/scrapal/*.py | wc -l                       # 6 routers
grep -h '^@router\.' src/scrapal/*.py | wc -l                       # 62 endpoints
ls src/scrapal/services/*.py | grep -v __init__ | wc -l             # 11 services
grep -c '@celery_app.task' src/scrapal/jobs.py                      # 3 tasks

docker compose exec -T postgres psql -U scrapal -d scrapal -c \
  "select count(*) from information_schema.tables where table_schema='public'"   # 27 = 26 + alembic_version
```

Diagram sources are validated, not eyeballed — all 20 parse under Mermaid 11:

```bash
npm i --no-save mermaid jsdom                              # parser needs a DOM
node scripts/validate-diagrams.mjs docs/diagrams/architecture   # 20 standalone sources
node scripts/validate-diagrams.mjs docs/ARCHITECTURE.md         # 20 embedded blocks
```

---

## 13. Diagram index

| # | Diagram | Type | Source |
|---|---|---|---|
| 1 | System context | flowchart | [`01-system-context.mmd`](diagrams/architecture/01-system-context.mmd) |
| 2 | Component map | flowchart | [`02-component-map.mmd`](diagrams/architecture/02-component-map.mmd) |
| 3 | Runtime topology | flowchart | [`03-runtime-topology.mmd`](diagrams/architecture/03-runtime-topology.mmd) |
| 4 | Request auth and tenancy | sequence | [`04-request-auth-flow.mmd`](diagrams/architecture/04-request-auth-flow.mmd) |
| 5 | Blueprint lifecycle | sequence | [`05-blueprint-lifecycle.mmd`](diagrams/architecture/05-blueprint-lifecycle.mmd) |
| 6 | Ingestion run flow | flowchart | [`06-ingestion-run-flow.mmd`](diagrams/architecture/06-ingestion-run-flow.mmd) |
| 7 | Page pipeline states | state | [`07-page-pipeline-state.mmd`](diagrams/architecture/07-page-pipeline-state.mmd) |
| 8 | Run status states | state | [`08-run-status-state.mmd`](diagrams/architecture/08-run-status-state.mmd) |
| 9 | Extractor registry | flowchart | [`09-extractor-registry.mmd`](diagrams/architecture/09-extractor-registry.mmd) |
| 10 | Course extraction pipeline | flowchart | [`10-course-extraction-pipeline.mmd`](diagrams/architecture/10-course-extraction-pipeline.mmd) |
| 11 | Versioning and indexing | flowchart | [`11-versioning-indexing.mmd`](diagrams/architecture/11-versioning-indexing.mmd) |
| 12 | Retrieval lanes and fusion | flowchart | [`12-retrieval-lanes.mmd`](diagrams/architecture/12-retrieval-lanes.mmd) |
| 13 | Generation and validation | sequence | [`13-generation-validation.mmd`](diagrams/architecture/13-generation-validation.mmd) |
| 14 | Record review states | state | [`14-record-review-state.mmd`](diagrams/architecture/14-record-review-state.mmd) |
| 15 | Course gallery flow | flowchart | [`15-course-gallery-flow.mmd`](diagrams/architecture/15-course-gallery-flow.mmd) |
| 16 | Observability pipeline | flowchart | [`16-observability-pipeline.mmd`](diagrams/architecture/16-observability-pipeline.mmd) |
| 17 | Queue topology | flowchart | [`17-queue-topology.mmd`](diagrams/architecture/17-queue-topology.mmd) |
| 18 | Data model | ER | [`18-data-model-erd.mmd`](diagrams/architecture/18-data-model-erd.mmd) |
| 19 | Console view map | flowchart | [`19-console-view-map.mmd`](diagrams/architecture/19-console-view-map.mmd) |
| 20 | Tenancy and egress boundary | flowchart | [`20-tenancy-boundary.mmd`](diagrams/architecture/20-tenancy-boundary.mmd) |

---

## 14. Known architectural gaps

Stated here so the diagrams are not read as claims of completeness.

1. **Identity is API-key only.** No user accounts, no sessions, no per-user audit. `Principal` carries an organization and a role, not a person.
2. **The scheduler runs with nothing scheduled.** Recurring change monitoring is architecturally present and operationally absent.
3. **Extraction quality is domain-shaped, not universal.** The generic extractor is heuristic. Its guards are only as good as the URL conventions it has met, and each new university is evidence, not proof.
4. **`max_llm_pages` silently changes extraction quality mid-crawl.** Pages past the budget are read structurally only. A `RunIssue` records the moment, but two records from one run may have had different extraction power.
5. **The console is a single trusted surface.** Every admin router requires `super_admin`; there is no reviewer-versus-publisher separation.
6. **No horizontal worker story.** `concurrency=2` on one container. Nothing shards a crawl across workers.
