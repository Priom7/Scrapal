from datetime import datetime
from typing import Any, Literal, get_args

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator

from scrapal.models import (
    BlueprintStatus,
    EvaluationStatus,
    GenerationStatus,
    IndexStatus,
    ProposalStatus,
    RecordStatus,
    RunStatus,
    SourceKind,
)


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


class CrawlBlueprintPreview(BaseModel):
    collection_id: str
    name: str = Field(min_length=1, max_length=180)
    start_url: AnyHttpUrl
    objective: str = Field(min_length=12, max_length=2000)
    domain_pack: Literal["generic", "university"] = "generic"
    required_fields: list[str] = Field(default_factory=list, max_length=40)
    max_pages: int = Field(default=250, ge=1, le=10_000)


class CrawlBlueprintUpdate(BaseModel):
    include_patterns: list[str] = Field(default_factory=list, max_length=30)
    exclude_patterns: list[str] = Field(default_factory=list, max_length=30)
    max_pages: int = Field(ge=1, le=10_000)
    max_depth: int = Field(ge=0, le=10)


class CrawlBlueprintOut(ORMModel):
    id: str
    collection_id: str
    source_id: str | None
    name: str
    start_url: str
    objective: str
    domain_pack: str
    required_fields: list[str]
    suggested_config: dict[str, Any]
    discovery_json: dict[str, Any]
    status: BlueprintStatus
    version: int
    approved_at: datetime | None
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


# A local 7B model will happily put the whole question into a slot when it cannot
# find a real constraint. Every slot is therefore a closed vocabulary: the schema
# advertises the allowed values to the planner, and anything outside them is
# dropped rather than carried into retrieval as a filter.
Intent = Literal["research", "compare", "eligibility", "cost", "application", "greeting"]
Level = Literal["undergraduate", "postgraduate"]
Residency = Literal["home", "international"]
StudyMode = Literal["full-time", "part-time", "distance learning"]
Month = Literal[
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

MONTHS: tuple[str, ...] = get_args(Month)

_LEVEL_SYNONYMS = {
    "postgraduate": ("postgraduate", "postgrad", "pg", "masters", "master", "msc", "ma",
                     "mba", "mres", "pgdip", "pgcert", "phd", "doctorate"),
    "undergraduate": ("undergraduate", "undergrad", "ug", "bachelors", "bachelor",
                      "bsc", "ba", "beng", "llb", "foundation"),
}
_RESIDENCY_SYNONYMS = {
    "international": ("international", "overseas", "non-uk", "foreign"),
    "home": ("home", "domestic", "uk", "united kingdom", "eu"),
}
_STUDY_MODE_SYNONYMS = {
    "full-time": ("full-time", "full time", "fulltime"),
    "part-time": ("part-time", "part time", "parttime"),
    "distance learning": ("distance learning", "distance", "online", "remote"),
}


def _normalize(value: Any, synonyms: dict[str, tuple[str, ...]]) -> str | None:
    """Map a free-text slot onto its canonical value, or drop it."""
    if not isinstance(value, str):
        return None
    candidate = value.strip().lower()
    if not candidate or len(candidate) > 60:
        return None
    for canonical, aliases in synonyms.items():
        if any(alias in candidate for alias in aliases):
            return canonical
    return None


class QueryPlan(BaseModel):
    intent: Intent = "research"
    entities: list[str] = Field(default_factory=list, max_length=8)
    requested_fields: list[str] = Field(default_factory=list, max_length=8)
    # Emitted after the entities so the reformulation is written in terms of
    # referents the planner has already resolved. Empty means "search the
    # question as asked".
    search_query: str = ""
    level: Level | None = None
    residency: Residency | None = None
    intake: Month | None = None
    study_mode: StudyMode | None = None

    @field_validator("intent", mode="before")
    @classmethod
    def _valid_intent(cls, value: Any) -> Any:
        if isinstance(value, str) and value.strip().lower() in get_args(Intent):
            return value.strip().lower()
        return "research"

    @field_validator("entities", "requested_fields", mode="before")
    @classmethod
    def _clean_terms(cls, value: Any) -> Any:
        if not isinstance(value, list):
            return value
        cleaned = [item.strip() for item in value if isinstance(item, str) and item.strip()]
        return cleaned[:8]

    @field_validator("search_query", mode="before")
    @classmethod
    def _clean_search_query(cls, value: Any) -> str:
        if not isinstance(value, str):
            return ""
        candidate = " ".join(value.split())
        # A reformulation is a search query, not a restated conversation.
        return candidate[:200] if len(candidate) <= 200 else ""

    @field_validator("level", mode="before")
    @classmethod
    def _valid_level(cls, value: Any) -> str | None:
        return _normalize(value, _LEVEL_SYNONYMS)

    @field_validator("residency", mode="before")
    @classmethod
    def _valid_residency(cls, value: Any) -> str | None:
        return _normalize(value, _RESIDENCY_SYNONYMS)

    @field_validator("study_mode", mode="before")
    @classmethod
    def _valid_study_mode(cls, value: Any) -> str | None:
        return _normalize(value, _STUDY_MODE_SYNONYMS)

    @field_validator("intake", mode="before")
    @classmethod
    def _valid_intake(cls, value: Any) -> str | None:
        if not isinstance(value, str):
            return None
        candidate = value.strip().lower()
        # An intake is a month. A restated question is not, and must not become
        # a filter that silently excludes every published record.
        if not candidate or len(candidate) > 20:
            return None
        for month in MONTHS:
            if candidate.startswith(month[:3].lower()):
                return month
        return None


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
    generated_answer: str | None
    citation_results: list[dict[str, Any]]
    abstention_reason: str | None
    answer_model: str | None
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


class InstitutionOut(ORMModel):
    id: str
    name: str
    slug: str
    domain: str
    country_code: str | None
    city: str | None
    website_url: str | None
    logo_url: str | None
    banner_url: str | None
    brand_color: str | None


class StructuredRecordOut(ORMModel):
    id: str
    institution_id: str | None = None
    schema_name: str
    external_id: str
    data: dict[str, Any]
    evidence: dict[str, Any]
    confidence: float
    published: bool
    status: RecordStatus
    validation_json: dict[str, Any]
    extractor_version: str
    revision: int
    reviewed_at: datetime | None
    reviewed_by: str | None
    published_at: datetime | None
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
