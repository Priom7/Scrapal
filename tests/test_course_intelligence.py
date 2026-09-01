import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from scrapal.db import Base
from scrapal.models import (
    Collection,
    Document,
    Organization,
    RecordStatus,
    Source,
    SourceKind,
    StructuredRecord,
    StructuredRecordRevision,
)
from scrapal.services.ingestion import persist_structured_records


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
