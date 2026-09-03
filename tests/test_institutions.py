import pytest
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from scrapal.db import Base
from scrapal.domain.university.institutions import (
    country_for_domain,
    institution_name_from_domain,
    registrable_domain,
    slugify,
)
from scrapal.models import Institution, Organization, Source, SourceKind, StructuredRecord


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
