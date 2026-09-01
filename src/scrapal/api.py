import asyncio
import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Header,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import StreamingResponse
from redis.asyncio import Redis
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from scrapal.config import get_settings
from scrapal.db import SessionLocal, get_session
from scrapal.extensions import extension_catalog
from scrapal.jobs import generate_task, ingest_task
from scrapal.models import (
    ActionProposal,
    Collection,
    Conversation,
    Document,
    DocumentVersion,
    GenerationEvent,
    GenerationStatus,
    Message,
    MessageGeneration,
    ProposalStatus,
    Role,
    Run,
    RunIssue,
    RunStatus,
    Source,
    SourceKind,
    StructuredRecord,
)
from scrapal.schemas import (
    ActionProposalCreate,
    ActionProposalOut,
    CollectionCreate,
    CollectionOut,
    ConversationCreate,
    ConversationOut,
    DocumentOut,
    DocumentVersionOut,
    GenerationAccepted,
    GenerationOut,
    MessageCreate,
    ProposalEdit,
    RetrievalFilters,
    RunCreate,
    RunDetailOut,
    RunIssueOut,
    RunOut,
    SearchResponse,
    SourceCreate,
    SourceOut,
    StructuredRecordOut,
)
from scrapal.security import Principal, get_principal, require_editor
from scrapal.services.generation import generate_answer
from scrapal.services.ingestion import ingest_run, ingest_upload
from scrapal.services.ollama import OllamaService
from scrapal.services.search import hybrid_search

router = APIRouter(prefix="/v1")
Session = Annotated[AsyncSession, Depends(get_session)]
Viewer = Annotated[Principal, Depends(get_principal)]
Editor = Annotated[Principal, Depends(require_editor)]


async def owned_collection(
    session: AsyncSession, collection_id: str, principal: Principal
) -> Collection:
    collection = await session.scalar(
        select(Collection).where(
            Collection.id == collection_id,
            Collection.organization_id == principal.organization_id,
        )
    )
    if not collection:
        raise HTTPException(404, "Collection not found")
    return collection


