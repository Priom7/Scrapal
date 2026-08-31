from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from redis.asyncio import Redis
from sqlalchemy import desc, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from scrapal.config import get_settings
from scrapal.db import get_session
from scrapal.models import Collection, CrawlEvent, Incident, Run, RunStatus, Source
from scrapal.schemas import CrawlEventOut, IncidentOut
from scrapal.security import Principal, require_super_admin
from scrapal.services.ollama import OllamaService

router = APIRouter(prefix="/v1/admin/observability", tags=["observability"])
Session = Annotated[AsyncSession, Depends(get_session)]
SuperAdmin = Annotated[Principal, Depends(require_super_admin)]


@router.get("/overview")
async def overview(session: Session, _: SuperAdmin, hours: int = Query(24, ge=1, le=720)) -> dict[str, Any]:
    since = datetime.now(UTC) - timedelta(hours=hours)
    runs_total = await session.scalar(select(func.count(Run.id)).where(Run.created_at >= since))
    active_runs = await session.scalar(
        select(func.count(Run.id)).where(Run.status.in_([RunStatus.queued, RunStatus.running]))
    )
    failed_runs = await session.scalar(
        select(func.count(Run.id)).where(Run.created_at >= since, Run.status == RunStatus.failed)
    )
    pages = await session.scalar(
        select(func.count(CrawlEvent.id)).where(
            CrawlEvent.created_at >= since, CrawlEvent.stage == "page", CrawlEvent.outcome == "completed"
        )
    )
    failures = await session.scalar(
        select(func.count(CrawlEvent.id)).where(
            CrawlEvent.created_at >= since, CrawlEvent.outcome == "failed"
        )
    )
    open_incidents = await session.scalar(
        select(func.count(Incident.id)).where(Incident.status != "resolved")
    )
    durations = list(
        await session.scalars(
            select(CrawlEvent.duration_ms).where(
                CrawlEvent.created_at >= since,
                CrawlEvent.stage == "page",
                CrawlEvent.duration_ms.is_not(None),
            )
        )
    )
    durations.sort()
    p95 = durations[min(len(durations) - 1, int(len(durations) * 0.95))] if durations else 0
    return {
        "window_hours": hours,
        "runs_total": runs_total or 0,
        "active_runs": active_runs or 0,
        "failed_runs": failed_runs or 0,
        "pages_processed": pages or 0,
        "stage_failures": failures or 0,
        "open_incidents": open_incidents or 0,
        "page_duration_p95_ms": round(float(p95 or 0), 1),
    }


@router.get("/runs")
async def observability_runs(
    session: Session,
    _: SuperAdmin,
    status: RunStatus | None = None,
    limit: int = Query(100, ge=1, le=500),
) -> list[dict[str, Any]]:
    statement = (
        select(Run, Source, Collection.organization_id)
        .join(Source, Source.id == Run.source_id)
        .join(Collection, Collection.id == Source.collection_id)
        .order_by(desc(Run.created_at))
        .limit(limit)
    )
    if status:
        statement = statement.where(Run.status == status)
    rows = (await session.execute(statement)).all()
    return [
        {
            "id": run.id,
            "organization_id": organization_id,
            "source_id": source.id,
            "source_name": source.name,
            "connector": source.kind.value,
            "status": run.status.value,
            "pages_discovered": run.pages_discovered,
            "pages_processed": run.pages_processed,
            "issues_count": run.issues_count,
            "policy_skips_count": run.policy_skips_count,
            "last_heartbeat_at": run.last_heartbeat_at,
            "started_at": run.started_at,
            "finished_at": run.finished_at,
            "created_at": run.created_at,
        }
        for run, source, organization_id in rows
    ]


@router.get("/runs/{run_id}/timeline", response_model=list[CrawlEventOut])
async def run_timeline(
    run_id: str,
    session: Session,
    _: SuperAdmin,
    after_sequence: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=2000),
) -> list[CrawlEvent]:
    exists = await session.get(Run, run_id)
    if not exists:
        raise HTTPException(404, "Run not found")
    return list(
        await session.scalars(
            select(CrawlEvent)
            .where(CrawlEvent.run_id == run_id, CrawlEvent.sequence > after_sequence)
            .order_by(CrawlEvent.sequence)
            .limit(limit)
        )
    )


