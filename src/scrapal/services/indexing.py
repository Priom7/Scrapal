from __future__ import annotations

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from scrapal.config import get_settings
from scrapal.db import SessionLocal
from scrapal.models import (
    Chunk,
    ChunkEmbedding,
    Document,
    DocumentIndex,
    DocumentVersion,
    EmbeddingProfile,
    IndexStatus,
    now,
)
from scrapal.services.chunking import chunk_text
from scrapal.services.ollama import OllamaService, OllamaUnavailable
from scrapal.telemetry import RAG_INDEX_FAILURES, tracer

CHUNKER_VERSION = "structure-v1"


async def reindex_document_version(document_id: str, version_id: str) -> None:
    async with SessionLocal() as session:
        document = await session.get(Document, document_id)
        version = await session.get(DocumentVersion, version_id)
        if not document or not version or version.document_id != document.id:
            return
        await index_document_version(session, document, version)
        await session.commit()


async def ensure_default_profile(session: AsyncSession) -> EmbeddingProfile:
    profile = await session.scalar(select(EmbeddingProfile).where(EmbeddingProfile.active.is_(True)))
    if profile:
        return profile
    settings = get_settings()
    profile = await session.scalar(
        select(EmbeddingProfile).where(
            EmbeddingProfile.provider == "ollama",
            EmbeddingProfile.model == settings.ollama_embed_model,
            EmbeddingProfile.version == "1",
        )
    )
    if not profile:
        profile = EmbeddingProfile(
            provider="ollama",
            model=settings.ollama_embed_model,
            dimensions=settings.embedding_dimensions,
            active=True,
            healthy=True,
            activated_at=now(),
        )
        session.add(profile)
        await session.flush()
    else:
        profile.active = True
        profile.activated_at = now()
    return profile


async def index_document_version(
    session: AsyncSession,
    document: Document,
    version: DocumentVersion,
    *,
    ollama: OllamaService | None = None,
) -> DocumentIndex:
    profile = await ensure_default_profile(session)
    state = await session.scalar(
        select(DocumentIndex).where(
            DocumentIndex.document_version_id == version.id,
            DocumentIndex.embedding_profile_id == profile.id,
        )
    )
    if (
        state
        and state.status == IndexStatus.ready
        and state.content_hash == version.content_hash
        and state.chunker_version == CHUNKER_VERSION
    ):
        document.current_version_id = version.id
        return state
    if not state:
        state = DocumentIndex(
            document_id=document.id,
            document_version_id=version.id,
            embedding_profile_id=profile.id,
            content_hash=version.content_hash,
            chunker_version=CHUNKER_VERSION,
        )
        session.add(state)
        await session.flush()
    state.status = IndexStatus.indexing
    state.attempts += 1
    state.started_at = now()
    state.error = None
    await session.execute(delete(Chunk).where(Chunk.document_version_id == version.id))
    chunks = chunk_text(version.text)
    chunk_rows: list[Chunk] = []
    for item in chunks:
        row = Chunk(
            document_id=document.id,
            document_version_id=version.id,
            position=item.position,
            heading=item.heading,
            content=item.content,
            content_hash=item.content_hash,
            token_count=item.token_count,
            page_number=item.page_number,
            section_path=list(item.section_path),
            anchor=item.anchor,
            metadata_json={"chunker_version": CHUNKER_VERSION},
        )
        session.add(row)
        chunk_rows.append(row)
    await session.flush()
    try:
        with tracer.start_as_current_span("embedding.generate"):
            vectors = await (ollama or OllamaService()).embed([item.content for item in chunk_rows])
        if len(vectors) != len(chunk_rows):
            raise ValueError("Embedding response count did not match chunk count")
        if any(len(vector) != profile.dimensions for vector in vectors):
            profile.healthy = False
            raise ValueError(f"Embedding dimensions did not match profile ({profile.dimensions})")
        for chunk, vector in zip(chunk_rows, vectors, strict=True):
            session.add(
                ChunkEmbedding(
                    chunk_id=chunk.id,
                    embedding_profile_id=profile.id,
                    embedding=vector,
                )
            )
    except OllamaUnavailable as exc:
        state.status = IndexStatus.waiting
        state.error = str(exc)[:2000]
        state.chunks_count = len(chunk_rows)
        state.embeddings_count = 0
        RAG_INDEX_FAILURES.labels(reason="ollama_unavailable").inc()
        return state
    except Exception as exc:
        state.status = IndexStatus.failed
        state.error = f"{type(exc).__name__}: {exc}"[:2000]
        state.chunks_count = len(chunk_rows)
        state.embeddings_count = 0
        RAG_INDEX_FAILURES.labels(reason="invalid_embedding").inc()
        return state
    state.status = IndexStatus.ready
    state.chunks_count = len(chunk_rows)
    state.embeddings_count = len(vectors)
    state.finished_at = now()
    document.current_version_id = version.id
    await session.execute(
        update(DocumentIndex)
        .where(
            DocumentIndex.document_id == document.id,
            DocumentIndex.id != state.id,
            DocumentIndex.status == IndexStatus.ready,
        )
        .values(status=IndexStatus.stale)
    )
    return state
