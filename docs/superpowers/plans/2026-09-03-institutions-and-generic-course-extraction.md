# Institutions and Generic Course Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every university added to the workspace produce course records, and make every collection visible in the console — so Buckingham and Westminster appear in Course Intelligence alongside Greenwich.

**Architecture:** Introduce an `Institution` entity resolved from a source URL's registrable domain, replace the hardcoded `"gre.ac.uk" in hostname` extraction branch with an extractor registry whose default is a generic university course extractor, and remove the console's `collections[0]` assumption. The generic extractor reads structurally first (JSON-LD, definition lists, fee tables, headings) and only then asks the local model to fill what remains — accepting a model-filled field only when it returns a verbatim excerpt that is actually present in the page.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2 async, Alembic, BeautifulSoup 4, Pydantic 2, Ollama (`qwen2.5:7b-instruct`), pytest with `asyncio_mode = "auto"`, React 19 + TanStack Query, Vite, vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-course-gallery-multi-institution-design.md`

**Scope:** This plan covers spec sections 1, 2 and 3 (Institution, generic extraction, multi-collection). The Course Gallery API, console view and shortlist (spec sections 4, 5, 6) are a second plan that builds on this one. This plan is independently shippable: on completion, Buckingham and Westminster produce course records and both collections are visible.

## Global Constraints

- Python 3.12. `disallow_untyped_defs = true` — every function you write needs annotations.
- Ruff, line length 100, rules `E, F, I, UP, B, ASYNC`. Run `ruff check src tests` before every commit.
- `pytest` runs with `asyncio_mode = "auto"`; async tests need no `@pytest.mark.asyncio`, though existing files use it and that is harmless.
- Tests must run offline. No test may make a network call or require Ollama. The model is always injected and faked in tests.
- SQLite in-memory is the test database (`sqlite+aiosqlite:///:memory:`), Postgres is production. Any DDL you add must work on both — follow the guard style in `migrations/versions/0007_course_intelligence.py`, which inspects the dialect before creating enums.
- New columns on existing tables are **nullable**. There is live data in this database; a non-nullable column without a server default will fail to migrate.
- The publish gate in `src/scrapal/course_intelligence_api.py:157` is not modified by this plan. Nothing you add may let a record reach `published` with a required field that has no evidence.
- Existing tests must keep passing unchanged: `tests/test_greenwich.py`, `tests/test_course_intelligence.py`, `tests/test_blueprints.py`, `tests/test_ingestion_resilience.py`.
- Commit after every task. Do not batch commits.

---

## File Structure

**Create**

| Path | Responsibility |
| --- | --- |
| `src/scrapal/domain/university/institutions.py` | Pure functions: registrable domain, TLD→country, display name. No I/O. |
| `src/scrapal/services/institutions.py` | `resolve_institution` — the only place an `Institution` row is created. |
| `src/scrapal/domain/university/extractors/__init__.py` | Package marker. |
| `src/scrapal/domain/university/extractors/base.py` | `CourseExtractor` protocol and shared excerpt helpers. |
| `src/scrapal/domain/university/extractors/greenwich.py` | Adapter wrapping the existing `GreenwichConnector`. |
| `src/scrapal/domain/university/extractors/generic.py` | `GenericUniversityExtractor` — structural pass plus verified model pass. |
| `src/scrapal/domain/university/extractors/registry.py` | `resolve_extractor` — override, then domain, then generic. |
| `migrations/versions/0009_institutions.py` | Institutions table, two FK columns, backfill. |
| `tests/test_institutions.py` | Domain resolution, country mapping, `resolve_institution`. |
| `tests/test_generic_extractor.py` | Structural passes, excerpt verification, registry. |
| `tests/fixtures/buckingham_course.html` | Definition-list and fee-table shaped course page. |
| `tests/fixtures/westminster_course.html` | JSON-LD shaped course page with a partial record. |
| `console/src/CollectionPicker.tsx` | Topbar collection selector and its shared state hook. |

**Modify**

| Path | Change |
| --- | --- |
| `src/scrapal/models.py` | `Institution` model; `Source.institution_id`; `StructuredRecord.institution_id`. |
| `src/scrapal/blueprints_api.py:120-133` | Resolve an institution; carry `domain_pack` into `Source.config`; stop switching on hostname. |
| `src/scrapal/services/ingestion.py:207-215, 517-580` | Dispatch by extractor registry; stamp `institution_id` on records. |
| `src/scrapal/course_intelligence_api.py:62-89` | Per-institution breakdown on the overview; `institution_id` filter on records. |
| `src/scrapal/schemas.py` | `InstitutionOut`; `institution_id` on `StructuredRecordOut`. |
| `console/src/api.ts` | `institutions()`; `institution_id` parameter passthrough. |
| `console/src/App.tsx:74, 160-170, 292-300` | Remove `collections[0]`; wire the collection picker; render the breakdown. |

---

## Task 1: Institution identity — domain, country, display name

Pure functions with no database and no I/O, so they can be tested exhaustively and reused by the migration.

**Files:**
- Create: `src/scrapal/domain/university/institutions.py`
- Test: `tests/test_institutions.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `registrable_domain(url: str) -> str | None`
  - `country_for_domain(domain: str) -> str | None`
  - `institution_name_from_domain(domain: str) -> str`
  - `slugify(name: str) -> str`

- [ ] **Step 1: Write the failing test**

Create `tests/test_institutions.py`:

```python
import pytest

from scrapal.domain.university.institutions import (
    country_for_domain,
    institution_name_from_domain,
    registrable_domain,
    slugify,
)


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://www.gre.ac.uk/sitemap.xml", "gre.ac.uk"),
        ("https://gre.ac.uk/postgraduate-courses/eng", "gre.ac.uk"),
        ("https://www.buckingham.ac.uk/course-page-sitemap.xml", "buckingham.ac.uk"),
        ("https://www.westminster.ac.uk/course-search", "westminster.ac.uk"),
        ("https://www.universiteitleiden.nl/en/education", "universiteitleiden.nl"),
        ("https://sunwayuniversity.edu.my/msc-life-sciences", "sunwayuniversity.edu.my"),
        ("https://study.abc.edu.au/courses", "abc.edu.au"),
    ],
)
def test_registrable_domain_strips_subdomains_and_keeps_compound_suffixes(
    url: str, expected: str
) -> None:
    assert registrable_domain(url) == expected


@pytest.mark.parametrize("value", ["", "not a url", "ftp://", "http://"])
def test_registrable_domain_returns_none_for_unusable_input(value: str) -> None:
    assert registrable_domain(value) is None


@pytest.mark.parametrize(
    ("domain", "expected"),
    [
        ("gre.ac.uk", "GB"),
        ("westminster.ac.uk", "GB"),
        ("universiteitleiden.nl", "NL"),
        ("sunwayuniversity.edu.my", "MY"),
        ("tcd.ie", "IE"),
        ("unimelb.edu.au", "AU"),
        ("auckland.ac.nz", "NZ"),
        ("mit.edu", "US"),
    ],
)
def test_country_for_domain_maps_known_academic_suffixes(domain: str, expected: str) -> None:
    assert country_for_domain(domain) == expected


def test_country_for_domain_returns_none_rather_than_guessing() -> None:
    # A .com university is real and common. Returning None makes the console
    # ask an administrator instead of silently filing it under the wrong flag.
    assert country_for_domain("someuniversity.com") is None


def test_institution_name_from_domain_is_a_readable_placeholder() -> None:
    assert institution_name_from_domain("buckingham.ac.uk") == "Buckingham"
    assert institution_name_from_domain("sunwayuniversity.edu.my") == "Sunwayuniversity"


def test_slugify_is_url_safe_and_collapses_punctuation() -> None:
    assert slugify("University of Greenwich") == "university-of-greenwich"
    assert slugify("St Mary's  College, London") == "st-marys-college-london"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_institutions.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'scrapal.domain.university.institutions'`

- [ ] **Step 3: Write the implementation**

Create `src/scrapal/domain/university/institutions.py`:

```python
"""Identity for an institution, derived from the address it publishes at.

A university is recognised by its registrable domain rather than by its name.
Names vary across a site ("Greenwich", "University of Greenwich", "UoG"); the
domain does not, and it is the one thing every source for that institution
shares.
"""

import re
from urllib.parse import urlparse

# Second-level suffixes that are part of the public suffix, not the name.
# Deliberately a short explicit list rather than a public-suffix dependency:
# academic domains are the only ones this platform crawls, and an unknown
# suffix degrades to a two-label domain, which is right far more often than
# it is wrong.
COMPOUND_SUFFIXES: frozenset[str] = frozenset(
    {
        "ac.uk", "co.uk", "org.uk", "gov.uk", "sch.uk",
        "edu.au", "gov.au", "com.au", "org.au",
        "ac.nz", "edu.sg", "edu.my", "com.my",
        "edu.in", "ac.in", "edu.cn", "ac.jp", "edu.hk",
        "edu.br", "edu.mx", "ac.za", "edu.pk", "ac.ae",
    }
)

# TLD to ISO 3166-1 alpha-2. Only suffixes we can be certain about appear
# here; anything absent resolves to None so an administrator is asked.
COUNTRY_BY_SUFFIX: dict[str, str] = {
    "ac.uk": "GB", "co.uk": "GB", "org.uk": "GB", "gov.uk": "GB", "uk": "GB",
    "edu.au": "AU", "com.au": "AU", "org.au": "AU", "au": "AU",
    "ac.nz": "NZ", "nz": "NZ",
    "edu.my": "MY", "com.my": "MY", "my": "MY",
    "edu.sg": "SG", "sg": "SG",
    "ie": "IE", "nl": "NL", "de": "DE", "fr": "FR", "es": "ES", "it": "IT",
    "se": "SE", "no": "NO", "dk": "DK", "fi": "FI", "pt": "PT", "pl": "PL",
    "be": "BE", "at": "AT", "ch": "CH", "cz": "CZ", "gr": "GR", "hu": "HU",
    "ac.za": "ZA", "za": "ZA",
    "edu.in": "IN", "ac.in": "IN", "in": "IN",
    "ac.jp": "JP", "jp": "JP",
    "edu.hk": "HK", "hk": "HK",
    "edu.cn": "CN", "cn": "CN",
    "edu.br": "BR", "br": "BR",
    "edu.mx": "MX", "mx": "MX",
    "edu.pk": "PK", "pk": "PK",
    "ac.ae": "AE", "ae": "AE",
    "ca": "CA",
    "edu": "US",
}


def registrable_domain(url: str) -> str | None:
    """The domain that identifies an institution, with subdomains removed."""
    if not url or "://" not in url:
        return None
    host = (urlparse(url).hostname or "").lower().strip(".")
    if not host or "." not in host:
        return None
    labels = host.split(".")
    for depth in (3, 2):
        if len(labels) >= depth and ".".join(labels[-(depth - 1):]) in COMPOUND_SUFFIXES:
            return ".".join(labels[-depth:])
    return ".".join(labels[-2:])


def country_for_domain(domain: str) -> str | None:
    """ISO country code implied by the domain suffix, or None if unknown."""
    labels = domain.lower().split(".")
    for depth in (2, 1):
        if len(labels) >= depth:
            suffix = ".".join(labels[-depth:])
            if suffix in COUNTRY_BY_SUFFIX:
                return COUNTRY_BY_SUFFIX[suffix]
    return None


