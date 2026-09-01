import enum
import uuid
from datetime import UTC, datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from scrapal.db import Base


def new_id() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    return datetime.now(UTC)


class Role(str, enum.Enum):
    super_admin = "super_admin"
    admin = "admin"
    editor = "editor"
    viewer = "viewer"


class SourceKind(str, enum.Enum):
    website = "website"
    sitemap = "sitemap"
    url_list = "url_list"
    document = "document"
    greenwich = "greenwich"


class RunStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"
    waiting_for_ai = "waiting_for_ai"


class ProposalStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    executed = "executed"


class IndexStatus(str, enum.Enum):
    waiting = "waiting"
    indexing = "indexing"
    ready = "ready"
    failed = "failed"
    stale = "stale"


class GenerationStatus(str, enum.Enum):
    queued = "queued"
    retrieving = "retrieving"
    generating = "generating"
    completed = "completed"
    abstained = "abstained"
    failed = "failed"


class EvaluationStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(180))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class APIKey(Base):
    __tablename__ = "api_keys"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(180))
    key_hash: Mapped[str] = mapped_column(String(64), unique=True)
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.admin)
    scopes: Mapped[list[str]] = mapped_column(JSON, default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Collection(Base):
    __tablename__ = "collections"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(180))
    description: Mapped[str] = mapped_column(Text, default="")
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    sources: Mapped[list["Source"]] = relationship(back_populates="collection")


class Source(Base):
    __tablename__ = "sources"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    collection_id: Mapped[str] = mapped_column(ForeignKey("collections.id"), index=True)
    name: Mapped[str] = mapped_column(String(180))
    kind: Mapped[SourceKind] = mapped_column(Enum(SourceKind))
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    collection: Mapped[Collection] = relationship(back_populates="sources")


