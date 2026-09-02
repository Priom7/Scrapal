import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from scrapal.blueprints_api import approve
from scrapal.db import Base
from scrapal.models import (
    BlueprintStatus,
    Collection,
    CrawlBlueprint,
    Organization,
    Role,
    Source,
    SourceKind,
)
from scrapal.security import Principal
from scrapal.services.blueprints import (
    UNIVERSITY_FIELDS,
    classify_page_type,
    coverage_contract,
    suggested_patterns,
)


def test_blueprint_classifies_university_page_signals() -> None:
    assert classify_page_type("https://example.edu/postgraduate-courses/computing") == "course"
    assert classify_page_type("https://example.edu/study/tuition-fees") == "fees"
    assert classify_page_type("https://example.edu/international/visa") == "international"
    assert classify_page_type("https://example.edu/about/history") == "general"


def test_university_contract_is_complete_and_deduplicated() -> None:
    assert coverage_contract("university", []) == UNIVERSITY_FIELDS
    assert coverage_contract("university", ["Fees", "entry requirements", "Fees"]) == [
        "fees",
        "entry_requirements",
    ]


def test_blueprint_suggests_only_observed_course_patterns() -> None:
    urls = [
        "https://example.edu/postgraduate-courses/computing/msc",
        "https://example.edu/news/welcome",
    ]
    patterns = suggested_patterns(urls, "university")
    assert patterns[0] == "/postgraduate-courses/"
    assert "/undergraduate-courses/" in patterns
    assert "/courses/" in patterns
    assert suggested_patterns(urls, "generic") == []


@pytest.mark.asyncio
async def test_approving_greenwich_blueprint_creates_versioned_source() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        organization = Organization(name="Test")
        session.add(organization)
        await session.flush()
        collection = Collection(organization_id=organization.id, name="Universities")
        session.add(collection)
        await session.flush()
        blueprint = CrawlBlueprint(
            organization_id=organization.id,
            collection_id=collection.id,
            name="University of Greenwich",
            start_url="https://www.gre.ac.uk/",
            objective="Capture student planning evidence",
            domain_pack="university",
            required_fields=["fees", "intake_months"],
            discovery_json={"sitemaps": ["https://www.gre.ac.uk/sitemap.xml"]},
            suggested_config={
                "start_url": "https://www.gre.ac.uk/sitemap.xml",
                "include_patterns": ["/undergraduate-courses/", "/postgraduate-courses/"],
            },
        )
        session.add(blueprint)
        await session.commit()
        principal = Principal(organization.id, Role.editor, ["*"])

        approved = await approve(blueprint.id, session, principal)

        assert approved.status == BlueprintStatus.approved
        assert approved.source_id is not None
        source = await session.get(Source, approved.source_id)
        assert source is not None
        assert source.kind == SourceKind.greenwich
        assert source.url == "https://www.gre.ac.uk/sitemap.xml"
    await engine.dispose()