async def owned_run(session: AsyncSession, run_id: str, principal: Principal) -> tuple[Run, Source]:
    result = await session.execute(
        select(Run, Source)
        .join(Source, Source.id == Run.source_id)
        .join(Collection, Collection.id == Source.collection_id)
        .where(Run.id == run_id, Collection.organization_id == principal.organization_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(404, "Run not found")
    return row[0], row[1]


async def run_detail(session: AsyncSession, run: Run, source: Source) -> RunDetailOut:
    issues = list(
        await session.scalars(
            select(RunIssue)
            .where(RunIssue.run_id == run.id)
            .order_by(desc(RunIssue.created_at))
            .limit(100)
        )
    )
    return RunDetailOut(
        **RunOut.model_validate(run).model_dump(),
        source_name=source.name,
        issues=[RunIssueOut.model_validate(issue) for issue in issues],
    )


async def recover_stale_runs(session: AsyncSession, organization_id: str) -> None:
    now_value = datetime.now(UTC)
    queued_before = now_value - timedelta(minutes=2)
    heartbeat_before = now_value - timedelta(minutes=5)
    stale = list(
        await session.scalars(
            select(Run)
            .join(Source)
            .join(Collection)
            .where(
                Collection.organization_id == organization_id,
                (
                    ((Run.status == RunStatus.queued) & (Run.created_at < queued_before))
                    | (
                        (Run.status == RunStatus.running)
                        & (
                            (
                                (Run.last_heartbeat_at.is_(None))
                                & (Run.started_at < heartbeat_before)
                            )
                            | (Run.last_heartbeat_at < heartbeat_before)
                        )
                    )
                ),
            )
        )
    )
    for run in stale:
        run.status = RunStatus.failed
        run.error = (
            "The worker stopped reporting progress for five minutes. You can retry the affected pages."
            if run.started_at
            else "The queued run was not accepted by a worker within two minutes."
        )
        run.finished_at = now_value
    if stale:
        await session.commit()


@router.get("/system", tags=["system"])
async def system_status(_: Viewer) -> dict:
    return {"extensions": extension_catalog(), "ollama": await OllamaService().health()}


@router.get("/collections", response_model=list[CollectionOut], tags=["collections"])
async def list_collections(session: Session, principal: Viewer) -> list[Collection]:
    return list(
        await session.scalars(
            select(Collection)
            .where(Collection.organization_id == principal.organization_id)
            .order_by(Collection.created_at)
        )
    )


@router.post("/collections", response_model=CollectionOut, status_code=201, tags=["collections"])
async def create_collection(
    body: CollectionCreate, session: Session, principal: Editor
) -> Collection:
    collection = Collection(organization_id=principal.organization_id, **body.model_dump())
    session.add(collection)
    await session.commit()
    await session.refresh(collection)
    return collection


@router.get("/sources", response_model=list[SourceOut], tags=["sources"])
async def list_sources(
    session: Session,
    principal: Viewer,
    collection_id: str | None = None,
) -> list[Source]:
    statement = (
        select(Source)
        .join(Collection)
        .where(Collection.organization_id == principal.organization_id)
    )
    if collection_id:
        statement = statement.where(Source.collection_id == collection_id)
    return list(await session.scalars(statement.order_by(desc(Source.created_at))))


@router.post("/sources", response_model=SourceOut, status_code=201, tags=["sources"])
async def create_source(body: SourceCreate, session: Session, principal: Editor) -> Source:
    await owned_collection(session, body.collection_id, principal)
    if body.kind != SourceKind.document and body.url is None:
        raise HTTPException(422, "A starting URL is required for web sources")
    data = body.model_dump(mode="json")
    source = Source(**data)
    session.add(source)
    await session.commit()
    await session.refresh(source)
    return source


@router.get("/runs", response_model=list[RunOut], tags=["runs"])
async def list_runs(
    session: Session, principal: Viewer, limit: int = Query(50, le=200)
) -> list[Run]:
    await recover_stale_runs(session, principal.organization_id)
    statement = (
        select(Run)
        .join(Source)
        .join(Collection)
        .where(Collection.organization_id == principal.organization_id)
        .order_by(desc(Run.created_at))
        .limit(limit)
    )
    return list(await session.scalars(statement))


@router.get("/runs/{run_id}", response_model=RunDetailOut, tags=["runs"])
async def get_run(run_id: str, session: Session, principal: Viewer) -> RunDetailOut:
    await recover_stale_runs(session, principal.organization_id)
    run, source = await owned_run(session, run_id, principal)
    return await run_detail(session, run, source)


@router.get("/runs/{run_id}/events", tags=["runs"])
async def run_events(run_id: str, session: Session, principal: Viewer) -> StreamingResponse:
    await owned_run(session, run_id, principal)
    organization_id = principal.organization_id

    async def stream() -> AsyncIterator[str]:
        fingerprint: str | None = None
        heartbeat = 0
        while True:
            async with SessionLocal() as event_session:
                result = await event_session.execute(
                    select(Run, Source)
                    .join(Source, Source.id == Run.source_id)
                    .join(Collection, Collection.id == Source.collection_id)
                    .where(Run.id == run_id, Collection.organization_id == organization_id)
                )
                row = result.one_or_none()
                if not row:
                    yield 'event: error\ndata: {"detail":"Run not found"}\n\n'
                    return
                detail = await run_detail(event_session, row[0], row[1])
            payload = detail.model_dump_json()
            current = f"{detail.status}:{detail.pages_processed}:{detail.pages_discovered}:{detail.documents_created}:{detail.issues_count}:{detail.policy_skips_count}:{detail.finished_at}"
            if current != fingerprint:
                yield f"event: progress\ndata: {payload}\n\n"
                fingerprint = current
                heartbeat = 0
            else:
                heartbeat += 1
                if heartbeat >= 20:
                    yield ": keep-alive\n\n"
                    heartbeat = 0
            if detail.status in {RunStatus.completed, RunStatus.failed, RunStatus.cancelled}:
                yield f"event: complete\ndata: {payload}\n\n"
                return
            await asyncio.sleep(0.5)

    return StreamingResponse(
        stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"}
    )


@router.post("/runs", response_model=RunOut, status_code=202, tags=["runs"])
async def create_run(
    body: RunCreate,
    background: BackgroundTasks,
    session: Session,
    principal: Editor,
) -> Run:
    source = await session.scalar(
        select(Source)
        .join(Collection)
        .where(
            Source.id == body.source_id,
            Collection.organization_id == principal.organization_id,
        )
    )
    if not source:
        raise HTTPException(404, "Source not found")
    await recover_stale_runs(session, principal.organization_id)
    existing = await session.scalar(
        select(Run)
        .where(Run.source_id == source.id, Run.status.in_([RunStatus.queued, RunStatus.running]))
        .order_by(desc(Run.created_at))
    )
    if existing:
        stale_before = datetime.now(UTC) - timedelta(minutes=2)
        if existing.status == RunStatus.queued and existing.created_at < stale_before:
            existing.status = RunStatus.failed
            existing.error = "The queued run was not accepted by a worker within two minutes. A replacement run was created."
            existing.finished_at = datetime.now(UTC)
            await session.commit()
        else:
            return existing
    run = Run(source_id=source.id, mode=body.mode)
    session.add(run)
    await session.commit()
    await session.refresh(run)
    if get_settings().celery_enabled:
        ingest_task.delay(run.id)
    else:
        background.add_task(ingest_run, run.id)
    return run


@router.post("/runs/{run_id}/cancel", response_model=RunOut, tags=["runs"])
async def cancel_run(run_id: str, session: Session, principal: Editor) -> Run:
    run, _ = await owned_run(session, run_id, principal)
    if run.status not in {RunStatus.queued, RunStatus.running}:
        raise HTTPException(409, "Only queued or running crawls can be cancelled")
    run.cancel_requested = True
    if run.status == RunStatus.queued:
        run.status = RunStatus.cancelled
        run.error = None
        run.finished_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(run)
    return run


@router.post("/runs/{run_id}/retry-issues", response_model=RunOut, status_code=202, tags=["runs"])
async def retry_run_issues(run_id: str, session: Session, principal: Editor) -> Run:
    previous, source = await owned_run(session, run_id, principal)
    if previous.status in {RunStatus.queued, RunStatus.running}:
        raise HTTPException(409, "Wait for the current crawl to finish or cancel it first")
    issue_exists = await session.scalar(
        select(RunIssue.id)
        .where(RunIssue.run_id == previous.id, RunIssue.stage != "policy")
        .limit(1)
    )
    if not issue_exists:
        raise HTTPException(409, "This run has no retryable page issues")
    run = Run(source_id=source.id, mode="retry", retry_of_run_id=previous.id)
    session.add(run)
    await session.commit()
    await session.refresh(run)
    if get_settings().celery_enabled:
        ingest_task.delay(run.id)
    else:
        asyncio.create_task(ingest_run(run.id))
    return run


@router.post(
    "/sources/{source_id}/upload", response_model=DocumentOut, status_code=201, tags=["sources"]
)
async def upload_document(
    source_id: str,
    session: Session,
    principal: Editor,
    file: UploadFile = File(...),
) -> Document:
    source = await session.scalar(
        select(Source)
        .join(Collection)
        .where(
            Source.id == source_id,
            Collection.organization_id == principal.organization_id,
            Source.kind == SourceKind.document,
        )
    )
    if not source:
        raise HTTPException(404, "Document source not found")
    content = await file.read(get_settings().max_upload_bytes + 1)
    if len(content) > get_settings().max_upload_bytes:
        raise HTTPException(413, "File exceeds the configured upload limit")
    return await ingest_upload(
        session,
        source,
        file.filename or "document",
        file.content_type or "application/octet-stream",
        content,
    )


@router.get("/documents", response_model=list[DocumentOut], tags=["documents"])
async def list_documents(
    session: Session,
    principal: Viewer,
    collection_id: str | None = None,
    limit: int = Query(100, le=500),
) -> list[Document]:
    statement = (
        select(Document)
        .join(Collection)
        .where(Collection.organization_id == principal.organization_id)
    )
    if collection_id:
        statement = statement.where(Document.collection_id == collection_id)
    return list(await session.scalars(statement.order_by(desc(Document.updated_at)).limit(limit)))


@router.get(
    "/documents/{document_id}/versions",
    response_model=list[DocumentVersionOut],
    tags=["documents"],
)
async def document_versions(
    document_id: str, session: Session, principal: Viewer
) -> list[DocumentVersion]:
    document = await session.scalar(
        select(Document)
        .join(Collection)
        .where(
            Document.id == document_id,
            Collection.organization_id == principal.organization_id,
        )
    )
    if not document:
        raise HTTPException(404, "Document not found")
    return list(
        await session.scalars(
            select(DocumentVersion)
            .where(DocumentVersion.document_id == document_id)
            .order_by(desc(DocumentVersion.created_at))
        )
    )


@router.get("/search", response_model=SearchResponse, tags=["knowledge"])
async def search(
    q: str,
    session: Session,
    principal: Viewer,
    collection_id: str | None = None,
    source_id: str | None = None,
    level: str | None = None,
    residency: str | None = None,
    intake: str | None = None,
    study_mode: str | None = None,
    mode: Literal["full_text", "semantic", "hybrid"] = "hybrid",
    limit: int = Query(10, ge=1, le=50),
) -> SearchResponse:
    if collection_id:
        await owned_collection(session, collection_id, principal)
    hits = await hybrid_search(
        session,
        q,
        collection_id,
        mode,
        limit,
        organization_id=principal.organization_id,
        filters=RetrievalFilters(
            source_id=source_id,
            level=level,
            residency=residency,
            intake=intake,
            study_mode=study_mode,
        ),
    )
    return SearchResponse(query=q, mode=mode, hits=hits)


@router.get("/records/{schema_name}", response_model=list[StructuredRecordOut], tags=["records"])
async def records(
    schema_name: str,
    session: Session,
    principal: Viewer,
    collection_id: str | None = None,
) -> list[StructuredRecord]:
    statement = (
        select(StructuredRecord)
        .join(Collection)
        .where(
            Collection.organization_id == principal.organization_id,
            StructuredRecord.schema_name == schema_name,
            StructuredRecord.published.is_(True),
        )
    )
    if collection_id:
        statement = statement.where(StructuredRecord.collection_id == collection_id)
    return list(await session.scalars(statement.order_by(StructuredRecord.external_id)))


@router.post("/conversations", response_model=ConversationOut, status_code=201, tags=["agent"])
async def create_conversation(
    body: ConversationCreate, session: Session, principal: Editor
) -> Conversation:
    if body.collection_id:
        await owned_collection(session, body.collection_id, principal)
    conversation = Conversation(organization_id=principal.organization_id, **body.model_dump())
    session.add(conversation)
    await session.commit()
    await session.refresh(conversation)
    return conversation


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=GenerationAccepted,
    status_code=202,
    tags=["agent"],
)
async def send_message(
    conversation_id: str,
    body: MessageCreate,
    background: BackgroundTasks,
    session: Session,
    principal: Editor,
) -> MessageGeneration:
    conversation = await session.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.organization_id == principal.organization_id,
        )
    )
    if not conversation:
        raise HTTPException(404, "Conversation not found")
    if body.request_id:
        existing_user = await session.scalar(
            select(Message).where(
                Message.conversation_id == conversation.id,
                Message.request_id == body.request_id,
                Message.role == "user",
            )
        )
    else:
        existing_user = None
    if existing_user:
        existing_generation = await session.scalar(
            select(MessageGeneration).where(MessageGeneration.user_message_id == existing_user.id)
        )
        if existing_generation:
            return existing_generation
        user_message = existing_user
    else:
        user_message = Message(
            conversation_id=conversation.id,
            role="user",
            content=body.content,
            request_id=body.request_id,
        )
        session.add(user_message)
        await session.flush()
    generation = MessageGeneration(
        conversation_id=conversation.id,
        user_message_id=user_message.id,
        status=GenerationStatus.queued,
    )
    session.add(generation)
    await session.commit()
    await session.refresh(generation)
    if get_settings().celery_enabled:
        generate_task.delay(generation.id)
    else:
        background.add_task(generate_answer, generation.id)
    return generation


