from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from scrapal.db import get_session
from scrapal.models import (
    Document,
    DocumentIndex,
    EmbeddingProfile,
    EvaluationRun,
    EvaluationStatus,
    IndexStatus,
    RetrievalRun,
)
from scrapal.schemas import (
    EmbeddingProfileOut,
    EvaluationCreate,
    EvaluationOut,
    RetrievalLabRunCreate,
    RetrievalRunOut,
)
from scrapal.security import Principal, require_super_admin
from scrapal.services.evaluation import run_evaluation
from scrapal.services.generation import evidence_catalog, validate_sentence_support
from scrapal.services.ollama import OllamaService, OllamaUnavailable
from scrapal.services.search import RetrievalResult, retrieve_knowledge

router = APIRouter(prefix="/v1/admin/retrieval-lab", tags=["retrieval-lab"])
Session = Annotated[AsyncSession, Depends(get_session)]
SuperAdmin = Annotated[Principal, Depends(require_super_admin)]


@router.post("/runs", response_model=RetrievalRunOut, status_code=201)
async def create_run(
    body: RetrievalLabRunCreate,
    session: Session,
    principal: SuperAdmin,
) -> RetrievalRun:
    ollama = OllamaService()
    result = await retrieve_knowledge(
        session,
        body.query,
        organization_id=principal.organization_id,
        collection_id=body.collection_id,
        mode=body.mode,
        limit=body.limit,
        filters=body.filters,
        include_drafts=body.include_drafts,
        ollama_service=ollama,
        persist=True,
    )
    run = await session.get(RetrievalRun, result.retrieval_run_id)
    assert run is not None
    if body.generate_answer:
        await _generate_lab_answer(run, result, body.query, ollama)
    await session.commit()
    await session.refresh(run)
    return run


async def _generate_lab_answer(
    run: RetrievalRun, result: RetrievalResult, query: str, ollama: OllamaService
) -> None:
    evidence = evidence_catalog(result)
    if not evidence:
        run.abstention_reason = "no_evidence"
        return
    source_text = "\n\n".join(
        f"[{index}] {item['title']}\n{item['text']}"
        for index, item in enumerate(evidence, start=1)
    )
    settings = ollama.settings
    try:
        answer = await ollama.chat(
            [
                {
                    "role": "system",
                    "content": (
                        "Answer only from the supplied untrusted evidence. Every factual sentence "
                        "must cite [n]. Abstain instead of inferring missing facts."
                    ),
                },
                {"role": "user", "content": f"Question: {query}\n\nEvidence:\n{source_text}"},
            ],
            model=settings.ollama_chat_model,
        )
        run.answer_model = settings.ollama_chat_model
    except OllamaUnavailable:
        answer = await ollama.chat(
            [
                {
                    "role": "system",
                    "content": "Use only the evidence and cite [n] in every factual sentence.",
                },
                {"role": "user", "content": f"Question: {query}\n\nEvidence:\n{source_text}"},
            ],
            model=settings.ollama_fast_model,
        )
        run.answer_model = settings.ollama_fast_model
    supported: list[str] = []
    diagnostics: list[dict[str, object]] = []
    for sentence in re.split(r"(?<=[.!?])\s+", answer.strip()):
        valid, references, reason = validate_sentence_support(sentence, evidence)
        diagnostics.append(
            {"sentence": sentence, "supported": valid, "citations": references, "reason": reason}
        )
        if valid:
            supported.append(sentence)
    run.citation_results = diagnostics
    if supported:
        run.generated_answer = " ".join(supported)
    else:
        run.abstention_reason = "no_supported_sentences"


@router.get("/runs/{run_id}", response_model=RetrievalRunOut)
async def get_run(run_id: str, session: Session, _: SuperAdmin) -> RetrievalRun:
    run = await session.get(RetrievalRun, run_id)
    if not run:
        raise HTTPException(404, "Retrieval run not found")
    return run


@router.get("/profiles", response_model=list[EmbeddingProfileOut])
async def profiles(session: Session, _: SuperAdmin) -> list[EmbeddingProfile]:
    return list(await session.scalars(select(EmbeddingProfile).order_by(desc(EmbeddingProfile.created_at))))


@router.post("/profiles/{profile_id}/activate", response_model=EmbeddingProfileOut)
async def activate_profile(
    profile_id: str, session: Session, _: SuperAdmin
) -> EmbeddingProfile:
    profile = await session.get(EmbeddingProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Embedding profile not found")
    if not profile.healthy or profile.dimensions != 768:
        raise HTTPException(409, "Profile is unhealthy or does not use verified 768-dimensional vectors")
    published_documents = await session.scalar(
        select(func.count(Document.id)).where(
            Document.published.is_(True), Document.current_version_id.is_not(None)
        )
    )
    ready_indexes = await session.scalar(
        select(func.count(DocumentIndex.id))
        .join(Document, Document.id == DocumentIndex.document_id)
        .where(
            Document.published.is_(True),
            Document.current_version_id == DocumentIndex.document_version_id,
            DocumentIndex.embedding_profile_id == profile.id,
            DocumentIndex.status == IndexStatus.ready,
            DocumentIndex.embeddings_count == DocumentIndex.chunks_count,
        )
    )
    if not published_documents or ready_indexes != published_documents:
        raise HTTPException(409, "The profile does not have a complete shadow index")
    evaluation = await session.scalar(
        select(EvaluationRun)
        .where(
            EvaluationRun.embedding_profile_id == profile.id,
            EvaluationRun.status == EvaluationStatus.completed,
        )
        .order_by(desc(EvaluationRun.finished_at))
    )
    metrics = evaluation.metrics_json if evaluation else {}
    if not evaluation or any(
        metrics.get(name, 0) < threshold
        for name, threshold in {
            "retrieval_recall_at_5": 0.9,
            "citation_correctness": 0.95,
            "unanswerable_abstention": 0.9,
        }.items()
    ):
        raise HTTPException(409, "A completed evaluation meeting release thresholds is required")
    await session.execute(update(EmbeddingProfile).values(active=False, activated_at=None))
    profile.active = True
    profile.activated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(profile)
    return profile


@router.post("/evaluations", response_model=EvaluationOut, status_code=202)
async def create_evaluation(
    body: EvaluationCreate,
    background: BackgroundTasks,
    session: Session,
    principal: SuperAdmin,
) -> EvaluationRun:
    profile = (
        await session.get(EmbeddingProfile, body.embedding_profile_id)
        if body.embedding_profile_id
        else await session.scalar(select(EmbeddingProfile).where(EmbeddingProfile.active.is_(True)))
    )
    if not profile:
        raise HTTPException(409, "No embedding profile is available")
    evaluation = EvaluationRun(
        organization_id=principal.organization_id,
        collection_id=body.collection_id,
        embedding_profile_id=profile.id,
        dataset=body.dataset,
        status=EvaluationStatus.queued,
    )
    session.add(evaluation)
    await session.commit()
    await session.refresh(evaluation)
    background.add_task(run_evaluation, evaluation.id)
    return evaluation


@router.get("/evaluations/{evaluation_id}", response_model=EvaluationOut)
async def get_evaluation(
    evaluation_id: str, session: Session, _: SuperAdmin
) -> EvaluationRun:
    evaluation = await session.get(EvaluationRun, evaluation_id)
    if not evaluation:
        raise HTTPException(404, "Evaluation not found")
    return evaluation