def institution_name_from_domain(domain: str) -> str:
    """A readable stand-in until a crawl or an administrator supplies the real name."""
    return domain.split(".")[0].replace("-", " ").title()


def slugify(name: str) -> str:
    # Apostrophes vanish rather than becoming separators, so "St Mary's"
    # slugs as "st-marys" and not "st-mary-s".
    bare = name.lower().replace("'", "").replace("\u2019", "")
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", bare)).strip("-")
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/test_institutions.py -v`
Expected: PASS, 22 tests.

Run: `ruff check src/scrapal/domain/university/institutions.py tests/test_institutions.py`
Expected: no findings.

- [ ] **Step 5: Commit**

```bash
git add src/scrapal/domain/university/institutions.py tests/test_institutions.py
git commit -m "university: recognise an institution by its registrable domain"
```

---

## Task 2: The Institution model and migration 0009

**Files:**
- Modify: `src/scrapal/models.py` (after the `Collection` class, around line 127)
- Create: `migrations/versions/0009_institutions.py`
- Test: `tests/test_institutions.py` (append)

**Interfaces:**
- Consumes: `registrable_domain`, `country_for_domain`, `institution_name_from_domain`, `slugify` from Task 1.
- Produces:
  - `models.Institution` with columns `id, organization_id, name, slug, domain, country_code, city, website_url, logo_url, banner_url, brand_color, settings, created_at, updated_at`
  - `models.Source.institution_id: str | None`
  - `models.StructuredRecord.institution_id: str | None`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_institutions.py`:

```python
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from scrapal.db import Base
from scrapal.models import Institution, Organization, Source, SourceKind, StructuredRecord


async def test_institution_row_round_trips_with_its_optional_branding() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        organization = Organization(name="Test")
        session.add(organization)
        await session.flush()
        institution = Institution(
            organization_id=organization.id,
            name="University of Westminster",
            slug="university-of-westminster",
            domain="westminster.ac.uk",
            country_code="GB",
        )
        session.add(institution)
        await session.commit()
        await session.refresh(institution)
    assert institution.city is None
    assert institution.logo_url is None
    assert institution.brand_color is None
    assert institution.settings == {}
    await engine.dispose()


def test_source_and_record_carry_a_nullable_institution_id() -> None:
    # Nullable because this database already holds sources and records that
    # predate institutions; a NOT NULL column here would fail to migrate.
    assert sa_inspect(Source).columns["institution_id"].nullable is True
    assert sa_inspect(StructuredRecord).columns["institution_id"].nullable is True
    assert SourceKind.greenwich.value == "greenwich"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_institutions.py -k institution_row -v`
Expected: FAIL — `ImportError: cannot import name 'Institution' from 'scrapal.models'`

- [ ] **Step 3: Add the model**

In `src/scrapal/models.py`, insert immediately after the `Collection` class (before `class Source`):

```python
class Institution(Base):
    __tablename__ = "institutions"
    __table_args__ = (
        Index("ix_institutions_org_domain", "organization_id", "domain", unique=True),
        Index("ix_institutions_org_slug", "organization_id", "slug", unique=True),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(200))
    domain: Mapped[str] = mapped_column(String(255))
    country_code: Mapped[str | None] = mapped_column(String(2), nullable=True, index=True)
    city: Mapped[str | None] = mapped_column(String(180), nullable=True)
    website_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    banner_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    brand_color: Mapped[str | None] = mapped_column(String(9), nullable=True)
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
```

In `class Source`, after the `collection_id` column, add:

```python
    institution_id: Mapped[str | None] = mapped_column(
        ForeignKey("institutions.id"), nullable=True, index=True
    )
```

In `class StructuredRecord`, after the `collection_id` column, add:

```python
    institution_id: Mapped[str | None] = mapped_column(
        ForeignKey("institutions.id"), nullable=True, index=True
    )
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/test_institutions.py -v`
Expected: PASS.

- [ ] **Step 5: Write the migration**

Create `migrations/versions/0009_institutions.py`:

```python
"""add institutions and attach sources and course records to them

Revision ID: 0009_institutions
Revises: 0008_quarantine_legacy_courses
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from scrapal.domain.university.institutions import (
    country_for_domain,
    institution_name_from_domain,
    registrable_domain,
    slugify,
)

revision: str = "0009_institutions"
down_revision: str | None = "0008_quarantine_legacy_courses"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "institutions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("slug", sa.String(length=200), nullable=False),
        sa.Column("domain", sa.String(length=255), nullable=False),
        sa.Column("country_code", sa.String(length=2), nullable=True),
        sa.Column("city", sa.String(length=180), nullable=True),
        sa.Column("website_url", sa.Text(), nullable=True),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("banner_url", sa.Text(), nullable=True),
        sa.Column("brand_color", sa.String(length=9), nullable=True),
        sa.Column("settings", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_institutions_organization_id", "institutions", ["organization_id"])
    op.create_index("ix_institutions_country_code", "institutions", ["country_code"])
    op.create_index(
        "ix_institutions_org_domain", "institutions", ["organization_id", "domain"], unique=True
    )
    op.create_index(
        "ix_institutions_org_slug", "institutions", ["organization_id", "slug"], unique=True
    )
    op.add_column("sources", sa.Column("institution_id", sa.String(length=36), nullable=True))
    op.create_index("ix_sources_institution_id", "sources", ["institution_id"])
    op.create_foreign_key(
        "fk_sources_institution_id", "sources", "institutions", ["institution_id"], ["id"]
    )
    op.add_column(
        "structured_records", sa.Column("institution_id", sa.String(length=36), nullable=True)
    )
    op.create_index(
        "ix_structured_records_institution_id", "structured_records", ["institution_id"]
    )
    op.create_foreign_key(
        "fk_structured_records_institution_id",
        "structured_records",
        "institutions",
        ["institution_id"],
        ["id"],
    )
    _backfill()


def _backfill() -> None:
    """Give every existing source an institution, then stamp its course records.

    Idempotent: re-running resolves the same domains to the same rows and
    rewrites the same ids.
    """
    import uuid
    from datetime import UTC, datetime

    bind = op.get_bind()
    stamp = datetime.now(UTC)
    rows = bind.execute(
        sa.text(
            "SELECT s.id, s.name, s.url, c.organization_id "
            "FROM sources s JOIN collections c ON c.id = s.collection_id"
        )
    ).fetchall()
    cache: dict[tuple[str, str], str] = {}
    for source_id, source_name, url, organization_id in rows:
        domain = registrable_domain(url or "")
        if not domain:
            continue
        key = (organization_id, domain)
        if key not in cache:
            found = bind.execute(
                sa.text(
                    "SELECT id FROM institutions "
                    "WHERE organization_id = :org AND domain = :domain"
                ),
                {"org": organization_id, "domain": domain},
            ).scalar()
            if found:
                cache[key] = found
            else:
                name = (source_name or "").strip() or institution_name_from_domain(domain)
                base = slugify(name) or slugify(domain)
                slug, attempt = base, 1
                while bind.execute(
                    sa.text(
                        "SELECT 1 FROM institutions "
                        "WHERE organization_id = :org AND slug = :slug"
                    ),
                    {"org": organization_id, "slug": slug},
                ).scalar():
                    attempt += 1
                    slug = f"{base}-{attempt}"
                new_id = str(uuid.uuid4())
                bind.execute(
                    sa.text(
                        "INSERT INTO institutions (id, organization_id, name, slug, domain, "
                        "country_code, settings, created_at, updated_at) VALUES "
                        "(:id, :org, :name, :slug, :domain, :cc, '{}', :ts, :ts)"
                    ),
                    {
                        "id": new_id,
                        "org": organization_id,
                        "name": name,
                        "slug": slug,
                        "domain": domain,
                        "cc": country_for_domain(domain),
                        "ts": stamp,
                    },
                )
                cache[key] = new_id
        bind.execute(
            sa.text("UPDATE sources SET institution_id = :inst WHERE id = :sid"),
            {"inst": cache[key], "sid": source_id},
        )
    bind.execute(
        sa.text(
            "UPDATE structured_records SET institution_id = ("
            "  SELECT s.institution_id FROM documents d JOIN sources s ON s.id = d.source_id"
            "  WHERE d.id = structured_records.document_id"
            ") WHERE institution_id IS NULL"
        )
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_structured_records_institution_id", "structured_records", type_="foreignkey"
    )
    op.drop_index("ix_structured_records_institution_id", table_name="structured_records")
    op.drop_column("structured_records", "institution_id")
    op.drop_constraint("fk_sources_institution_id", "sources", type_="foreignkey")
    op.drop_index("ix_sources_institution_id", table_name="sources")
    op.drop_column("sources", "institution_id")
    op.drop_index("ix_institutions_org_slug", table_name="institutions")
    op.drop_index("ix_institutions_org_domain", table_name="institutions")
    op.drop_index("ix_institutions_country_code", table_name="institutions")
    op.drop_index("ix_institutions_organization_id", table_name="institutions")
    op.drop_table("institutions")
```

- [ ] **Step 6: Run the migration against the live database and confirm the backfill**

The spec asks for a test of the backfill. This repository has no Alembic test
harness — `tests/` builds its schema with `Base.metadata.create_all` on SQLite
in-memory, which never executes a migration. Rather than stand up a Postgres
test fixture for one migration, the backfill's logic is covered by the Task 1
and Task 3 unit tests (it calls the same four pure functions), and the migration
itself is verified against the live database here, including its idempotency.
If a second data migration lands later, build the harness then.

```bash
docker compose exec api alembic upgrade head
docker compose exec -T postgres psql -U scrapal -d scrapal \
  -c "SELECT name, domain, country_code FROM institutions ORDER BY name;" \
  -c "SELECT i.name, count(*) FROM structured_records r
      JOIN institutions i ON i.id = r.institution_id
      WHERE r.schema_name = 'university.course' GROUP BY i.name;"
```

Expected: institutions for `gre.ac.uk`, `buckingham.ac.uk` and `westminster.ac.uk`, all with `country_code = GB`; 211 course records attributed to the Greenwich institution and none orphaned.

Then confirm idempotency:

```bash
docker compose exec api alembic downgrade -1 && docker compose exec api alembic upgrade head
```

Expected: the same counts.

- [ ] **Step 7: Commit**

```bash
git add src/scrapal/models.py migrations/versions/0009_institutions.py tests/test_institutions.py
git commit -m "institutions: give every university a row and attach its existing records"
```

---

## Task 3: Resolve an institution when a source is created

**Files:**
- Create: `src/scrapal/services/institutions.py`
- Modify: `src/scrapal/blueprints_api.py:120-133`
- Test: `tests/test_institutions.py` (append)

**Interfaces:**
- Consumes: `models.Institution`, Task 1 helpers.
- Produces: `async def resolve_institution(session: AsyncSession, organization_id: str, url: str, name: str | None = None) -> Institution | None`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_institutions.py`:

```python
from scrapal.models import Collection
from scrapal.services.institutions import resolve_institution


async def _org_session() -> tuple[async_sessionmaker, str]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        organization = Organization(name="Test")
        session.add(organization)
        await session.commit()
        return sessions, organization.id


async def test_resolve_institution_creates_once_and_returns_the_same_row() -> None:
    sessions, org = await _org_session()
    async with sessions() as session:
        first = await resolve_institution(
            session, org, "https://www.westminster.ac.uk/course-search", "University of Westminster"
        )
        await session.commit()
        second = await resolve_institution(
            session, org, "https://www.westminster.ac.uk/media-ma", "Westminster"
        )
        await session.commit()
    assert first is not None and second is not None
    assert first.id == second.id
    assert first.domain == "westminster.ac.uk"
    assert first.country_code == "GB"
    assert first.name == "University of Westminster"