@router.get(
    "/conversations/{conversation_id}/generations/{generation_id}",
    response_model=GenerationOut,
    tags=["agent"],
)
async def get_generation(
    conversation_id: str,
    generation_id: str,
    session: Session,
    principal: Viewer,
) -> MessageGeneration:
    generation = await session.scalar(
        select(MessageGeneration)
        .join(Conversation, Conversation.id == MessageGeneration.conversation_id)
        .where(
            MessageGeneration.id == generation_id,
            MessageGeneration.conversation_id == conversation_id,
            Conversation.organization_id == principal.organization_id,
        )
    )
    if not generation:
        raise HTTPException(404, "Generation not found")
    return generation


@router.get("/conversations/{conversation_id}/events", tags=["agent"])
async def conversation_events(
    conversation_id: str,
    session: Session,
    principal: Viewer,
    generation_id: str,
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
) -> StreamingResponse:
    conversation = await session.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.organization_id == principal.organization_id,
        )
    )
    if not conversation:
        raise HTTPException(404, "Conversation not found")
    generation = await session.scalar(
        select(MessageGeneration).where(
            MessageGeneration.id == generation_id,
            MessageGeneration.conversation_id == conversation_id,
        )
    )
    if not generation:
        raise HTTPException(404, "Generation not found")

    async def events() -> AsyncIterator[str]:
        cursor = int(last_event_id or 0)
        redis = Redis.from_url(get_settings().redis_url)
        try:
            if cursor:
                async with SessionLocal() as snapshot_session:
                    snapshot = await snapshot_session.get(MessageGeneration, generation_id)
                    if snapshot and snapshot.answer:
                        data = json.dumps(
                            {"answer": snapshot.answer, "citations": snapshot.citations},
                            separators=(",", ":"),
                        )
                        yield f"id: {cursor}\nevent: answer.snapshot\ndata: {data}\n\n"
            while True:
                async with SessionLocal() as event_session:
                    stored = list(
                        await event_session.scalars(
                            select(GenerationEvent)
                            .where(
                                GenerationEvent.generation_id == generation_id,
                                GenerationEvent.sequence > cursor,
                            )
                            .order_by(GenerationEvent.sequence)
                        )
                    )
                    for event in stored:
                        cursor = event.sequence
                        data = json.dumps(event.payload, separators=(",", ":"))
                        yield f"id: {cursor}\nevent: {event.event_type}\ndata: {data}\n\n"
                    current = await event_session.get(MessageGeneration, generation_id)
                    if current and current.status in {
                        GenerationStatus.completed,
                        GenerationStatus.abstained,
                        GenerationStatus.failed,
                    } and not stored:
                        break
                try:
                    await redis.xread(
                        {f"scrapal:generation:{generation_id}": f"{cursor}-0"},
                        block=15_000,
                        count=50,
                    )
                except Exception:
                    await asyncio.sleep(0.5)
                yield ": keep-alive\n\n"
        finally:
            await redis.aclose()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/action-proposals", response_model=list[ActionProposalOut], tags=["agent"])
