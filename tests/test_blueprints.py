import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from scrapal.blueprints_api import approve, update_blueprint
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
from scrapal.schemas import CrawlBlueprintUpdate
from scrapal.security import Principal
from scrapal.services.blueprints import (
    UNIVERSITY_FIELDS,
    classify_page_type,
    coverage_contract,
    detect_evidence_fields,
    representative_urls,
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


def test_sampling_detects_field_level_evidence_signals() -> None:
    html = b"""
    <html><title>Computing MSc</title><h1>Computing, MSc</h1>
    <p>Postgraduate, full-time for 1 year. September intake.</p>
    <h2>Entry requirements</h2><p>IELTS 6.5.</p>
    <h2>Tuition fees</h2><p>International fee: \xc2\xa318,700.</p></html>
    """
    fields = detect_evidence_fields(
        html,
        "https://example.edu/postgraduate-courses/computing",
        ["title", "award", "level", "study_modes", "durations", "intake_months", "fees", "entry_requirements", "english_requirements"],
    )
    assert set(fields) == {"title", "award", "level", "study_modes", "durations", "intake_months", "fees", "entry_requirements", "english_requirements"}


def test_representative_sampling_prioritizes_course_and_support_pages() -> None:
    classified = [
        {"url": f"https://example.edu/postgraduate-courses/course-{index}", "page_type": "course", "reason": "signal"}
        for index in range(8)
    ] + [
        {"url": "https://example.edu/fees", "page_type": "fees", "reason": "signal"},
        {"url": "https://example.edu/international/visa", "page_type": "international", "reason": "signal"},
    ]
    selected = representative_urls(classified, limit=6)
    assert len(selected) == 6
    assert selected[:4] == [item["url"] for item in classified[:4]]
    assert "https://example.edu/fees" in selected
    assert "https://example.edu/international/visa" in selected


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

        updated = await update_blueprint(
            blueprint.id,
            CrawlBlueprintUpdate(
                include_patterns=["/postgraduate-courses/"],
                exclude_patterns=["/news/"],
                max_pages=250,
                max_depth=0,
            ),
            session,
            principal,
        )
        assert updated.version == 2

        approved = await approve(blueprint.id, session, principal)

        assert approved.status == BlueprintStatus.approved
        assert approved.source_id is not None
        source = await session.get(Source, approved.source_id)
        assert source is not None
        assert source.kind == SourceKind.greenwich
        assert source.url == "https://www.gre.ac.uk/sitemap.xml"
        assert source.config["max_pages"] == 250
    await engine.dispose()