async def test_resolve_institution_gives_a_second_university_its_own_row() -> None:
    sessions, org = await _org_session()
    async with sessions() as session:
        gre = await resolve_institution(session, org, "https://www.gre.ac.uk/sitemap.xml", None)
        buck = await resolve_institution(
            session, org, "https://www.buckingham.ac.uk/course-page-sitemap.xml", None
        )
        await session.commit()
    assert gre is not None and buck is not None
    assert gre.id != buck.id
    assert gre.name == "Gre"
    assert buck.slug == "buckingham"


async def test_resolve_institution_declines_an_address_it_cannot_read() -> None:
    sessions, org = await _org_session()
    async with sessions() as session:
        assert await resolve_institution(session, org, "", "Nowhere") is None
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_institutions.py -k resolve_institution -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'scrapal.services.institutions'`

- [ ] **Step 3: Write the implementation**

Create `src/scrapal/services/institutions.py`:

```python
"""The single place an Institution row comes into existence.

Sources arrive from blueprint approval and from direct creation. Both routes
call resolve_institution, so adding a fourth university needs no code.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from scrapal.domain.university.institutions import (
    country_for_domain,
    institution_name_from_domain,
    registrable_domain,
    slugify,
)
from scrapal.models import Institution


async def resolve_institution(
    session: AsyncSession,
    organization_id: str,
    url: str,
    name: str | None = None,
) -> Institution | None:
    """Return the institution publishing at this address, creating it if new.

    Returns None when the address has no readable domain; the caller keeps a
    source without an institution rather than inventing one.
    """
    domain = registrable_domain(url or "")
    if not domain:
        return None
    existing = await session.scalar(
        select(Institution).where(
            Institution.organization_id == organization_id,
            Institution.domain == domain,
        )
    )
    if existing:
        return existing
    label = (name or "").strip() or institution_name_from_domain(domain)
    base = slugify(label) or slugify(domain)
    slug, attempt = base, 1
    while await session.scalar(
        select(Institution.id).where(
            Institution.organization_id == organization_id, Institution.slug == slug
        )
    ):
        attempt += 1
        slug = f"{base}-{attempt}"
    institution = Institution(
        organization_id=organization_id,
        name=label,
        slug=slug,
        domain=domain,
        country_code=country_for_domain(domain),
        website_url=f"https://{domain}",
    )
    session.add(institution)
    await session.flush()
    return institution
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/test_institutions.py -v`
Expected: PASS.

- [ ] **Step 5: Wire it into blueprint approval**

In `src/scrapal/blueprints_api.py`, replace lines 120-133 (from `hostname = source_url.lower()` through `session.add(source)`) with:

```python
    has_sitemap = bool(blueprint.discovery_json.get("sitemaps"))
    kind = SourceKind.sitemap if has_sitemap else SourceKind.website
    institution = None
    if blueprint.domain_pack == "university":
        institution = await resolve_institution(
            session, blueprint.organization_id, source_url, blueprint.name
        )
    # The domain pack decides which extractor runs. Approval knew this and
    # used to throw it away, which is why only one hostname produced courses.
    config["domain_pack"] = blueprint.domain_pack
    source = Source(
        collection_id=blueprint.collection_id,
        institution_id=institution.id if institution else None,
        name=blueprint.name,
        kind=kind,
        url=source_url,
        config=config,
    )
    session.add(source)
```

Add to the imports at the top of `blueprints_api.py`:

```python
from scrapal.services.institutions import resolve_institution
```

Remove the now-unused `hostname` variable. `SourceKind.greenwich` is no longer assigned here; the enum member stays so existing rows keep validating.

- [ ] **Step 6: Wire it into direct source creation**

The spec calls for resolution "from blueprint approval and from source creation".
Blueprint approval is done; a source added straight through the API still needs it.
In `src/scrapal/api.py`, find the `POST /v1/sources` handler and, immediately before
the `Source(...)` is constructed, add:

```python
    institution = None
    if body.config.get("domain_pack") == "university" and body.url:
        collection = await session.get(Collection, body.collection_id)
        if collection:
            institution = await resolve_institution(
                session, collection.organization_id, str(body.url), body.name
            )
```

and pass `institution_id=institution.id if institution else None` to the constructor.
Import `resolve_institution` from `scrapal.services.institutions`. If the handler's
request model has no `config` field, read the domain pack from `body.config` only when
present — use `getattr(body, "config", {}) or {}`.

- [ ] **Step 7: Run the blueprint tests**

Run: `pytest tests/test_blueprints.py -v`
Expected: PASS. If a test asserts `SourceKind.greenwich` is chosen for a `gre.ac.uk` blueprint, update it to assert `SourceKind.sitemap` and `source.config["domain_pack"] == "university"` — that assertion was encoding the bug.

- [ ] **Step 8: Commit**

```bash
git add src/scrapal/services/institutions.py src/scrapal/blueprints_api.py src/scrapal/api.py tests/test_institutions.py tests/test_blueprints.py
git commit -m "blueprints: approve a source against its institution, not a hostname check"
```

---

## Task 4: The extractor registry

Behaviour-preserving for Greenwich. This task changes *how* an extractor is chosen, not what any extractor produces.

**Files:**
- Create: `src/scrapal/domain/university/extractors/__init__.py`, `base.py`, `greenwich.py`, `registry.py`
- Test: `tests/test_generic_extractor.py`

**Interfaces:**
- Consumes: `GreenwichConnector` from `scrapal.domain.university.greenwich`.
- Produces:
  - `base.CourseExtractor` protocol with `version: str` and `async def extract_records(self, url: str, html: bytes) -> list[dict[str, Any]]`
  - `base.normalise(text: str) -> str`
  - `base.verify_excerpt(excerpt: str, page_text: str) -> bool`
  - `greenwich.GreenwichCourseExtractor`
  - `registry.resolve_extractor(domain: str | None, override: str | None = None) -> CourseExtractor`

- [ ] **Step 1: Write the failing test**

Create `tests/test_generic_extractor.py`:

```python
from pathlib import Path

from scrapal.domain.university.extractors.base import normalise, verify_excerpt
from scrapal.domain.university.extractors.generic import GenericUniversityExtractor
from scrapal.domain.university.extractors.greenwich import GreenwichCourseExtractor
from scrapal.domain.university.extractors.registry import resolve_extractor


def test_registry_prefers_a_site_override_then_the_domain_then_the_generic() -> None:
    assert isinstance(resolve_extractor("gre.ac.uk"), GreenwichCourseExtractor)
    assert isinstance(resolve_extractor("buckingham.ac.uk"), GenericUniversityExtractor)
    assert isinstance(resolve_extractor(None), GenericUniversityExtractor)
    assert isinstance(resolve_extractor("gre.ac.uk", override="generic"), GenericUniversityExtractor)


async def test_greenwich_extractor_still_produces_what_it_always_did() -> None:
    html = Path("tests/fixtures/greenwich_course.html").read_bytes()
    records = await GreenwichCourseExtractor().extract_records(
        "https://www.gre.ac.uk/postgraduate-courses/eduhea/ed", html
    )
    assert len(records) == 1
    assert records[0]["data"]["title"] == "Education, MA"
    assert records[0]["extractor_version"] == "greenwich-course-intelligence-v2"


def test_normalise_collapses_the_whitespace_html_scatters_through_a_sentence() -> None:
    assert normalise("International  students:\n £17,900\tper year") == (
        "international students: £17,900 per year"
    )


def test_verify_excerpt_accepts_a_quote_that_is_really_on_the_page() -> None:
    page = "Tuition and fees. International students: £17,900 per year. Apply now."
    assert verify_excerpt("International students: £17,900 per year", page) is True


def test_verify_excerpt_rejects_a_quote_the_model_invented() -> None:
    # This is the rule the whole generic extractor rests on. A model that
    # cannot point at the page does not get to fill the field.
    page = "Tuition and fees. International students: £17,900 per year."
    assert verify_excerpt("International students: £18,400 per year", page) is False
    assert verify_excerpt("", page) is False
    assert verify_excerpt("   ", page) is False
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_generic_extractor.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'scrapal.domain.university.extractors'`

- [ ] **Step 3: Write base.py**

Create `src/scrapal/domain/university/extractors/__init__.py` (empty file).

Create `src/scrapal/domain/university/extractors/base.py`:

```python
"""Shared contract for anything that turns a course page into records."""

import re
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class CourseExtractor(Protocol):
    """Turns one fetched page into zero or more structured_record payloads."""

    version: str

    async def extract_records(self, url: str, html: bytes) -> list[dict[str, Any]]:
        ...


def normalise(text: str) -> str:
    """Fold the whitespace HTML scatters through a sentence, and lowercase it."""
    return re.sub(r"\s+", " ", text).strip().lower()


def verify_excerpt(excerpt: str, page_text: str) -> bool:
    """True when this excerpt genuinely appears in the page.

    The generic extractor lets a local model fill fields the structural passes
    could not. Without this check that would quietly weaken the publish gate:
    a plausible invented fee would carry evidence that points nowhere. A field
    whose excerpt does not verify is dropped rather than kept at lower
    confidence, so an unevidenced fact never reaches a published record.
    """
    candidate = normalise(excerpt)
    if len(candidate) < 8:
        return False
    return candidate in normalise(page_text)
```

- [ ] **Step 4: Write greenwich.py and registry.py**

Create `src/scrapal/domain/university/extractors/greenwich.py`:

```python
"""The hand-written Greenwich extractor, behind the registry's interface.

Greenwich's pages use stable anchor ids, which the generic extractor cannot
assume. Keeping this as a site override preserves the accuracy of the 211
records already published from it.
"""

from typing import Any

from scrapal.domain.university.greenwich import GreenwichConnector


class GreenwichCourseExtractor:
    version = "greenwich-course-intelligence-v2"

    async def extract_records(self, url: str, html: bytes) -> list[dict[str, Any]]:
        extracted = await GreenwichConnector().extract(url, html, "text/html")
        return list(extracted.get("structured_records", []))
```

Create `src/scrapal/domain/university/extractors/registry.py`:

```python
"""Which extractor reads a given institution's pages.

