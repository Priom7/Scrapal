from __future__ import annotations

import json
import os
import socket
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from scrapal.config import get_settings
from scrapal.models import Collection, CrawlEvent, Incident, Run, Source
from scrapal.telemetry import PAGES_TOTAL, STAGE_DURATION, logger, trace_ids


def sanitize_url(url: str | None) -> str | None:
    if not url:
        return None
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


async def record_crawl_event(
    session: AsyncSession,
    run: Run,
    source: Source,
    stage: str,
    outcome: str,
    *,
    url: str | None = None,
    attempt: int = 1,
    duration_ms: float | None = None,
    status_code: int | None = None,
    bytes_count: int | None = None,
    records_count: int = 0,
    chunks_count: int = 0,
    error_code: str | None = None,
    error_message: str | None = None,
    retryable: bool = False,
    metadata: dict[str, Any] | None = None,
) -> CrawlEvent:
    organization_id = await session.scalar(
        select(Collection.organization_id).where(Collection.id == source.collection_id)
    )
    if not organization_id:
        raise RuntimeError("Source collection has no organization")
    sequence = int(
        (await session.scalar(
            select(func.coalesce(func.max(CrawlEvent.sequence), 0)).where(
                CrawlEvent.run_id == run.id
            )
        )) or 0
    ) + 1
    trace_id, span_id = trace_ids()
    event = CrawlEvent(
        organization_id=organization_id,
        source_id=source.id,
        run_id=run.id,
        sequence=sequence,
        stage=stage,
        outcome=outcome,
        url=sanitize_url(url),
        attempt=attempt,
        duration_ms=duration_ms,
        status_code=status_code,
        bytes_count=bytes_count,
        records_count=records_count,
        chunks_count=chunks_count,
        error_code=error_code,
        error_message=(error_message or "")[:2000] or None,
        retryable=retryable,
        trace_id=trace_id,
        span_id=span_id,
        metadata_json=metadata or {},
    )
    session.add(event)
    await session.flush()
    PAGES_TOTAL.labels(stage=stage, outcome=outcome).inc()
    if duration_ms is not None:
        STAGE_DURATION.labels(stage=stage, outcome=outcome).observe(duration_ms / 1000)
    logger.info(
        "crawl.stage",
        organization_id=organization_id,
        source_id=source.id,
        run_id=run.id,
        event_id=event.id,
        sequence=sequence,
        stage=stage,
        outcome=outcome,
        url=event.url,
        duration_ms=duration_ms,
        status_code=status_code,
        error_code=error_code,
    )
    await publish_event(event)
    return event


async def publish_event(event: CrawlEvent) -> None:
    settings = get_settings()
    payload = {
        "id": event.id,
        "run_id": event.run_id,
        "sequence": event.sequence,
        "stage": event.stage,
        "outcome": event.outcome,
        "created_at": event.created_at.isoformat(),
    }
    try:
        redis = Redis.from_url(settings.redis_url, decode_responses=True)
        await redis.xadd(settings.observability_stream, {"data": json.dumps(payload)}, maxlen=50_000)
        await redis.aclose()
    except Exception as exc:
        logger.warning("crawl.event_stream_unavailable", error_type=type(exc).__name__)


async def publish_worker_heartbeat() -> None:
    settings = get_settings()
    payload = {
        "id": f"{socket.gethostname()}:{os.getpid()}",
        "hostname": socket.gethostname(),
        "pid": os.getpid(),
        "queues": ["ingest", "ai", "default"],
        "last_seen_at": datetime.now(UTC).isoformat(),
    }
    try:
        redis = Redis.from_url(settings.redis_url, decode_responses=True)
        await redis.setex(f"scrapal:worker:heartbeat:{payload['id']}", 90, json.dumps(payload))
        await redis.aclose()
    except Exception as exc:
        logger.warning("worker.heartbeat_unavailable", error_type=type(exc).__name__)


async def upsert_incident(
    session: AsyncSession,
    *,
    fingerprint: str,
    rule_id: str,
    summary: str,
    severity: str = "warning",
    remediation: str = "Inspect the correlated crawl timeline and retry after correcting the cause.",
    organization_id: str | None = None,
    source_id: str | None = None,
    run_id: str | None = None,
    trace_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> Incident:
    incident = await session.scalar(
        select(Incident).where(Incident.fingerprint == fingerprint, Incident.status != "resolved")
    )
    timestamp = datetime.now(UTC)
    if incident:
        incident.occurrence_count += 1
        incident.last_seen_at = timestamp
        incident.summary = summary
        incident.trace_id = trace_id or incident.trace_id
        return incident
    incident = Incident(
        fingerprint=fingerprint,
        rule_id=rule_id,
        summary=summary,
        severity=severity,
        remediation=remediation,
        organization_id=organization_id,
        source_id=source_id,
        run_id=run_id,
        trace_id=trace_id,
        metadata_json=metadata or {},
    )
    session.add(incident)
    return incident
