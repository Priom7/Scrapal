from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from scrapal.db import Base
from scrapal.models import (
    Collection,
    Conversation,
    Document,
    DocumentVersion,
    EmbeddingProfile,
    GenerationEvent,
    GenerationStatus,
    IndexStatus,
    Message,
    MessageGeneration,
    Organization,
    Source,
    SourceKind,
)
from scrapal.services.generation import (
    _finish_abstention,
    _stream_validated_answer,
    conversation_history,
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


async def test_conversation_history_returns_the_recent_turns_in_order() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        organization = Organization(name="Test")
        session.add(organization)
        await session.flush()
        conversation = Conversation(organization_id=organization.id, title="Courses")
        other = Conversation(organization_id=organization.id, title="Unrelated")
        session.add_all([conversation, other])
        await session.flush()

        base = datetime(2026, 9, 3, 11, 18, tzinfo=UTC)
        turns = [
            Message(
                conversation_id=conversation.id,
                role=role,
                content=content,
                created_at=base + timedelta(seconds=index),
            )
            for index, (role, content) in enumerate(
                [
                    ("user", "I am looking for computer science course to masters in the Uk"),
                    ("assistant", "The Computer Science, MSc program is accredited by BCS."),
                    ("user", "Any other course related to this?"),
                ]
            )
        ]
        session.add_all(turns)
        session.add(
            Message(
                conversation_id=other.id,
                role="user",
                content="Leaked from another conversation",
                created_at=base,
            )
        )
        await session.commit()

        history = await conversation_history(session, conversation.id, turns[-1])

    assert history == [
        ("user", "I am looking for computer science course to masters in the Uk"),
        ("assistant", "The Computer Science, MSc program is accredited by BCS."),
    ]


async def _generation_fixture(session: Any) -> MessageGeneration:
    organization = Organization(name="Test")
    session.add(organization)
    await session.flush()
    conversation = Conversation(organization_id=organization.id, title="Courses")
    session.add(conversation)
    await session.flush()
    question = Message(
        conversation_id=conversation.id, role="user", content="What does the MSc cost?"
    )
    session.add(question)
    await session.flush()
    generation = MessageGeneration(
        conversation_id=conversation.id,
        user_message_id=question.id,
        status=GenerationStatus.generating,
    )
    session.add(generation)
    await session.commit()
    return generation


async def _events(session: Any, generation_id: str) -> list[tuple[str, dict[str, Any]]]:
    rows = await session.scalars(
        select(GenerationEvent)
        .where(GenerationEvent.generation_id == generation_id)
        .order_by(GenerationEvent.sequence)
    )
    return [(event.event_type, event.payload) for event in rows]


async def test_a_withheld_sentence_is_announced_instead_of_silently_dropped() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    class Ollama:
        async def chat_stream(self, messages: Any, **_: Any) -> AsyncIterator[str]:
            yield "Computer Science MSc is accredited by BCS [1]. "
            yield "The tuition fee is 25000 pounds."

    async with sessions() as session:
        generation = await _generation_fixture(session)
        evidence = [{"title": "Computer Science, MSc", "text": "Accredited by BCS."}]

        await _stream_validated_answer(
            session, generation, "What does the MSc cost?", evidence, Ollama()
        )

        events = await _events(session, generation.id)

    assert generation.status == GenerationStatus.completed
    assert "accredited by BCS [1]." in generation.answer
    # The invented fee never reaches the answer, and the reader is told a
    # sentence was removed rather than being shown a shortened answer.
    assert "25000" not in generation.answer
    assert generation.unsupported_sentences == ["The tuition fee is 25000 pounds."]
    withheld = [payload for event_type, payload in events if event_type == "answer.withheld"]
    assert withheld == [{"reason": "missing_citation", "characters": 32}]
    assert "25000" not in str(events), "a withheld claim must not travel in the event payload"


async def test_abstention_distinguishes_no_evidence_from_no_citable_sentence() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    class Uncitable:
        async def chat_stream(self, messages: Any, **_: Any) -> AsyncIterator[str]:
            yield "The fee is 25000 pounds."

    async with sessions() as session:
        generation = await _generation_fixture(session)
        await _stream_validated_answer(
            session,
            generation,
            "What does the MSc cost?",
            [{"title": "Computer Science, MSc", "text": "Accredited by BCS."}],
            Uncitable(),
        )
        uncitable_answer = generation.answer

        empty = await _generation_fixture(session)
        await _finish_abstention(session, empty, "no_published_evidence")

    assert generation.status == GenerationStatus.abstained
    # Evidence was read; saying none exists would send the reader looking for a
    # source that is already indexed.
    assert "could not tie a single sentence" in uncitable_answer
    assert "currently published evidence" in empty.answer
    assert uncitable_answer != empty.answer