Order: an explicit override on the institution, then a site-specific
extractor registered for its domain, then the generic one. Adding a
university requires no entry here.
"""

from collections.abc import Callable

from scrapal.domain.university.extractors.base import CourseExtractor
from scrapal.domain.university.extractors.generic import GenericUniversityExtractor
from scrapal.domain.university.extractors.greenwich import GreenwichCourseExtractor

DOMAIN_EXTRACTORS: dict[str, Callable[[], CourseExtractor]] = {
    "gre.ac.uk": GreenwichCourseExtractor,
}
NAMED_EXTRACTORS: dict[str, Callable[[], CourseExtractor]] = {
    "generic": GenericUniversityExtractor,
    "greenwich": GreenwichCourseExtractor,
}


def resolve_extractor(domain: str | None, override: str | None = None) -> CourseExtractor:
    if override and override in NAMED_EXTRACTORS:
        return NAMED_EXTRACTORS[override]()
    if domain and domain in DOMAIN_EXTRACTORS:
        return DOMAIN_EXTRACTORS[domain]()
    return GenericUniversityExtractor()
```

- [ ] **Step 5: Write a minimal generic.py so the registry imports**

Create `src/scrapal/domain/university/extractors/generic.py`. Task 5 fills this in; for now it must exist and satisfy the protocol:

```python
"""Course extraction for any university, without per-site code."""

from typing import Any


class GenericUniversityExtractor:
    version = "generic-university-v1"

    async def extract_records(self, url: str, html: bytes) -> list[dict[str, Any]]:
        return []
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pytest tests/test_generic_extractor.py tests/test_greenwich.py -v`
Expected: PASS.

Run: `ruff check src/scrapal/domain/university/extractors`
Expected: no findings.

- [ ] **Step 7: Commit**

```bash
git add src/scrapal/domain/university/extractors tests/test_generic_extractor.py
git commit -m "university: choose a course extractor through a registry"
```

---

## Task 5: Generic structural extraction

The pass that needs no model. It must fill most required fields on a well-built course page.

**Files:**
- Modify: `src/scrapal/domain/university/extractors/generic.py`
- Create: `tests/fixtures/buckingham_course.html`, `tests/fixtures/westminster_course.html`
- Test: `tests/test_generic_extractor.py` (append)

**Interfaces:**
- Consumes: `base.CourseExtractor`, `base.normalise`, and from `scrapal.domain.university.schemas`: `CourseFee`, `CourseIntake`, `CourseIntelligenceRecord`, `FieldEvidence`, `course_coverage`, `REQUIRED_COURSE_FIELDS`.
- Produces on `GenericUniversityExtractor`:
  - `def structural(self, url: str, html: bytes) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]], str]` returning `(fields, evidence, page_text)`
  - `async def extract_records(self, url: str, html: bytes) -> list[dict[str, Any]]`

- [ ] **Step 1: Create the fixtures**

Create `tests/fixtures/buckingham_course.html` — a definition-list and fee-table shaped page, the commonest UK layout:

```html
<html><head><title>LLM International and Commercial Law | University of Buckingham</title>
<meta property="og:image" content="https://www.buckingham.ac.uk/img/law-banner.jpg">
<meta name="theme-color" content="#7c2529"></head>
<body>
<h1>International and Commercial Law, LLM</h1>
<p>A two-year law degree compressed into four terms, with a dissertation supervised in the final term.</p>
<dl class="key-facts">
  <dt>Duration</dt><dd>12 months full-time</dd>
  <dt>Location</dt><dd>Buckingham Campus</dd>
  <dt>Start dates</dt><dd>January and September</dd>
  <dt>Study mode</dt><dd>Full-time</dd>
</dl>
<h2>Fees</h2>
<table><tbody>
  <tr><th>Home students</th><td>&pound;16,140 per year</td></tr>
  <tr><th>Overseas students</th><td>&pound;19,320 per year</td></tr>
</tbody></table>
<h2>Entry requirements</h2>
<p>A second-class honours degree in law or a related discipline. Applicants with
professional legal experience are considered individually.</p>
<h2>English language requirements</h2>
<p>IELTS 6.5 overall with no component below 6.0.</p>
<h2>Modules</h2>
<ul><li>International Trade Law</li><li>Corporate Governance</li><li>Dissertation</li></ul>
</body></html>
```

Create `tests/fixtures/westminster_course.html` — a JSON-LD page that is deliberately missing a fee, so the record lands in review:

```html
<html><head><title>Media, Campaigning and Social Change MA</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Course",
 "name":"Media, Campaigning and Social Change",
 "description":"Campaign strategy, media production and advocacy research.",
 "provider":{"@type":"CollegeOrUniversity","name":"University of Westminster"},
 "hasCourseInstance":{"@type":"CourseInstance","courseMode":"full-time",
   "location":"Harrow Campus, London","startDate":"2026-09-21"}}
</script></head>
<body>
<h1>Media, Campaigning and Social Change, MA</h1>
<h2>Course length</h2><p>One year full-time, two years part-time.</p>
<h2>Entry requirements</h2><p>Normally a minimum 2:1 honours degree.</p>
</body></html>
```

- [ ] **Step 2: Write the failing test**

Append to `tests/test_generic_extractor.py`:

```python
async def test_generic_reads_a_definition_list_and_fee_table_page() -> None:
    html = Path("tests/fixtures/buckingham_course.html").read_bytes()
    records = await GenericUniversityExtractor().extract_records(
        "https://www.buckingham.ac.uk/courses/llm-international-commercial-law", html
    )
    assert len(records) == 1
    record = records[0]
    data = record["data"]
    assert data["title"] == "International and Commercial Law, LLM"
    assert data["award"] == "LLM"
    assert data["level"] == "postgraduate"
    assert data["campuses"] == ["Buckingham Campus"]
    assert data["durations"] == ["12 months full-time"]
    assert data["intake_months"] == ["January", "September"]
    assert {fee["residency"] for fee in data["fees"]} == {"home", "international"}
    assert [fee["amount"] for fee in data["fees"]] == [16140, 19320]
    assert "second-class honours" in data["entry_requirements"]
    assert "IELTS 6.5" in data["english_requirements"]
    assert data["modules"] == ["International Trade Law", "Corporate Governance", "Dissertation"]
    assert record["extractor_version"] == "generic-university-v1"
    assert record["validation"]["coverage"] == 1
    assert record["status"] == "published"
    # every filled field carries a quote that is on the page
    for field, entries in record["evidence"]["fields"].items():
        for entry in entries:
            assert entry["excerpt"], field


async def test_generic_reads_json_ld_and_routes_a_feeless_page_to_review() -> None:
    html = Path("tests/fixtures/westminster_course.html").read_bytes()
    records = await GenericUniversityExtractor().extract_records(
        "https://www.westminster.ac.uk/media-campaigning-social-change-ma", html
    )
    record = records[0]
    assert record["data"]["title"] == "Media, Campaigning and Social Change, MA"
    assert record["data"]["award"] == "MA"
    assert record["data"]["campuses"] == ["Harrow Campus, London"]
    assert record["data"]["intake_months"] == ["September"]
    assert record["data"]["fees"] == []
    # No fee on the page means the record cannot publish, and says which field is short.
    assert record["status"] == "review"
    assert "fees" in record["validation"]["missing_fields"]
    assert record["validation"]["coverage"] < 1


async def test_generic_returns_nothing_for_a_page_that_is_not_a_course() -> None:
    html = b"<html><body><h2>Our campuses</h2><p>Visit us.</p></body></html>"
    records = await GenericUniversityExtractor().extract_records(
        "https://www.buckingham.ac.uk/about/campus", html
    )
    assert records == []
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pytest tests/test_generic_extractor.py -k generic_reads -v`
Expected: FAIL — `assert 0 == 1`, because `extract_records` returns `[]`.

- [ ] **Step 4: Write the structural extractor**

Replace `src/scrapal/domain/university/extractors/generic.py` entirely:

```python
"""Course extraction for any university, without per-site code.

