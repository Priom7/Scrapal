from __future__ import annotations

import json
from datetime import UTC, datetime
from importlib.resources import files

from scrapal.db import SessionLocal
from scrapal.models import EvaluationRun, EvaluationStatus
from scrapal.services.ollama import OllamaService
from scrapal.services.search import retrieve_knowledge, terms


async def run_evaluation(evaluation_id: str) -> None:
    async with SessionLocal() as session:
        evaluation = await session.get(EvaluationRun, evaluation_id)
        if not evaluation or evaluation.status == EvaluationStatus.running:
            return
        evaluation.status = EvaluationStatus.running
        evaluation.started_at = datetime.now(UTC)
        await session.commit()
        try:
            resource = files("scrapal").joinpath("data", f"{evaluation.dataset}.jsonl")
            cases = [json.loads(line) for line in resource.read_text().splitlines() if line.strip()]
            results: list[dict[str, object]] = []
            answerable_hits = 0
            unanswerable_abstentions = 0
            citation_supported = 0
            answerable_count = sum(bool(case["answerable"]) for case in cases)
            unanswerable_count = len(cases) - answerable_count
            ollama = OllamaService()
            for case in cases:
                result = await retrieve_knowledge(
                    session,
                    case["question"],
                    organization_id=evaluation.organization_id,
                    collection_id=evaluation.collection_id,
                    mode="hybrid",
                    limit=5,
                    embedding_profile_id=evaluation.embedding_profile_id,
                    ollama_service=ollama,
                )
                candidate_text = " ".join(hit.excerpt for hit in result.hits)
                expected = set(case.get("expected_terms", []))
                matched = expected <= terms(candidate_text) if expected else not result.hits
                if case["answerable"] and matched:
                    answerable_hits += 1
                    citation_supported += 1
                if not case["answerable"] and not result.hits and not result.structured_matches:
                    unanswerable_abstentions += 1
                results.append(
                    {
                        "id": case["id"],
                        "category": case["category"],
                        "answerable": case["answerable"],
                        "matched": matched,
                        "top_chunks": [hit.chunk_id for hit in result.hits],
                    }
                )
            evaluation.metrics_json = {
                "case_count": len(cases),
                "retrieval_recall_at_5": round(answerable_hits / max(answerable_count, 1), 4),
                "citation_correctness": round(citation_supported / max(answerable_hits, 1), 4),
                "unanswerable_abstention": round(
                    unanswerable_abstentions / max(unanswerable_count, 1), 4
                ),
            }
            evaluation.results_json = results
            evaluation.status = EvaluationStatus.completed
            evaluation.finished_at = datetime.now(UTC)
        except Exception as exc:
            evaluation.status = EvaluationStatus.failed
            evaluation.error = f"{type(exc).__name__}: evaluation failed"[:500]
            evaluation.finished_at = datetime.now(UTC)
        await session.commit()
