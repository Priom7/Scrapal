from datetime import datetime
from typing import Any, Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field

from scrapal.models import EvaluationStatus, GenerationStatus, IndexStatus, ProposalStatus, RunStatus, SourceKind


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    description: str = ""
    settings: dict[str, Any] = Field(default_factory=dict)


class CollectionOut(ORMModel):
    id: str
    name: str
    description: str
    settings: dict[str, Any]
    created_at: datetime


class SourceCreate(BaseModel):
    collection_id: str
    name: str = Field(min_length=1, max_length=180)
    kind: SourceKind
    url: AnyHttpUrl | None = None
    config: dict[str, Any] = Field(default_factory=dict)


class SourceOut(ORMModel):
    id: str
    collection_id: str
    name: str
    kind: SourceKind
    url: str | None
    config: dict[str, Any]
    enabled: bool
    last_run_at: datetime | None
    created_at: datetime


class RunCreate(BaseModel):
    source_id: str
    mode: Literal["incremental", "full"] = "incremental"


class RunOut(ORMModel):
    id: str
    source_id: str
    status: RunStatus
    mode: str
    pages_discovered: int
    pages_processed: int
    documents_created: int
    issues_count: int
    policy_skips_count: int
    cancel_requested: bool
    retry_of_run_id: str | None
    last_heartbeat_at: datetime | None
    error: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime


class RunIssueOut(ORMModel):
    id: str
    url: str
    stage: str
    code: str | None
    message: str
    retryable: bool
    created_at: datetime


class RunDetailOut(RunOut):
    source_name: str
    issues: list[RunIssueOut] = Field(default_factory=list)


class DocumentOut(ORMModel):
    id: str
    collection_id: str
    source_id: str
    canonical_url: str
    title: str
    media_type: str
    published: bool
    current_version_id: str | None
    created_at: datetime
    updated_at: datetime


class DocumentVersionOut(ORMModel):
    id: str
    document_id: str
    content_hash: str
    metadata_json: dict[str, Any]
    artifact_path: str | None
    created_at: datetime


class SearchHit(BaseModel):
    chunk_id: str
    document_id: str
    title: str
    url: str
    heading: str
    excerpt: str
    score: float
    page_number: int | None = None
    document_version_id: str | None = None
    section_path: list[str] = Field(default_factory=list)
    anchor: str | None = None
    lexical_score: float = 0
    vector_score: float = 0
    structured_score: float = 0
    fused_score: float = 0


class SearchResponse(BaseModel):
    query: str
    mode: str
    hits: list[SearchHit]


class ConversationCreate(BaseModel):
    collection_id: str | None = None
    title: str = "New conversation"


class ConversationOut(ORMModel):
    id: str
    collection_id: str | None
    title: str
    created_at: datetime


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=20_000)
    request_id: str | None = Field(default=None, min_length=8, max_length=36)


class MessageOut(ORMModel):
    id: str
    conversation_id: str
    role: str
    content: str
    citations: list[dict[str, Any]]
    created_at: datetime


class QueryPlan(BaseModel):
    intent: str = "research"
    entities: list[str] = Field(default_factory=list)
    requested_fields: list[str] = Field(default_factory=list)
    level: str | None = None
    residency: str | None = None
    intake: str | None = None
    study_mode: str | None = None


class RetrievalFilters(BaseModel):
    source_id: str | None = None
    level: str | None = None
    residency: str | None = None
    intake: str | None = None
    study_mode: str | None = None


class GenerationAccepted(BaseModel):
    id: str
    conversation_id: str
    status: GenerationStatus
    created_at: datetime


class GenerationOut(ORMModel):
    id: str
    conversation_id: str
    retrieval_run_id: str | None
    status: GenerationStatus
    answer: str
    citations: list[dict[str, Any]]
    unsupported_sentences: list[str]
    model: str | None
    error: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime


class EmbeddingProfileOut(ORMModel):
    id: str
    provider: str
    model: str
    dimensions: int
    normalization: str
    version: str
    active: bool
    healthy: bool
    created_at: datetime
    activated_at: datetime | None


class RetrievalLabRunCreate(BaseModel):
    query: str = Field(min_length=2, max_length=20_000)
    collection_id: str | None = None
    mode: Literal["full_text", "semantic", "hybrid"] = "hybrid"
    include_drafts: bool = False
    filters: RetrievalFilters = Field(default_factory=RetrievalFilters)
    limit: int = Field(default=10, ge=1, le=50)
    generate_answer: bool = False


class RetrievalRunOut(ORMModel):
    id: str
    organization_id: str
    collection_id: str | None
    query: str
    mode: str
    include_drafts: bool
    filters_json: dict[str, Any]
    query_plan: dict[str, Any]
    structured_matches: list[dict[str, Any]]
    lexical_candidates: list[dict[str, Any]]
    vector_candidates: list[dict[str, Any]]
    fused_candidates: list[dict[str, Any]]
    context_json: list[dict[str, Any]]
    exclusions_json: list[dict[str, Any]]
    timings_json: dict[str, Any]
    trace_id: str | None
    created_at: datetime


class DocumentIndexOut(ORMModel):
    id: str
    document_id: str
    document_version_id: str
    embedding_profile_id: str
    status: IndexStatus
    chunks_count: int
    embeddings_count: int
    attempts: int
    error: str | None


class EvaluationCreate(BaseModel):
    collection_id: str | None = None
    embedding_profile_id: str | None = None
    dataset: str = "greenwich-rag-v1"


class EvaluationOut(ORMModel):
    id: str
    collection_id: str | None
    embedding_profile_id: str
    dataset: str
    status: EvaluationStatus
    metrics_json: dict[str, Any]
    results_json: list[dict[str, Any]]
    error: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime


class ActionProposalCreate(BaseModel):
    conversation_id: str | None = None
    action_type: Literal["crawl", "schedule_change", "connector_change", "publication_change"]
    title: str
    payload: dict[str, Any]
    rationale: str
    risk: Literal["low", "medium", "high"] = "low"


class ActionProposalOut(ORMModel):
    id: str
    conversation_id: str | None
    action_type: str
    title: str
    payload: dict[str, Any]
    rationale: str
    risk: str
    status: ProposalStatus
    expires_at: datetime
    created_at: datetime


class ProposalEdit(BaseModel):
    payload: dict[str, Any]
    rationale: str | None = None


class StructuredRecordOut(ORMModel):
    id: str
    schema_name: str
    external_id: str
    data: dict[str, Any]
    evidence: dict[str, Any]
    confidence: float
    published: bool
    revision: int
    updated_at: datetime


class CrawlEventOut(ORMModel):
    id: str
    organization_id: str
    source_id: str
    run_id: str
    sequence: int
    stage: str
    outcome: str
    url: str | None
    attempt: int
    duration_ms: float | None
    status_code: int | None
    bytes_count: int | None
    records_count: int
    chunks_count: int
    error_code: str | None
    error_message: str | None
    retryable: bool
    trace_id: str | None
    span_id: str | None
    metadata_json: dict[str, Any]
    created_at: datetime


class IncidentOut(ORMModel):
    id: str
    organization_id: str | None
    source_id: str | None
    run_id: str | None
    severity: str
    status: str
    service: str
    rule_id: str
    summary: str
    remediation: str
    occurrence_count: int
    trace_id: str | None
    first_seen_at: datetime
    last_seen_at: datetime
    acknowledged_at: datetime | None
    resolved_at: datetime | None
    metadata_json: dict[str, Any]