class Run(Base):
    __tablename__ = "runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    status: Mapped[RunStatus] = mapped_column(Enum(RunStatus), default=RunStatus.queued)
    mode: Mapped[str] = mapped_column(String(32), default="incremental")
    pages_discovered: Mapped[int] = mapped_column(Integer, default=0)
    pages_processed: Mapped[int] = mapped_column(Integer, default=0)
    documents_created: Mapped[int] = mapped_column(Integer, default=0)
    issues_count: Mapped[int] = mapped_column(Integer, default=0)
    policy_skips_count: Mapped[int] = mapped_column(Integer, default=0)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    retry_of_run_id: Mapped[str | None] = mapped_column(ForeignKey("runs.id"), nullable=True)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class RunIssue(Base):
    __tablename__ = "run_issues"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(Text)
    stage: Mapped[str] = mapped_column(String(32))
    code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    message: Mapped[str] = mapped_column(Text)
    retryable: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class CrawlEvent(Base):
    __tablename__ = "crawl_events"
    __table_args__ = (
        Index("ix_crawl_events_run_sequence", "run_id", "sequence", unique=True),
        Index("ix_crawl_events_created_at", "created_at"),
        Index("ix_crawl_events_trace_id", "trace_id"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    stage: Mapped[str] = mapped_column(String(48), index=True)
    outcome: Mapped[str] = mapped_column(String(32), index=True)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bytes_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    records_count: Mapped[int] = mapped_column(Integer, default=0)
    chunks_count: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retryable: Mapped[bool] = mapped_column(Boolean, default=False)
    trace_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    span_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (
        Index("ix_incidents_fingerprint_status", "fingerprint", "status", unique=True),
        Index("ix_incidents_last_seen_at", "last_seen_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str | None] = mapped_column(ForeignKey("organizations.id"), nullable=True, index=True)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"), nullable=True)
    run_id: Mapped[str | None] = mapped_column(ForeignKey("runs.id"), nullable=True)
    fingerprint: Mapped[str] = mapped_column(String(240))
    severity: Mapped[str] = mapped_column(String(24), default="warning", index=True)
    status: Mapped[str] = mapped_column(String(24), default="open", index=True)
    service: Mapped[str] = mapped_column(String(80), default="scrapal-worker")
    rule_id: Mapped[str] = mapped_column(String(120))
    summary: Mapped[str] = mapped_column(Text)
    remediation: Mapped[str] = mapped_column(Text, default="")
    occurrence_count: Mapped[int] = mapped_column(Integer, default=1)
    trace_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (Index("ix_documents_collection_canonical", "collection_id", "canonical_url"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    collection_id: Mapped[str] = mapped_column(ForeignKey("collections.id"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    canonical_url: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    media_type: Mapped[str] = mapped_column(String(120), default="text/html")
    published: Mapped[bool] = mapped_column(Boolean, default=True)
    current_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    __table_args__ = (Index("ix_document_versions_hash", "document_id", "content_hash"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    run_id: Mapped[str | None] = mapped_column(ForeignKey("runs.id"), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64))
    text: Mapped[str] = mapped_column(Text)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    artifact_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


embedding_type = JSON().with_variant(Vector(768), "postgresql")


class Chunk(Base):
    __tablename__ = "chunks"
    __table_args__ = (
        Index("ix_chunks_document_version_position", "document_version_id", "position"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    document_version_id: Mapped[str] = mapped_column(ForeignKey("document_versions.id"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    heading: Mapped[str] = mapped_column(Text, default="")
    content: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64), default="", index=True)
    token_count: Mapped[int] = mapped_column(Integer)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    section_path: Mapped[list[str]] = mapped_column(JSON, default=list)
    anchor: Mapped[str | None] = mapped_column(String(240), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    embedding: Mapped[list[float] | None] = mapped_column(embedding_type, nullable=True)
    embedding_profile: Mapped[str | None] = mapped_column(String(180), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class EmbeddingProfile(Base):
    __tablename__ = "embedding_profiles"
    __table_args__ = (Index("ix_embedding_profiles_identity", "provider", "model", "version", unique=True),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    provider: Mapped[str] = mapped_column(String(80), default="ollama")
    model: Mapped[str] = mapped_column(String(180))
    dimensions: Mapped[int] = mapped_column(Integer, default=768)
    normalization: Mapped[str] = mapped_column(String(32), default="l2")
    version: Mapped[str] = mapped_column(String(40), default="1")
    active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    healthy: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DocumentIndex(Base):
    __tablename__ = "document_indexes"
    __table_args__ = (
        Index("ix_document_indexes_version_profile", "document_version_id", "embedding_profile_id", unique=True),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    document_version_id: Mapped[str] = mapped_column(ForeignKey("document_versions.id"), index=True)
    embedding_profile_id: Mapped[str] = mapped_column(ForeignKey("embedding_profiles.id"), index=True)
    status: Mapped[IndexStatus] = mapped_column(Enum(IndexStatus), default=IndexStatus.waiting, index=True)
    content_hash: Mapped[str] = mapped_column(String(64))
    chunker_version: Mapped[str] = mapped_column(String(40), default="structure-v1")
    chunks_count: Mapped[int] = mapped_column(Integer, default=0)
    embeddings_count: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class ChunkEmbedding(Base):
    __tablename__ = "chunk_embeddings"
    __table_args__ = (
        Index("ix_chunk_embeddings_chunk_profile", "chunk_id", "embedding_profile_id", unique=True),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    chunk_id: Mapped[str] = mapped_column(ForeignKey("chunks.id", ondelete="CASCADE"), index=True)
    embedding_profile_id: Mapped[str] = mapped_column(ForeignKey("embedding_profiles.id"), index=True)
    embedding: Mapped[list[float]] = mapped_column(embedding_type)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class StructuredRecord(Base):
    __tablename__ = "structured_records"
    __table_args__ = (Index("ix_records_schema_external", "schema_name", "external_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    collection_id: Mapped[str] = mapped_column(ForeignKey("collections.id"), index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    schema_name: Mapped[str] = mapped_column(String(120), index=True)
    external_id: Mapped[str] = mapped_column(String(300))
    data: Mapped[dict[str, Any]] = mapped_column(JSON)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    published: Mapped[bool] = mapped_column(Boolean, default=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    collection_id: Mapped[str | None] = mapped_column(ForeignKey("collections.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(240), default="New conversation")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        Index(
            "ix_messages_conversation_request_role",
            "conversation_id",
            "request_id",
            "role",
            unique=True,
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(24))
    content: Mapped[str] = mapped_column(Text)
    request_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    citations: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class RetrievalRun(Base):
    __tablename__ = "retrieval_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    collection_id: Mapped[str | None] = mapped_column(ForeignKey("collections.id"), nullable=True, index=True)
    query: Mapped[str] = mapped_column(Text)
    mode: Mapped[str] = mapped_column(String(24), default="hybrid")
    include_drafts: Mapped[bool] = mapped_column(Boolean, default=False)
    filters_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    query_plan: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    structured_matches: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    lexical_candidates: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    vector_candidates: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    fused_candidates: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    context_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    exclusions_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    timings_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    trace_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class MessageGeneration(Base):
    __tablename__ = "message_generations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    user_message_id: Mapped[str] = mapped_column(ForeignKey("messages.id"))
    assistant_message_id: Mapped[str | None] = mapped_column(ForeignKey("messages.id"), nullable=True)
    retrieval_run_id: Mapped[str | None] = mapped_column(ForeignKey("retrieval_runs.id"), nullable=True)
    status: Mapped[GenerationStatus] = mapped_column(Enum(GenerationStatus), default=GenerationStatus.queued, index=True)
    answer: Mapped[str] = mapped_column(Text, default="")
    citations: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    unsupported_sentences: Mapped[list[str]] = mapped_column(JSON, default=list)
    model: Mapped[str | None] = mapped_column(String(180), nullable=True)
    embedding_profile_id: Mapped[str | None] = mapped_column(ForeignKey("embedding_profiles.id"), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class GenerationEvent(Base):
    __tablename__ = "generation_events"
    __table_args__ = (Index("ix_generation_events_generation_sequence", "generation_id", "sequence", unique=True),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    generation_id: Mapped[str] = mapped_column(ForeignKey("message_generations.id", ondelete="CASCADE"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(48), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    collection_id: Mapped[str | None] = mapped_column(ForeignKey("collections.id"), nullable=True)
    embedding_profile_id: Mapped[str] = mapped_column(ForeignKey("embedding_profiles.id"), index=True)
    dataset: Mapped[str] = mapped_column(String(180), default="greenwich-rag-v1")
    status: Mapped[EvaluationStatus] = mapped_column(Enum(EvaluationStatus), default=EvaluationStatus.queued, index=True)
    metrics_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    results_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ActionProposal(Base):
    __tablename__ = "action_proposals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    conversation_id: Mapped[str | None] = mapped_column(
        ForeignKey("conversations.id"), nullable=True
    )
    action_type: Mapped[str] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(240))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    rationale: Mapped[str] = mapped_column(Text)
    risk: Mapped[str] = mapped_column(String(32), default="low")
    status: Mapped[ProposalStatus] = mapped_column(
        Enum(ProposalStatus), default=ProposalStatus.pending
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