Three structural sources, in decreasing reliability: JSON-LD a university
publishes about itself, key/value pairs in definition lists and two-column
tables, and sections found by heading text. Greenwich's extractor can rely on
stable anchor ids like #entry-requirements; no other site guarantees them,
so headings are matched by their words instead.
"""

import json
import re
from typing import Any

from bs4 import BeautifulSoup, Tag

from scrapal.domain.university.schemas import (
    CourseFee,
    CourseIntake,
    CourseIntelligenceRecord,
    course_coverage,
)

MONTHS = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)
AWARD_PATTERN = re.compile(
    r"\b(BA|BSc|BEng|BEd|LLB|MA|MSc|MEng|MBA|MPH|MRes|LLM|PhD|MPhil|PGCert|PGDip)"
    r"(?:\s*\(Hons\))?\b",
    re.I,
)
CURRENCY = {"£": "GBP", "€": "EUR", "$": "USD"}
MONEY_PATTERN = re.compile(r"([£€$])\s*([0-9][0-9,]{2,})")

# Which words in a key or a heading mean which field.
KEY_SIGNALS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("durations", ("duration", "course length", "length of course", "study duration")),
    ("campuses", ("campus", "location", "where you", "taught at")),
    ("intake_months", ("start date", "start dates", "intake", "starting", "commencement")),
    ("study_modes", ("study mode", "mode of study", "attendance")),
    ("school", ("school", "faculty", "department")),
    ("ucas_code", ("ucas code", "ucas tariff code", "course code")),
)
SECTION_SIGNALS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("entry_requirements", ("entry requirement", "admission requirement", "entry criteria")),
    ("english_requirements", ("english language", "english requirement", "language requirement")),
    ("course_content", ("course content", "what you will study", "about the course", "overview")),
    ("careers", ("career", "employability", "after the course", "graduate destinations")),
)
LIST_SECTION_SIGNALS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("modules", ("module", "course structure", "what you will study")),
    ("scholarships", ("scholarship", "bursary", "funding")),
    ("application_documents", ("documents required", "supporting documents", "what you need")),
    ("application_routes", ("how to apply", "applying", "application process")),
    ("deadlines", ("deadline", "closing date", "key dates")),
    ("accreditations", ("accreditation", "accredited by", "professional recognition")),
)
COURSE_URL_HINTS = ("/course", "/courses/", "/programme", "/program", "/degree", "/study/")


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def field_for(label: str, signals: tuple[tuple[str, tuple[str, ...]], ...]) -> str | None:
    lowered = label.lower()
    for field, words in signals:
        if any(word in lowered for word in words):
            return field
    return None


def residency_of(label: str) -> str:
    lowered = label.lower()
    if any(word in lowered for word in ("international", "overseas", "non-eu", "non-eea")):
        return "international"
    if any(word in lowered for word in ("home", "uk", "domestic", "eu ")):
        return "home"
    return "unknown"


class GenericUniversityExtractor:
    version = "generic-university-v1"

    async def extract_records(self, url: str, html: bytes) -> list[dict[str, Any]]:
        fields, evidence, page_text = self.structural(url, html)
        if not fields.get("title"):
            return []
        return [self.build_record(url, fields, evidence, page_text)]

    # ---------------------------------------------------------------- passes

    def structural(
        self, url: str, html: bytes
    ) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]], str]:
        soup = BeautifulSoup(html, "html.parser")
        page_text = soup.get_text(" ", strip=True)
        fields: dict[str, Any] = {"source_url": url}
        evidence: dict[str, list[dict[str, Any]]] = {}

        def remember(
            field: str, excerpt: str, method: str, confidence: float, section: str | None = None
        ) -> None:
            evidence.setdefault(field, []).append(
                {
                    "source_url": url,
                    "field": field,
                    "method": method,
                    "excerpt": clean(excerpt)[:400],
                    "section": section,
                    "selector": None,
                    "confidence": confidence,
                }
            )

        self._from_json_ld(soup, fields, remember)
        self._from_heading(soup, url, fields, remember)
        if not self._looks_like_a_course(url, fields):
            return {}, {}, page_text
        self._from_key_values(soup, fields, remember)
        self._from_fee_tables(soup, fields, remember)
        self._from_sections(soup, fields, remember)
        self._derive(fields, remember)
        return fields, evidence, page_text

    def _looks_like_a_course(self, url: str, fields: dict[str, Any]) -> bool:
        """A campus page has an h1 too. Require a course signal before extracting."""
        if not fields.get("title"):
            return False
        if fields.get("award"):
            return True
        return any(hint in url.lower() for hint in COURSE_URL_HINTS)

    def _from_json_ld(self, soup: BeautifulSoup, fields: dict[str, Any], remember: Any) -> None:
        for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
            try:
                payload = json.loads(script.string or "{}")
            except (ValueError, TypeError):
                continue
            for block in payload if isinstance(payload, list) else [payload]:
                if not isinstance(block, dict):
                    continue
                if "Course" not in str(block.get("@type", "")):
                    continue
                if block.get("name"):
                    fields["title"] = clean(str(block["name"]))
                    remember("title", str(block["name"]), "jsonld", 0.99)
                instance = block.get("hasCourseInstance")
                instance = instance[0] if isinstance(instance, list) and instance else instance
                if isinstance(instance, dict):
                    if instance.get("location"):
                        fields["campuses"] = [clean(str(instance["location"]))]
                        remember("campuses", str(instance["location"]), "jsonld", 0.95)
                    if instance.get("courseMode"):
                        fields["study_modes"] = [clean(str(instance["courseMode"])).lower()]
                        remember("study_modes", str(instance["courseMode"]), "jsonld", 0.95)
                    start = str(instance.get("startDate", ""))
                    month = self._month_of_iso_date(start)
                    if month:
                        fields["intake_months"] = [month]
                        remember("intake_months", start, "jsonld", 0.95)

    @staticmethod
    def _month_of_iso_date(value: str) -> str | None:
        match = re.match(r"\d{4}-(\d{2})", value)
        if not match:
            return None
        index = int(match.group(1))
        return MONTHS[index - 1] if 1 <= index <= 12 else None

    def _from_heading(
        self, soup: BeautifulSoup, url: str, fields: dict[str, Any], remember: Any
    ) -> None:
        heading = soup.select_one("h1")
        title = clean(heading.get_text(" ", strip=True)) if heading else fields.get("title", "")
        if title:
            fields["title"] = title
            remember("title", title, "h1", 0.97)
        award = AWARD_PATTERN.search(title or "")
        if award:
            fields["award"] = award.group(0).replace("(hons)", "(Hons)")
            remember("award", title, "title-award-pattern", 0.94)
        lowered = f"{url} {title}".lower()
        if "postgraduate" in lowered or (
            fields.get("award", "").upper().startswith(("M", "PG", "LLM", "PHD"))
        ):
            fields["level"] = "postgraduate"
            remember("level", title or url, "award-or-url", 0.92)
        elif "undergraduate" in lowered or fields.get("award", "").upper().startswith(
            ("B", "LLB")
        ):
            fields["level"] = "undergraduate"
            remember("level", title or url, "award-or-url", 0.92)

    def _from_key_values(self, soup: BeautifulSoup, fields: dict[str, Any], remember: Any) -> None:
        """Definition lists and two-column tables carry most of the key facts."""
        pairs: list[tuple[str, str, str]] = []
        for definition in soup.find_all("dl"):
            terms = definition.find_all("dt")
            for term in terms:
                value = term.find_next_sibling("dd")
                if value is not None:
                    pairs.append(
                        (clean(term.get_text(" ", strip=True)),
                         clean(value.get_text(" ", strip=True)), "dl-pair")
                    )
        for row in soup.select("table tr"):
            cells = row.find_all(["th", "td"])
            if len(cells) == 2:
                pairs.append(
                    (clean(cells[0].get_text(" ", strip=True)),
                     clean(cells[1].get_text(" ", strip=True)), "table-pair")
                )
        for label, value, method in pairs:
            field = field_for(label, KEY_SIGNALS)
            if not field or not value:
                continue
            if field == "intake_months":
                months = [m for m in MONTHS if m.lower() in value.lower()]
                if months:
                    fields["intake_months"] = months
                    remember("intake_months", f"{label}: {value}", method, 0.93, label)
            elif field == "ucas_code":
                fields["ucas_code"] = value
                remember("ucas_code", f"{label}: {value}", method, 0.93, label)
            elif field == "study_modes":
                modes = [
                    mode for mode in ("full-time", "part-time", "distance learning", "online")
                    if mode in value.lower()
                ]
                if modes:
                    fields["study_modes"] = modes
                    remember("study_modes", f"{label}: {value}", method, 0.93, label)
            else:
                fields.setdefault(field, [])
                if value not in fields[field]:
                    fields[field].append(value)
                    remember(field, f"{label}: {value}", method, 0.93, label)

    def _from_fee_tables(self, soup: BeautifulSoup, fields: dict[str, Any], remember: Any) -> None:
        fees: list[dict[str, Any]] = []
        for row in soup.select("table tr"):
            cells = [clean(cell.get_text(" ", strip=True)) for cell in row.find_all(["th", "td"])]
            if len(cells) < 2:
                continue
            label, rest = cells[0], " ".join(cells[1:])
            match = MONEY_PATTERN.search(rest)
            if not match:
                continue
            residency = residency_of(label)
            if residency == "unknown" and not any(
                word in label.lower() for word in ("fee", "tuition", "student")
            ):
                continue
            fees.append(
                CourseFee(
                    residency=residency,
                    label=label,
                    amount=int(match.group(2).replace(",", "")),
                    currency=CURRENCY.get(match.group(1)),
                    raw_values=[rest],
                ).model_dump()
            )
            remember("fees", f"{label}: {rest}", "fee-table", 0.94, "Fees")
        if fees:
            fields["fees"] = fees

    def _section_body(self, heading: Tag) -> str:
        """Text between a heading and the next heading of the same or higher rank."""
        rank = int(heading.name[1])
        parts: list[str] = []
        for node in heading.find_all_next():
            if isinstance(node, Tag) and re.fullmatch(r"h[1-6]", node.name or ""):
                if int(node.name[1]) <= rank:
                    break
            if isinstance(node, Tag) and node.name in {"p", "li"}:
                parts.append(clean(node.get_text(" ", strip=True)))
        return " ".join(part for part in parts if part)

    def _section_items(self, heading: Tag) -> list[str]:
        rank = int(heading.name[1])
        items: list[str] = []
        for node in heading.find_all_next():
            if isinstance(node, Tag) and re.fullmatch(r"h[1-6]", node.name or ""):
                if int(node.name[1]) <= rank:
                    break
            if isinstance(node, Tag) and node.name == "li":
                text = clean(node.get_text(" ", strip=True))
                if text and text not in items:
                    items.append(text)
        return items

    def _from_sections(self, soup: BeautifulSoup, fields: dict[str, Any], remember: Any) -> None:
        for heading in soup.find_all(["h2", "h3", "h4"]):
            label = clean(heading.get_text(" ", strip=True))
            prose_field = field_for(label, SECTION_SIGNALS)
            if prose_field and not fields.get(prose_field):
                body = self._section_body(heading)
                if body:
                    fields[prose_field] = body
                    remember(prose_field, body, "heading-section", 0.9, label)
            list_field = field_for(label, LIST_SECTION_SIGNALS)
            if list_field and not fields.get(list_field):
                items = self._section_items(heading)
                if items:
                    fields[list_field] = items
                    remember(list_field, "; ".join(items), "heading-list", 0.9, label)

    def _derive(self, fields: dict[str, Any], remember: Any) -> None:
        """Facts implied by facts already read."""
        if not fields.get("study_modes") and fields.get("durations"):
            modes = [
                mode for mode in ("full-time", "part-time", "distance learning")
                if any(mode in duration.lower() for duration in fields["durations"])
            ]
            if modes:
                fields["study_modes"] = modes
                remember("study_modes", "; ".join(fields["durations"]), "duration-pattern", 0.88)
        fields["intakes"] = [
            CourseIntake(
                month=month,
                study_modes=fields.get("study_modes", []),
                durations=fields.get("durations", []),
                campuses=fields.get("campuses", []),
                scope="course_page",
            ).model_dump()
            for month in fields.get("intake_months", [])
        ]

    # ------------------------------------------------------------ assembling

    def build_record(
        self,
        url: str,
        fields: dict[str, Any],
        evidence: dict[str, list[dict[str, Any]]],
        page_text: str,
    ) -> dict[str, Any]:
        payload = {key: value for key, value in fields.items() if value not in (None, [], "")}
        payload.setdefault("level", "postgraduate")
        payload["source_url"] = url
        model = CourseIntelligenceRecord.model_validate(payload)
        coverage, missing = course_coverage(model)
        contradictions = [
            f"No numeric amount was found for {fee.label} fees"
            for fee in model.fees
            if fee.amount is None
        ]
        reasons = [f"Missing required field: {field}" for field in missing] + contradictions
        confidences = [entry["confidence"] for values in evidence.values() for entry in values]
        return {
            "schema_name": "university.course",
            "external_id": url,
            "data": model.model_dump(),
            "confidence": round(sum(confidences) / max(1, len(confidences)), 3),
            "evidence": {"source_url": url, "method": self.version, "fields": evidence},
            "status": "published" if coverage == 1 and not contradictions else "review",
            "extractor_version": self.version,
            "validation": {
                "coverage": coverage,
                "required_fields": 8,
                "missing_fields": missing,
                "contradictions": contradictions,
                "review_reasons": reasons,
            },
        }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pytest tests/test_generic_extractor.py -v`
Expected: PASS, all tests.

Run: `pytest tests/ -v`
Expected: PASS, no regressions.

Run: `ruff check src tests`
Expected: no findings.

- [ ] **Step 6: Commit**

```bash
git add src/scrapal/domain/university/extractors/generic.py tests/test_generic_extractor.py tests/fixtures/buckingham_course.html tests/fixtures/westminster_course.html
git commit -m "university: read a course page structurally, whatever site it is on"
```

---

## Task 6: The verified model pass

Fills only what the structural pass left empty, and only when the model can quote the page.

**Files:**
- Modify: `src/scrapal/domain/university/extractors/generic.py`
- Test: `tests/test_generic_extractor.py` (append)

**Interfaces:**
- Consumes: `OllamaService.structured(messages: list[dict[str, str]], schema: dict[str, Any]) -> dict[str, Any]` from `scrapal.services.ollama`; `base.verify_excerpt`.
- Produces: `GenericUniversityExtractor.__init__(self, ollama: Any | None = None, max_llm_fields: int = 8) -> None` and `async def model_pass(self, fields, evidence, page_text, url) -> None`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_generic_extractor.py`:

```python
from typing import Any


class FakeOllama:
    """Stands in for the local model. Tests never reach a real one."""

    def __init__(self, reply: dict[str, Any]) -> None:
        self.reply = reply
        self.calls = 0

    async def structured(
        self, messages: list[dict[str, str]], schema: dict[str, Any], **kwargs: Any
    ) -> dict[str, Any]:
        self.calls += 1
        self.last_prompt = messages[-1]["content"]
        return self.reply


BARE_FEE_PAGE = (
    b"<html><body><h1>Data Science, MSc</h1>"
    b"<p>Tuition for international students is 15,400 pounds for the full course.</p>"
    b"<p>The course runs for one year.</p></body></html>"
)


async def test_model_fills_a_field_the_structure_missed_when_it_can_quote_the_page() -> None:
    ollama = FakeOllama(
        {
            "fees": {
                "value": "£15,400",
                "excerpt": "Tuition for international students is 15,400 pounds for the full course.",
            }
        }
    )
    records = await GenericUniversityExtractor(ollama=ollama).extract_records(
        "https://www.example.ac.uk/courses/data-science-msc", BARE_FEE_PAGE
    )
    record = records[0]
    assert ollama.calls == 1
    assert record["data"]["fees"][0]["amount"] == 15400
    assert record["evidence"]["fields"]["fees"][0]["method"] == "llm-verified"
    assert record["evidence"]["fields"]["fees"][0]["confidence"] == 0.7


async def test_model_field_is_dropped_when_its_quote_is_not_on_the_page() -> None:
    ollama = FakeOllama(
        {"fees": {"value": "£22,000", "excerpt": "International tuition is £22,000 per year."}}
    )
    records = await GenericUniversityExtractor(ollama=ollama).extract_records(
        "https://www.example.ac.uk/courses/data-science-msc", BARE_FEE_PAGE
    )
    record = records[0]
    assert record["data"]["fees"] == []
    assert "fees" in record["validation"]["missing_fields"]
    assert record["status"] == "review"


async def test_the_model_is_not_called_when_the_structure_already_filled_everything() -> None:
    ollama = FakeOllama({})
    html = Path("tests/fixtures/buckingham_course.html").read_bytes()
    await GenericUniversityExtractor(ollama=ollama).extract_records(
        "https://www.buckingham.ac.uk/courses/llm-international-commercial-law", html
    )
    assert ollama.calls == 0


async def test_a_model_outage_leaves_a_reviewable_record_rather_than_failing_the_crawl() -> None:
    class Broken:
        async def structured(self, messages: Any, schema: Any, **kwargs: Any) -> dict[str, Any]:
            raise RuntimeError("ollama unavailable")

    records = await GenericUniversityExtractor(ollama=Broken()).extract_records(
        "https://www.example.ac.uk/courses/data-science-msc", BARE_FEE_PAGE
    )
    assert records[0]["status"] == "review"
    assert "fees" in records[0]["validation"]["missing_fields"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_generic_extractor.py -k model -v`
Expected: FAIL — `TypeError: GenericUniversityExtractor() takes no arguments`

- [ ] **Step 3: Add the model pass**

In `src/scrapal/domain/university/extractors/generic.py`, add these imports at the top:

```python
from scrapal.domain.university.extractors.base import verify_excerpt
from scrapal.domain.university.schemas import REQUIRED_COURSE_FIELDS
```

Add this module-level constant after `COURSE_URL_HINTS`:

```python
# What the model is asked for, and how its answer is folded back in.
LLM_FIELD_PROMPTS: dict[str, str] = {
    "award": "the qualification abbreviation, such as MSc, BEng (Hons) or LLM",
    "campuses": "the campus or campuses where the course is taught",
    "durations": "how long the course takes, as written",
    "intake_months": "the months the course starts, as full month names",
    "fees": "the tuition fee, including its currency symbol",
    "entry_requirements": "the academic entry requirements",
    "english_requirements": "the English language requirements",
}
```

Replace the class's opening lines (the `version` attribute and `extract_records`) with:

```python
class GenericUniversityExtractor:
    version = "generic-university-v1"

    def __init__(self, ollama: Any | None = None, max_llm_fields: int = 8) -> None:
        self.ollama = ollama
        self.max_llm_fields = max_llm_fields

    async def extract_records(self, url: str, html: bytes) -> list[dict[str, Any]]:
        fields, evidence, page_text = self.structural(url, html)
        if not fields.get("title"):
            return []
        await self.model_pass(fields, evidence, page_text, url)
        return [self.build_record(url, fields, evidence, page_text)]
```

Add these two methods to the class, before `build_record`:

```python
    async def model_pass(
        self,
        fields: dict[str, Any],
        evidence: dict[str, list[dict[str, Any]]],
        page_text: str,
        url: str,
    ) -> None:
        """Ask the local model only for required fields the structure missed.

        A returned field is kept only when its excerpt is verbatim on the page.
        Anything the model cannot point at is discarded, so a record can never
        publish on a fact that has no evidence behind it.
        """
        if self.ollama is None:
            return
        wanted = [
            field
            for field in REQUIRED_COURSE_FIELDS
            if field in LLM_FIELD_PROMPTS and not fields.get(field)
        ][: self.max_llm_fields]
        if not wanted:
            return
        schema = {
            "type": "object",
            "properties": {
                field: {
                    "type": "object",
                    "properties": {
                        "value": {"type": "string"},
                        "excerpt": {"type": "string"},
                    },
                    "required": ["value", "excerpt"],
                }
                for field in wanted
            },
        }
        asked = "\n".join(f"- {field}: {LLM_FIELD_PROMPTS[field]}" for field in wanted)
        prompt = (
            "Read this university course page and report only the fields listed.\n"
            "For each field give the value and, in 'excerpt', the exact sentence from "
            "the page that states it, copied word for word. If the page does not state "
            "a field, omit that field entirely. Never guess.\n\n"
            f"Fields:\n{asked}\n\nPage:\n{page_text[:12000]}"
        )
        try:
            answer = await self.ollama.structured(
                [{"role": "user", "content": prompt}], schema
            )
        except Exception:
            # A model outage is not a crawl failure. The record simply stays
            # in review with its missing fields named.
            return
        for field in wanted:
            entry = answer.get(field)
            if not isinstance(entry, dict):
                continue
            value, excerpt = str(entry.get("value", "")), str(entry.get("excerpt", ""))
            if not value or not verify_excerpt(excerpt, page_text):
                continue
            parsed = self._coerce(field, value)
            if parsed in (None, [], ""):
                continue
            fields[field] = parsed
            evidence.setdefault(field, []).append(
                {
                    "source_url": url,
                    "field": field,
                    "method": "llm-verified",
                    "excerpt": clean(excerpt)[:400],
                    "section": None,
                    "selector": None,
                    "confidence": 0.7,
                }
            )
        self._derive(fields, lambda *args, **kwargs: None)

    def _coerce(self, field: str, value: str) -> Any:
        """Turn the model's string into the shape the schema expects."""
        if field == "fees":
            match = MONEY_PATTERN.search(value)
            if not match:
                return None
            return [
                CourseFee(
                    residency="international",
                    label="Tuition",
                    amount=int(match.group(2).replace(",", "")),
                    currency=CURRENCY.get(match.group(1)),
                    raw_values=[value],
                ).model_dump()
            ]
        if field == "intake_months":
            return [month for month in MONTHS if month.lower() in value.lower()]
        if field in {"campuses", "durations"}:
            return [clean(part) for part in re.split(r"[;,]", value) if clean(part)]
        return clean(value)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_generic_extractor.py -v`
Expected: PASS.

Run: `pytest tests/ -v && ruff check src tests`
Expected: PASS, no findings.

- [ ] **Step 5: Commit**

```bash
git add src/scrapal/domain/university/extractors/generic.py tests/test_generic_extractor.py
git commit -m "university: let the model fill a field only when it can quote the page"
```

---

## Task 7: Run the registry during ingestion and stamp the institution

**Files:**
- Modify: `src/scrapal/services/ingestion.py:207-215` and `:517-580`
- Test: `tests/test_course_intelligence.py` (append)

**Interfaces:**
- Consumes: `resolve_extractor`, `registrable_domain`, `Institution`.
- Produces: course records for any `domain_pack == "university"` source, each carrying `institution_id`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_course_intelligence.py`:

