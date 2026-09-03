import pytest
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from scrapal.db import Base
from scrapal.domain.university.institutions import (
    branding_from_html,
    country_for_domain,
    institution_name_from_domain,
    registrable_domain,
    slugify,
)
from scrapal.models import Institution, Organization, Source, SourceKind, StructuredRecord
from scrapal.services.ingestion import fill_institution_branding
from scrapal.services.institutions import resolve_institution

BRANDED = (
    b"<html><head>"
    b'<meta property="og:image" content="/img/law-banner.jpg">'
    b'<meta name="theme-color" content="#7c2529">'
    b'<link rel="icon" href="https://www.buckingham.ac.uk/favicon.png">'
    b"</head><body><h1>Course</h1></body></html>"
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


async def test_branding_fill_preserves_an_administrator_override() -> None:
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
            name="University of Buckingham",
            slug="university-of-buckingham",
            domain="buckingham.ac.uk",
            logo_url="https://assets.example/admin-logo.svg",
        )
        session.add(institution)
        await session.flush()
        source = Source(
            collection_id="c1",
            institution_id=institution.id,
            name="Buckingham",
            kind=SourceKind.sitemap,
        )
        await fill_institution_branding(
            session,
            source,
            "https://www.buckingham.ac.uk/courses/llm",
            BRANDED,
        )
        await session.flush()
    assert institution.logo_url == "https://assets.example/admin-logo.svg"
    assert institution.banner_url == "https://www.buckingham.ac.uk/img/law-banner.jpg"
    assert institution.brand_color == "#7c2529"
    await engine.dispose()


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
