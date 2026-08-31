from datetime import datetime
from typing import Any, Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field

from scrapal.models import ProposalStatus, RunStatus, SourceKind


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