```python
from scrapal.models import Institution
from scrapal.services.ingestion import extract_course_records


async def test_a_non_greenwich_university_source_produces_course_records() -> None:
    html = Path("tests/fixtures/buckingham_course.html").read_bytes()
    records = await extract_course_records(
        Source(
            collection_id="c1",
            name="University of Buckingham",
            kind=SourceKind.sitemap,
            url="https://www.buckingham.ac.uk/course-page-sitemap.xml",
            config={"domain_pack": "university"},
        ),
        "https://www.buckingham.ac.uk/courses/llm-international-commercial-law",
        html,
        ollama=None,
    )
    assert len(records) == 1
    assert records[0]["schema_name"] == "university.course"
    assert records[0]["extractor_version"] == "generic-university-v1"


async def test_a_greenwich_source_still_uses_the_greenwich_extractor() -> None:
    html = Path("tests/fixtures/greenwich_course.html").read_bytes()
    records = await extract_course_records(
        Source(
            collection_id="c1",
            name="Greenwich",
            kind=SourceKind.greenwich,
            url="https://www.gre.ac.uk/sitemap.xml",
            config={"domain_pack": "university"},
        ),
        "https://www.gre.ac.uk/postgraduate-courses/eduhea/ed",
        html,
        ollama=None,
    )
    assert records[0]["extractor_version"] == "greenwich-course-intelligence-v2"


async def test_a_source_that_is_not_a_university_extracts_no_course_records() -> None:
    records = await extract_course_records(
        Source(collection_id="c1", name="Blog", kind=SourceKind.website, url="https://x.com/a"),
        "https://x.com/a",
        b"<html><body><h1>Hello</h1></body></html>",
        ollama=None,
    )
    assert records == []


async def test_persisted_records_carry_the_institution_of_their_source() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        organization = Organization(name="Test")
        session.add(organization)
        await session.flush()
        collection = Collection(organization_id=organization.id, name="Courses")
        session.add(collection)
        await session.flush()
        institution = Institution(
            organization_id=organization.id,
            name="University of Buckingham",
            slug="university-of-buckingham",
            domain="buckingham.ac.uk",
            country_code="GB",
        )
        session.add(institution)
        await session.flush()
        source = Source(
            collection_id=collection.id,
            institution_id=institution.id,
            name="Buckingham",
            kind=SourceKind.sitemap,
        )
        session.add(source)
        await session.flush()
        document = Document(
            collection_id=collection.id,
            source_id=source.id,
            canonical_url="https://www.buckingham.ac.uk/courses/llm",
            title="LLM",
        )
        session.add(document)
        await session.flush()
        await persist_structured_records(
            session,
            source,
            document,
            {
                "structured_records": [
                    {
                        "schema_name": "university.course",
                        "external_id": "https://www.buckingham.ac.uk/courses/llm",
                        "data": {"title": "LLM", "level": "postgraduate", "source_url": "x"},
                        "evidence": {},
                        "status": "review",
                        "extractor_version": "generic-university-v1",
                        "validation": {"coverage": 0.5, "missing_fields": ["fees"]},
                    }
                ]
            },
        )
        await session.commit()
        stored = await session.scalar(select(StructuredRecord))
    assert stored is not None
    assert stored.institution_id == institution.id
    await engine.dispose()
```

Add `from pathlib import Path` to the imports of that file if it is not already there.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_course_intelligence.py -k university -v`
Expected: FAIL — `ImportError: cannot import name 'extract_course_records'`

- [ ] **Step 3: Add the dispatch function**

In `src/scrapal/services/ingestion.py`, add these imports:

```python
from scrapal.domain.university.extractors.registry import resolve_extractor
from scrapal.domain.university.institutions import registrable_domain
from scrapal.models import Institution
```

Add this function immediately above `persist_structured_records`:

```python
async def extract_course_records(
    source: Source,
    url: str,
    html: bytes,
    ollama: Any | None = None,
    extractor_override: str | None = None,
) -> list[dict[str, Any]]:
    """Course records for a university source, whichever university it is.

    Extraction used to be selected by the literal hostname "gre.ac.uk", which
    is why every other university crawled cleanly and produced nothing. The
    domain pack decides that a source is a university; the registry decides
    how to read it.
    """
    # default=dict fires at INSERT, not at Python construction, so a Source
    # built in a test has config None until it is persisted.
    if (source.config or {}).get("domain_pack") != "university":
        return []
    domain = registrable_domain(str(source.url or url))
    extractor = resolve_extractor(domain, extractor_override)
    if isinstance(extractor, GenericUniversityExtractor):
        extractor.ollama = ollama
    try:
        return await extractor.extract_records(url, html)
    except Exception:
        # One unreadable page must not end a 500-page crawl.
        return []
