from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from scrapal.db import Base
from scrapal.models import (
    Collection,
    Document,
    Institution,
    Organization,
    RecordStatus,
    Source,
    SourceKind,
    StructuredRecord,
    StructuredRecordRevision,
)
from scrapal.services.ingestion import (
    extract_course_records,
    persist_extraction,
    persist_structured_records,
)


@pytest.mark.asyncio
async def test_extractor_upgrade_revises_record_without_duplicate() -> None:
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
        source = Source(collection_id=collection.id, name="Greenwich", kind=SourceKind.greenwich)
        session.add(source)
        await session.flush()
        document = Document(
            collection_id=collection.id,
            source_id=source.id,
            canonical_url="https://example.edu/course",
            title="Example",
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
                        "external_id": document.canonical_url,
                        "data": {"title": "Example"},
                        "evidence": {"method": "legacy-v1"},
                        "confidence": 0.9,
                    }
                ]
            },
        )
        await persist_structured_records(
            session,
            source,
            document,
            {
                "structured_records": [
                    {
                        "schema_name": "university.course",
                        "external_id": document.canonical_url,
                        "data": {"title": "Example", "fees": [{"amount": 10000}]},
                        "evidence": {"method": "course-intelligence-v2"},
                        "confidence": 0.98,
                        "status": "review",
                        "validation": {"coverage": 0.75, "missing_fields": ["campuses"]},
                        "extractor_version": "course-intelligence-v2",
                    }
                ]
            },
        )
        await session.flush()

        record = await session.scalar(select(StructuredRecord))
        assert record is not None
        assert record.revision == 2
        assert record.status == RecordStatus.review
        assert record.extractor_version == "course-intelligence-v2"
        assert await session.scalar(select(func.count(StructuredRecord.id))) == 1
        assert await session.scalar(select(func.count(StructuredRecordRevision.id))) == 2
    await engine.dispose()


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


async def test_persist_extraction_runs_course_extraction_for_a_university_page() -> None:
    # The guard in persist_extraction is the seam this task exists to wire: an
    # HTML page from a university source, whose connector found no records of
    # its own, must reach the generic extractor.
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
        source = Source(
            collection_id=collection.id,
            name="Buckingham",
            kind=SourceKind.sitemap,
            url="https://www.buckingham.ac.uk/course-page-sitemap.xml",
            config={"domain_pack": "university"},
        )
        session.add(source)
        await session.commit()
        html = Path("tests/fixtures/buckingham_course.html").read_bytes()
        await persist_extraction(
            session,
            source,
            None,
            "https://www.buckingham.ac.uk/courses/llm-international-commercial-law",
            html,
            "text/html",
            {"title": "LLM", "text": "x", "metadata": {}},
            use_model=False,
        )
        await session.commit()
        stored = await session.scalar(select(StructuredRecord))
    assert stored is not None
    assert stored.schema_name == "university.course"
    assert stored.extractor_version == "generic-university-v1"
    await engine.dispose()


async def test_persist_extraction_leaves_a_non_html_page_alone(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    extractor = AsyncMock()
    monkeypatch.setattr("scrapal.services.ingestion.extract_course_records", extractor)
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
        source = Source(
            collection_id=collection.id,
            name="Buckingham",
            kind=SourceKind.sitemap,
            url="https://www.buckingham.ac.uk/course-page-sitemap.xml",
            config={"domain_pack": "university"},
        )
        session.add(source)
        await session.commit()
        await persist_extraction(
            session, source, None, "https://www.buckingham.ac.uk/prospectus.pdf",
            b"%PDF-1.4 not html", "application/pdf",
            {"title": "Prospectus", "text": "x", "metadata": {}}, use_model=False,
        )
        await session.commit()
        stored = await session.scalar(select(StructuredRecord))
    extractor.assert_not_awaited()
    assert stored is None
    await engine.dispose()
