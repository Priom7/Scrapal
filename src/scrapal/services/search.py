import math
import re
from collections import defaultdict
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from scrapal.models import Chunk, Document
from scrapal.schemas import SearchHit
from scrapal.services.ollama import OllamaService, OllamaUnavailable

_CITATION = re.compile(r"\[\d+\]")
_STOP_WORDS = {
    "about",
    "after",
    "also",
    "and",
    "are",
    "available",
    "based",
    "for",
    "from",
    "has",
    "have",
    "including",
    "into",
    "its",
    "of",
    "on",
    "or",
    "that",
    "the",
    "their",
    "to",
    "with",
}


def cosine(left: list[float], right: list[float]) -> float:
    numerator = sum(a * b for a, b in zip(left, right, strict=False))
    denominator = math.sqrt(sum(a * a for a in left)) * math.sqrt(sum(b * b for b in right))
    return numerator / denominator if denominator else 0.0


def cite_uncited_sentences(answer: str, hits: list[SearchHit]) -> str:
    """Attach the closest retrieved source when a small local model omits citation markers."""
    if not hits:
        return answer
    source_terms = [
        set(re.findall(r"[a-z0-9]+", f"{hit.title} {hit.heading} {hit.excerpt}".lower()))
        - _STOP_WORDS
        for hit in hits
    ]
    grounded: list[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+", answer.strip()):
        if not sentence or _CITATION.search(sentence):
            grounded.append(sentence)
            continue
        terms = set(re.findall(r"[a-z0-9]+", sentence.lower())) - _STOP_WORDS
        scores = [len(terms & candidate) for candidate in source_terms]
        best = max(range(len(scores)), key=scores.__getitem__)
        if scores[best] == 0:
            grounded.append(sentence)
            continue
        punctuation = sentence[-1] if sentence[-1] in ".!?" else ""
        body = sentence[:-1] if punctuation else sentence
        grounded.append(f"{body.rstrip()} [{best + 1}]{punctuation}")
    return " ".join(grounded)


async def hybrid_search(
    session: AsyncSession,
    query: str,
    collection_id: str | None,
    mode: str,
    limit: int = 10,
    *,
    ollama_service: OllamaService | None = None,
    ollama_locked: bool = False,
) -> list[SearchHit]:
    terms = [term for term in re.findall(r"[\w'-]+", query.lower()) if len(term) > 2]
    filters: list[Any] = [Document.published.is_(True)]
    if collection_id:
        filters.append(Document.collection_id == collection_id)
    statement = (
        select(Chunk, Document).join(Document, Chunk.document_id == Document.id).where(*filters)
    )
    if mode in {"full_text", "hybrid"} and terms:
        statement = statement.where(or_(*(Chunk.content.ilike(f"%{term}%") for term in terms)))
    candidates = [(row[0], row[1]) for row in (await session.execute(statement.limit(200))).all()]
    lexical = sorted(
        candidates,
        key=lambda row: sum(row[0].content.lower().count(term) for term in terms),
        reverse=True,
    )
    vector: list[tuple[Chunk, Document]] = []
    if mode in {"semantic", "hybrid"}:
        try:
            # Release the embedding runner before loading the chat model. Keeping both resident can
            # stall local Ollama installations with constrained unified memory.
            ollama = ollama_service or OllamaService()
            query_embedding = (
                await ollama.embed(
                    [query],
                    keep_alive=0,
                    locked=ollama_locked,
                    unload_chat=True,
                )
            )[0]
            vector = sorted(
                [row for row in candidates if row[0].embedding],
                key=lambda row: cosine(query_embedding, list(row[0].embedding or [])),
                reverse=True,
            )
        except OllamaUnavailable:
            if mode == "semantic":
                return []
    ranks: dict[str, float] = defaultdict(float)
    for result_list in (lexical, vector):
        for rank, (chunk, _) in enumerate(result_list[:50], start=1):
            ranks[chunk.id] += 1 / (60 + rank)
    by_id = {chunk.id: (chunk, document) for chunk, document in candidates}
    ordered = sorted(ranks, key=lambda chunk_id: ranks[chunk_id], reverse=True)[:limit]
    return [
        SearchHit(
            chunk_id=chunk_id,
            document_id=by_id[chunk_id][1].id,
            title=by_id[chunk_id][1].title,
            url=by_id[chunk_id][1].canonical_url,
            heading=by_id[chunk_id][0].heading,
            excerpt=by_id[chunk_id][0].content[:500],
            score=round(ranks[chunk_id], 6),
            page_number=by_id[chunk_id][0].page_number,
        )
        for chunk_id in ordered
    ]