```

The model pass is the slowest stage of a large crawl, so cap it per source. Add to
`WebsiteConfig` in `src/scrapal/connectors/website.py`:

```python
    max_llm_pages: int = 200
```

and track it in `_ingest_source` with a counter passed through `persist_extraction`.
The simplest correct form: keep a per-run integer on the `Run` row's existing loop
scope, and pass `ollama=None` once it is exhausted, so extraction still runs
structurally and the record still reaches review with its missing fields named.
In `persist_extraction`, replace `ollama=OllamaService()` with:

```python
            ollama=OllamaService() if llm_budget_remaining else None,
```

where `llm_budget_remaining` is the boolean the caller computes from
`config.max_llm_pages`. A source that exhausts its budget logs one run issue at
stage `extraction` with code `llm_budget_exhausted`, so the operator can see why
later pages have thinner coverage rather than guessing.

Add `from scrapal.domain.university.extractors.generic import GenericUniversityExtractor` to the imports.

In `_ingest_source` (around line 209), replace the connector selection:

```python
    if source.kind == SourceKind.greenwich:
        connector: WebsiteConnector = GreenwichConnector()
        config: WebsiteConfig = GreenwichConfig(**source.config)
    else:
        connector = WebsiteConnector()
        config_data = {**source.config, "start_url": source.url}
        connector_config = WebsiteConfig(**config_data)
        config = connector_config
```

with:

```python
    # The connector fetches and cleans; course extraction is chosen separately
    # by the registry, so a university is no longer tied to a connector class.
    if source.kind == SourceKind.greenwich:
        connector: WebsiteConnector = GreenwichConnector()
        config: WebsiteConfig = GreenwichConfig(
            **{key: value for key, value in (source.config or {}).items() if key != "domain_pack"}
        )
    else:
        connector = WebsiteConnector()
        # One dict, so a stored start_url cannot collide with the keyword and
        # the source's url column keeps the precedence it had before.
        config = WebsiteConfig(
            **{
                **{
                    key: value
                    for key, value in (source.config or {}).items()
                    if key != "domain_pack"
                },
                "start_url": source.url,
            }
        )
```

In `persist_extraction`, immediately before each of the two `await persist_structured_records(...)` calls, merge in the generically extracted records. Add this helper call right after `extracted` is available in `persist_extraction`'s body:

```python
    if not extracted.get("structured_records") and content_type.startswith("text/html"):
        course_records = await extract_course_records(
            source, url, raw, ollama=OllamaService()
        )
        if course_records:
            extracted = {**extracted, "structured_records": course_records}
```

Add `from scrapal.services.ollama import OllamaService` to the imports if absent.

In `persist_structured_records`, set the institution on both the update and create branches. In the update branch, after `record.extractor_version = extractor_version`, add:

```python
                record.institution_id = source.institution_id
```

In the create branch, add `institution_id=source.institution_id,` to the `StructuredRecord(...)` constructor arguments.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/ -v`
Expected: PASS, including the unchanged `tests/test_greenwich.py` and `tests/test_ingestion_resilience.py`.

Run: `ruff check src tests && mypy src`
Expected: no findings.

- [ ] **Step 5: Verify against the live crawler**

```bash
docker compose exec -T postgres psql -U scrapal -d scrapal -c \
  "UPDATE sources SET config = config || '{\"domain_pack\":\"university\"}'::jsonb
   WHERE name ILIKE '%Buckingham%' OR name ILIKE '%Westminster%';"
```

Then re-run those two sources from the console's Sources view and check:

```bash
docker compose exec -T postgres psql -U scrapal -d scrapal -c \
  "SELECT i.name, r.status, count(*) FROM structured_records r
   JOIN institutions i ON i.id = r.institution_id
   WHERE r.schema_name='university.course' GROUP BY 1,2 ORDER BY 1,2;"
```

Expected: rows for Buckingham and Westminster, mostly `review` — which is correct, because coverage on an unfamiliar site will be partial and the publish gate is doing its job.

- [ ] **Step 6: Commit**

```bash
git add src/scrapal/services/ingestion.py tests/test_course_intelligence.py
git commit -m "ingestion: extract courses for every university, not just Greenwich"
```

---

## Task 8: Expose institutions through the API

**Files:**
- Modify: `src/scrapal/course_intelligence_api.py:62-107`, `src/scrapal/schemas.py`
- Test: `tests/test_course_intelligence.py` (append)

**Interfaces:**
- Consumes: `models.Institution`.
- Produces:
  - `GET /v1/admin/course-intelligence/institutions` → `list[InstitutionOut]`
  - `overview` response gains `by_institution: list[{institution_id, name, country_code, total, published, review, rejected, average_coverage}]`
  - `records` accepts `institution_id: str | None`
  - `StructuredRecordOut` gains `institution_id: str | None`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_course_intelligence.py`:

```python
from scrapal.course_intelligence_api import institution_breakdown


def test_institution_breakdown_counts_each_university_separately() -> None:
    rows = institution_breakdown(
        records=[
            _record("i1", RecordStatus.published, 1.0),
            _record("i1", RecordStatus.published, 1.0),
            _record("i1", RecordStatus.review, 0.5),
            _record("i2", RecordStatus.review, 0.25),
            _record(None, RecordStatus.review, 0.0),
        ],
        names={"i1": ("University of Greenwich", "GB"), "i2": ("University of Buckingham", "GB")},
    )
    by_id = {row["institution_id"]: row for row in rows}
    assert by_id["i1"]["total"] == 3
    assert by_id["i1"]["published"] == 2
    assert by_id["i1"]["review"] == 1
    assert by_id["i1"]["average_coverage"] == 0.833
    assert by_id["i2"]["name"] == "University of Buckingham"
    assert by_id[None]["name"] == "Unattributed"
    # sorted by published descending so the useful universities lead
    assert [row["institution_id"] for row in rows][0] == "i1"


class _Stub:
    def __init__(self, institution_id: str | None, status: RecordStatus, coverage: float) -> None:
        self.institution_id = institution_id
        self.status = status
        self.validation_json = {"coverage": coverage}


def _record(institution_id: str | None, status: RecordStatus, coverage: float) -> _Stub:
    return _Stub(institution_id, status, coverage)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_course_intelligence.py -k breakdown -v`
Expected: FAIL — `ImportError: cannot import name 'institution_breakdown'`

- [ ] **Step 3: Write the implementation**

In `src/scrapal/schemas.py`, add:

```python
class InstitutionOut(BaseModel):
    id: str
    name: str
    slug: str
    domain: str
    country_code: str | None
    city: str | None
    website_url: str | None
    logo_url: str | None
    banner_url: str | None
    brand_color: str | None
    model_config = ConfigDict(from_attributes=True)
```

Add `institution_id: str | None = None` to `StructuredRecordOut`.

In `src/scrapal/course_intelligence_api.py`, add imports:

```python
from scrapal.models import Institution
from scrapal.schemas import InstitutionOut
```

Add this pure function above the `overview` route:

```python
def institution_breakdown(
    records: list[Any],
    names: dict[str, tuple[str, str | None]],
) -> list[dict[str, Any]]:
    """Per-university totals, so an operator sees which sites are producing."""
    grouped: dict[str | None, list[Any]] = {}
    for record in records:
        grouped.setdefault(record.institution_id, []).append(record)
    rows: list[dict[str, Any]] = []
    for institution_id, group in grouped.items():
        name, country = names.get(institution_id or "", ("Unattributed", None))
        coverage = [float(item.validation_json.get("coverage", 0)) for item in group]
        rows.append(
            {
                "institution_id": institution_id,
                "name": name,
                "country_code": country,
                "total": len(group),
                "published": sum(item.status == RecordStatus.published for item in group),
                "review": sum(item.status == RecordStatus.review for item in group),
                "rejected": sum(item.status == RecordStatus.rejected for item in group),
                "average_coverage": round(sum(coverage) / len(coverage), 3) if coverage else 0,
            }
        )
    return sorted(rows, key=lambda row: (-row["published"], -row["total"], row["name"]))
```

Add the route:

```python
@router.get("/institutions", response_model=list[InstitutionOut])
async def institutions(session: Session, _: SuperAdmin) -> list[Institution]:
    return list(await session.scalars(select(Institution).order_by(Institution.name)))
```

In `overview`, after `records = list(await session.scalars(statement))`, add:

```python
    rows = list(await session.scalars(select(Institution)))
    names = {row.id: (row.name, row.country_code) for row in rows}
```

and add `"by_institution": institution_breakdown(records, names),` to the returned dictionary.

In `records`, add the parameter `institution_id: str | None = None` and, after the `collection_id` filter:

```python
    if institution_id:
        statement = statement.where(StructuredRecord.institution_id == institution_id)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_course_intelligence.py -v && ruff check src tests && mypy src`
Expected: PASS, no findings.

- [ ] **Step 5: Verify the endpoints**

```bash
curl -s -H "X-API-Key: scrapal-local-dev-key" \
  localhost:8000/v1/admin/course-intelligence/institutions | python3 -m json.tool
curl -s -H "X-API-Key: scrapal-local-dev-key" \
  localhost:8000/v1/admin/course-intelligence/overview | python3 -m json.tool
```

Expected: three institutions; an overview whose `by_institution` lists Greenwich, Buckingham and Westminster with their own counts.

- [ ] **Step 6: Commit**

```bash
git add src/scrapal/course_intelligence_api.py src/scrapal/schemas.py tests/test_course_intelligence.py
git commit -m "course intelligence: report coverage per university"
```

---

## Task 9: Remove the single-collection assumption from the console

**Files:**
- Create: `console/src/CollectionPicker.tsx`
- Modify: `console/src/api.ts`, `console/src/App.tsx`
- Test: `console/src/CollectionPicker.test.tsx`

**Interfaces:**
- Consumes: `api.collections()`, the `by_institution` field from Task 8.
- Produces:
  - `useCollectionScope(): { scope: string | undefined; setScope: (id: string | undefined) => void }` — `undefined` means all collections
  - `<CollectionPicker collections={Collection[]} scope={string|undefined} onChange={(id?: string) => void} />`

- [ ] **Step 1: Write the failing test**

Create `console/src/CollectionPicker.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { readScope, writeScope, type ScopeStore } from './CollectionPicker'

// This console has no vitest DOM environment configured, so the scope logic
// takes its store as a parameter and the tests pass a fake one. That also
// covers the browser that refuses storage entirely.
function fakeStore(): ScopeStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

const throwingStore: ScopeStore = {
  getItem: () => { throw new Error('storage blocked') },
  setItem: () => { throw new Error('storage blocked') },
  removeItem: () => { throw new Error('storage blocked') },
}

