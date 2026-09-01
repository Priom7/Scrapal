from typing import Any

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from scrapal.db import Base
from scrapal.models import (
    Collection,
    Document,
    DocumentVersion,
    EmbeddingProfile,
    IndexStatus,
    Organization,
    Source,
    SourceKind,
)
from scrapal.services.indexing import index_document_version


class FakeEmbeddings:
    def __init__(self, dimensions: int) -> None:
        self.dimensions = dimensions

    async def embed(self, texts: list[str], **_: Any) -> list[list[float]]:
        return [[0.1] * self.dimensions for _ in texts]


async def build_document(session: Any) -> tuple[Document, DocumentVersion]:
    organization = Organization(name="Test")
    session.add(organization)
    await session.flush()
    collection = Collection(organization_id=organization.id, name="Evidence", description="")
    session.add(collection)
    await session.flush()
    source = Source(
        collection_id=collection.id,
        name="Fixture",
        kind=SourceKind.document,
        config={},
    )
    session.add(source)
    await session.flush()
    document = Document(
        collection_id=collection.id,
        source_id=source.id,
        canonical_url="upload://fixture",
        title="Fixture",
        current_version_id="old-version",
    )
    session.add(document)
    await session.flush()
    version = DocumentVersion(
        document_id=document.id,
        content_hash="new-hash",
        text="Admissions\n\nInternational entry requirements and application documents.",
    )
    session.add(version)
    await session.flush()
    return document, version


@pytest.mark.asyncio
async def test_shadow_index_activates_only_after_complete_embeddings() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        session.add(
            EmbeddingProfile(
                model="nomic-embed-text:latest", dimensions=768, active=True, healthy=True
            )
        )
        document, version = await build_document(session)
        state = await index_document_version(
            session, document, version, ollama=FakeEmbeddings(768)  # type: ignore[arg-type]
        )
        assert state.status == IndexStatus.ready
        assert state.chunks_count == state.embeddings_count > 0
        assert document.current_version_id == version.id
    await engine.dispose()


@pytest.mark.asyncio
async def test_invalid_shadow_index_preserves_current_version() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        session.add(
            EmbeddingProfile(
                model="nomic-embed-text:latest", dimensions=768, active=True, healthy=True
            )
        )
        document, version = await build_document(session)
        state = await index_document_version(
            session, document, version, ollama=FakeEmbeddings(12)  # type: ignore[arg-type]
        )
        assert state.status == IndexStatus.failed
        assert document.current_version_id == "old-version"
    await engine.dispose()