async def proposals(session: Session, principal: Viewer) -> list[ActionProposal]:
    return list(
        await session.scalars(
            select(ActionProposal)
            .where(ActionProposal.organization_id == principal.organization_id)
            .order_by(desc(ActionProposal.created_at))
        )
    )


@router.post("/action-proposals", response_model=ActionProposalOut, status_code=201, tags=["agent"])
async def create_proposal(
    body: ActionProposalCreate, session: Session, principal: Editor
) -> ActionProposal:
    proposal = ActionProposal(
        organization_id=principal.organization_id,
        expires_at=datetime.now(UTC) + timedelta(days=7),
        **body.model_dump(),
    )
    session.add(proposal)
    await session.commit()
    await session.refresh(proposal)
    return proposal


@router.post(
    "/action-proposals/{proposal_id}/approve", response_model=ActionProposalOut, tags=["agent"]
)
async def approve_proposal(proposal_id: str, session: Session, principal: Editor) -> ActionProposal:
    proposal = await _proposal(session, proposal_id, principal)
    if principal.role != Role.admin:
        raise HTTPException(403, "Administrator approval required")
    if proposal.status != ProposalStatus.pending:
        raise HTTPException(409, "Proposal is no longer pending")
    proposal.status = ProposalStatus.approved
    if proposal.action_type == "crawl":
        source_id = proposal.payload.get("source_id")
        source = await session.get(Source, source_id)
        if not source:
            raise HTTPException(422, "Proposed source does not exist")
        run = Run(source_id=source.id, mode=proposal.payload.get("mode", "incremental"))
        session.add(run)
        await session.flush()
        proposal.status = ProposalStatus.executed
        if get_settings().celery_enabled:
            ingest_task.delay(run.id)
        else:
            asyncio.create_task(ingest_run(run.id))
    await session.commit()
    await session.refresh(proposal)
    return proposal