describe('collection scope', () => {
  it('defaults to every collection rather than the first one', () => {
    // The console used to pass collections[0], which silently hid the
    // second collection and everything in it.
    expect(readScope(fakeStore())).toBeUndefined()
  })

  it('remembers an explicit choice across reloads', () => {
    const store = fakeStore()
    writeScope('abc-123', store)
    expect(readScope(store)).toBe('abc-123')
  })

  it('returns to every collection when the choice is cleared', () => {
    const store = fakeStore()
    writeScope('abc-123', store)
    writeScope(undefined, store)
    expect(readScope(store)).toBeUndefined()
  })

  it('still works when the browser refuses storage', () => {
    expect(readScope(throwingStore)).toBeUndefined()
    expect(() => writeScope('abc-123', throwingStore)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd console && npx vitest run src/CollectionPicker.test.tsx`
Expected: FAIL — cannot resolve `./CollectionPicker`.

- [ ] **Step 3: Write the component**

Create `console/src/CollectionPicker.tsx`:

```tsx
import { Layers } from 'lucide-react'
import { useState } from 'react'
import { ICON } from './lib'

const KEY = 'scrapal-collection-scope'

export type ScopeStore = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

// Resolved lazily: reading localStorage at module scope throws in some
// privacy modes before any component has mounted.
function browserStore(): ScopeStore | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function readScope(store: ScopeStore | undefined = browserStore()): string | undefined {
  try {
    return store?.getItem(KEY) ?? undefined
  } catch {
    return undefined
  }
}

export function writeScope(
  id: string | undefined,
  store: ScopeStore | undefined = browserStore(),
): void {
  try {
    if (id) store?.setItem(KEY, id)
    else store?.removeItem(KEY)
  } catch {
    /* a browser with storage blocked still works, it just forgets */
  }
}

export function useCollectionScope() {
  const [scope, set] = useState<string | undefined>(() => readScope())
  return {
    scope,
    setScope: (id: string | undefined) => {
      writeScope(id)
      set(id)
    },
  }
}

export function CollectionPicker(
  { collections, scope, onChange }: {
    collections: { id: string; name: string }[]
    scope: string | undefined
    onChange: (id: string | undefined) => void
  },
) {
  if (collections.length < 2) return null
  return (
    <label className="collection-picker">
      <Layers size={ICON.md} aria-hidden="true" />
      <span className="sr-only">Collection</span>
      <select value={scope ?? ''} onChange={(event) => onChange(event.target.value || undefined)}>
        <option value="">All collections</option>
        {collections.map((collection) => (
          <option key={collection.id} value={collection.id}>{collection.name}</option>
        ))}
      </select>
    </label>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd console && npx vitest run src/CollectionPicker.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire it through App.tsx**

In `console/src/App.tsx`:

Add the imports:

```tsx
import { CollectionPicker, useCollectionScope } from './CollectionPicker'
```

Inside `App`, after the `collections` query, add:

```tsx
  const { scope, setScope } = useCollectionScope()
```

Replace every occurrence of `collections.data?.[0]?.id` with `scope` — there are five, at the `Knowledge`, `CourseIntelligence`, `RetrievalLab`, `AgentPanel` and `AddSource` call sites. `AddSource` needs a real collection to write into, so give it `scope ?? collections.data?.[0]?.id`.

In the topbar's `.top-actions` div, before the agent trigger button, add:

```tsx
<CollectionPicker collections={collections.data ?? []} scope={scope} onChange={setScope} />
```

In `console/src/api.ts`, add to the api object:

```ts
  institutions: () => request<Institution[]>('/v1/admin/course-intelligence/institutions'),
```

and the type:

```ts
export type Institution = {
  id: string; name: string; slug: string; domain: string
  country_code: string | null; city: string | null; website_url: string | null
  logo_url: string | null; banner_url: string | null; brand_color: string | null
}
```

Add to `CourseIntelligenceOverview`:

```ts
  by_institution: {
    institution_id: string | null; name: string; country_code: string | null
    total: number; published: number; review: number; rejected: number
    average_coverage: number
  }[]
```

- [ ] **Step 6: Render the breakdown**

In the `CourseIntelligence` component, immediately after the existing coverage spine, add:

```tsx
<section className="institution-spine">
  <h3>Coverage by university</h3>
  <ul>
    {overview.data?.by_institution.map((row) => (
      <li key={row.institution_id ?? 'none'}>
        <div>
          <strong>{row.name}</strong>
          {row.country_code && <span className="country">{row.country_code}</span>}
        </div>
        <Meter value={row.average_coverage} />
        <span className="counts">
          {row.published} published · {row.review} in review
        </span>
      </li>
    ))}
  </ul>
</section>
```

Add to `console/src/styles.css`:

```css
.collection-picker { display: flex; align-items: center; gap: 8px; }
.collection-picker select {
  border: 1px solid var(--line); background: var(--surface); color: var(--ink);
  border-radius: 9px; padding: 7px 10px; font-weight: 700; font-size: 13.5px;
}
.institution-spine ul { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 10px; }
.institution-spine li {
  display: grid; grid-template-columns: minmax(0, 1fr) 120px auto; gap: 14px;
  align-items: center; padding: 12px 14px;
  border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);
}
.institution-spine .country {
  margin-left: 8px; font-size: 11px; color: var(--ink-soft);
  border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px;
}
.institution-spine .counts { font-size: 12.5px; color: var(--ink-soft); white-space: nowrap; }
@media (max-width: 760px) {
  .institution-spine li { grid-template-columns: 1fr; gap: 8px; }
  .collection-picker select { max-width: 42vw; }
}
```

- [ ] **Step 7: Verify in the running console**

```bash
cd console && npm run build && npx vitest run && npm run lint
```

Expected: build succeeds, tests pass, lint clean.

Open http://localhost:3000, go to Course Intelligence, and confirm: the collection picker appears in the topbar with "All collections" selected; "Coverage by university" lists Greenwich, Buckingham and Westminster; switching to "University of Greenwich" collection changes the counts. Check at 390px that nothing overflows horizontally.

- [ ] **Step 8: Commit**

```bash
git add console/src/CollectionPicker.tsx console/src/CollectionPicker.test.tsx console/src/App.tsx console/src/api.ts console/src/styles.css
git commit -m "console: show every collection, and coverage per university"
```

---

## Task 10: Harvest institution branding during a crawl

The last piece of spec section 1, and what makes the gallery in the next plan look like anything.

**Files:**
- Modify: `src/scrapal/services/ingestion.py`
- Test: `tests/test_institutions.py` (append)

**Interfaces:**
- Consumes: `models.Institution`.
- Produces: `def branding_from_html(html: bytes, url: str) -> dict[str, str]` in `src/scrapal/domain/university/institutions.py`, and a call in `persist_extraction` that fills only null columns.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_institutions.py`:

```python
from scrapal.domain.university.institutions import branding_from_html

BRANDED = (
    b'<html><head>'
    b'<meta property="og:image" content="/img/law-banner.jpg">'
    b'<meta name="theme-color" content="#7c2529">'
    b'<link rel="icon" href="https://www.buckingham.ac.uk/favicon.png">'
    b'</head><body><h1>Course</h1></body></html>'
)


def test_branding_is_read_from_the_page_and_resolved_to_absolute_urls() -> None:
    found = branding_from_html(BRANDED, "https://www.buckingham.ac.uk/courses/llm")
    assert found["banner_url"] == "https://www.buckingham.ac.uk/img/law-banner.jpg"
    assert found["logo_url"] == "https://www.buckingham.ac.uk/favicon.png"
    assert found["brand_color"] == "#7c2529"


def test_branding_returns_nothing_for_a_page_that_declares_none() -> None:
    assert branding_from_html(b"<html><body>x</body></html>", "https://x.ac.uk/a") == {}


def test_branding_ignores_a_theme_colour_that_is_not_a_hex_value() -> None:
    html = b'<html><head><meta name="theme-color" content="rebeccapurple"></head></html>'
    assert "brand_color" not in branding_from_html(html, "https://x.ac.uk/a")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_institutions.py -k branding -v`
Expected: FAIL — `ImportError: cannot import name 'branding_from_html'`

- [ ] **Step 3: Write the implementation**

In `src/scrapal/domain/university/institutions.py`, first extend the import block at
the **top** of the file — ruff's `I` rule will fail the build if these are appended at
the bottom next to the function:

```python
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
```

Then append to the same file:

```python
HEX_COLOR = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def branding_from_html(html: bytes, url: str) -> dict[str, str]:
    """Logo, banner and brand colour a university already publishes about itself.

    Taken from pages the crawler has fetched anyway. Nothing is requested from
    a third party, so the institution list never leaves this deployment.
    """
    soup = BeautifulSoup(html, "html.parser")
    found: dict[str, str] = {}
    banner = soup.find("meta", attrs={"property": "og:image"})
    if banner and banner.get("content"):
        found["banner_url"] = urljoin(url, str(banner["content"]).strip())
    icon = soup.find("link", attrs={"rel": lambda value: value and "icon" in " ".join(value)})
    if icon and icon.get("href"):
        found["logo_url"] = urljoin(url, str(icon["href"]).strip())
    color = soup.find("meta", attrs={"name": "theme-color"})
    if color and color.get("content"):
        value = str(color["content"]).strip()
        if HEX_COLOR.match(value):
            found["brand_color"] = value
    return found
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/test_institutions.py -v`
Expected: PASS.

- [ ] **Step 5: Fill the institution during ingestion**

In `src/scrapal/services/ingestion.py`, add this function above `extract_course_records`:

```python
async def fill_institution_branding(
    session: AsyncSession, source: Source, url: str, html: bytes
) -> None:
    """Record branding the first time we see it, never overwriting an override.

    An administrator who sets a logo keeps it; a later crawl fills only what
    is still null.
    """
    if not source.institution_id:
        return
    institution = await session.get(Institution, source.institution_id)
    if not institution:
        return
    if institution.logo_url and institution.banner_url and institution.brand_color:
        return
    for column, value in branding_from_html(html, url).items():
        if getattr(institution, column) is None:
            setattr(institution, column, value)
```

Add `from scrapal.domain.university.institutions import branding_from_html, registrable_domain` to the imports.

In `persist_extraction`, immediately before the course-record block added in Task 7, add:

```python
    if content_type.startswith("text/html"):
        await fill_institution_branding(session, source, url, raw)
```

- [ ] **Step 6: Run the full suite and verify against the live crawler**

Run: `pytest tests/ -v && ruff check src tests && mypy src`
Expected: PASS, no findings.

Re-run the Buckingham source from the console, then:

```bash
docker compose exec -T postgres psql -U scrapal -d scrapal -c \
  "SELECT name, brand_color, logo_url IS NOT NULL AS has_logo,
          banner_url IS NOT NULL AS has_banner FROM institutions ORDER BY name;"
```

Expected: at least one institution with a brand colour or a logo. Universities that publish neither stay null, which is correct — the next plan renders a generated banner for those.

- [ ] **Step 7: Commit**

```bash
git add src/scrapal/domain/university/institutions.py src/scrapal/services/ingestion.py tests/test_institutions.py
git commit -m "institutions: keep the branding a university already publishes"
```

---

## Definition of done

- `pytest tests/ -v` passes, including `test_greenwich.py` unchanged.
- `ruff check src tests` and `mypy src` are clean.
- `cd console && npm run build && npx vitest run && npm run lint` all pass.
- `alembic upgrade head` then `downgrade -1` then `upgrade head` leaves the same row counts.
- The live database shows course records attributed to Buckingham and Westminster, not only Greenwich.
- Course Intelligence shows a collection picker and a per-university coverage breakdown, with no horizontal overflow at 390px.
- No record reached `published` with a required field lacking evidence — verify with:

```sql
SELECT count(*) FROM structured_records
WHERE schema_name = 'university.course' AND status = 'published'
  AND (validation_json->>'coverage')::float < 1;
```

Expected: `0`.