@router.get("/events")
async def live_events(request: Request, _: SuperAdmin) -> StreamingResponse:
    last_event_id = request.headers.get("last-event-id", "$")
    settings = get_settings()

    async def stream() -> AsyncIterator[str]:
        cursor = last_event_id
        redis: Redis | None = None
        try:
            redis = Redis.from_url(settings.redis_url, decode_responses=True)
            while True:
                results = await redis.xread({settings.observability_stream: cursor}, block=15_000, count=100)
                if not results:
                    yield ": keep-alive\n\n"
                    continue
                for _, entries in results:
                    for stream_id, fields in entries:
                        cursor = stream_id
                        yield f"id: {stream_id}\nevent: crawl\ndata: {fields['data']}\n\n"
        except asyncio.CancelledError:
            return
        except Exception:
            yield 'event: degraded\ndata: {"detail":"Redis stream unavailable; reconnecting"}\n\n'
        finally:
            if redis:
                await redis.aclose()

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@router.get("/incidents", response_model=list[IncidentOut])
async def incidents(
    session: Session,
    _: SuperAdmin,
    status: str | None = None,
    limit: int = Query(100, ge=1, le=500),
) -> list[Incident]:
    statement = select(Incident).order_by(desc(Incident.last_seen_at)).limit(limit)
    if status:
        statement = statement.where(Incident.status == status)
    return list(await session.scalars(statement))


@router.post("/incidents/{incident_id}/acknowledge", response_model=IncidentOut)
async def acknowledge_incident(incident_id: str, session: Session, _: SuperAdmin) -> Incident:
    incident = await session.get(Incident, incident_id)
    if not incident:
        raise HTTPException(404, "Incident not found")
    incident.status = "acknowledged"
    incident.acknowledged_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(incident)
    return incident


@router.post("/incidents/{incident_id}/resolve", response_model=IncidentOut)
async def resolve_incident(incident_id: str, session: Session, _: SuperAdmin) -> Incident:
    incident = await session.get(Incident, incident_id)
    if not incident:
        raise HTTPException(404, "Incident not found")
    incident.status = "resolved"
    incident.resolved_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(incident)
    return incident


@router.get("/workers")
async def workers(_: SuperAdmin) -> dict[str, Any]:
    settings = get_settings()
    try:
        redis = Redis.from_url(settings.redis_url, decode_responses=True)
        keys = [key async for key in redis.scan_iter("scrapal:worker:heartbeat:*")]
        values = await redis.mget(keys) if keys else []
        await redis.aclose()
        return {"status": "ok" if keys else "warning", "workers": [json.loads(value) for value in values if value]}
    except Exception as exc:
        return {"status": "unavailable", "workers": [], "detail": type(exc).__name__}


@router.get("/dependencies")
async def dependencies(session: Session, _: SuperAdmin) -> dict[str, Any]:
    checks: dict[str, Any] = {}
    try:
        await session.execute(text("SELECT 1"))
        checks["postgres"] = {"status": "ok"}
    except Exception as exc:
        checks["postgres"] = {"status": "unavailable", "detail": type(exc).__name__}
    try:
        redis = Redis.from_url(get_settings().redis_url)
        await redis.ping()
        await redis.aclose()
        checks["redis"] = {"status": "ok"}
    except Exception as exc:
        checks["redis"] = {"status": "unavailable", "detail": type(exc).__name__}
    try:
        checks["ollama"] = await OllamaService().health()
    except Exception as exc:
        # Dependency checks must report degradation without taking down the
        # super-admin control plane.
        checks["ollama"] = {"status": "unavailable", "detail": type(exc).__name__}
    return checks


@router.get("/grafana-link")
async def grafana_link(_: SuperAdmin, run_id: str | None = None, trace_id: str | None = None) -> dict[str, str]:
    base = get_settings().grafana_base_url.rstrip("/")
    if trace_id:
        return {"url": f"{base}/explore?left={quote(json.dumps({'datasource': 'Tempo', 'queries': [{'query': trace_id, 'queryType': 'traceql'}]}))}"}
    variables = f"var-run_id={quote(run_id)}" if run_id else ""
    return {"url": f"{base}/d/scrapal-run/crawler-run-investigation?{variables}"}