@router.post(
    "/action-proposals/{proposal_id}/edit", response_model=ActionProposalOut, tags=["agent"]
)
async def edit_proposal(
    proposal_id: str, body: ProposalEdit, session: Session, principal: Editor
) -> ActionProposal:
    proposal = await _proposal(session, proposal_id, principal)
    if proposal.status != ProposalStatus.pending:
        raise HTTPException(409, "Proposal is no longer pending")
    proposal.payload = body.payload
    if body.rationale is not None:
        proposal.rationale = body.rationale
    await session.commit()
    await session.refresh(proposal)
    return proposal


@router.post(
    "/action-proposals/{proposal_id}/reject", response_model=ActionProposalOut, tags=["agent"]
)
async def reject_proposal(proposal_id: str, session: Session, principal: Editor) -> ActionProposal:
    proposal = await _proposal(session, proposal_id, principal)
    proposal.status = ProposalStatus.rejected
    await session.commit()
    await session.refresh(proposal)
    return proposal


async def _proposal(
    session: AsyncSession, proposal_id: str, principal: Principal
) -> ActionProposal:
    proposal = await session.scalar(
        select(ActionProposal).where(
            ActionProposal.id == proposal_id,
            ActionProposal.organization_id == principal.organization_id,
        )
    )
    if not proposal:
        raise HTTPException(404, "Action proposal not found")
    return proposal
