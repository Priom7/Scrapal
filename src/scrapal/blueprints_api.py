from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from scrapal.config import get_settings
from scrapal.db import get_session
from scrapal.jobs import ingest_task
from scrapal.models import (
    BlueprintStatus,
    Collection,
    CrawlBlueprint,
    Run,
    RunStatus,
    Source,
    SourceKind,
)
from scrapal.schemas import CrawlBlueprintOut, CrawlBlueprintPreview, RunOut
from scrapal.security import Principal, require_editor
from scrapal.services.blueprints import preview_blueprint
from scrapal.services.ingestion import ingest_run

router = APIRouter(prefix="/v1/crawl-blueprints", tags=["crawl-blueprints"])
Session = Annotated[AsyncSession, Depends(get_session)]
Editor = Annotated[Principal, Depends(require_editor)]


async def owned_blueprint(
    session: AsyncSession, blueprint_id: str, principal: Principal
) -> CrawlBlueprint:
    blueprint = await session.scalar(
        select(CrawlBlueprint).where(
            CrawlBlueprint.id == blueprint_id,
            CrawlBlueprint.organization_id == principal.organization_id,
        )
    )
    if not blueprint:
        raise HTTPException(404, "Crawl blueprint not found")
    return blueprint


@router.post("/preview", response_model=CrawlBlueprintOut, status_code=201)
async def preview(
    body: CrawlBlueprintPreview, session: Session, principal: Editor
) -> CrawlBlueprint:
    collection = await session.scalar(
        select(Collection).where(
            Collection.id == body.collection_id,
            Collection.organization_id == principal.organization_id,
        )
    )
    if not collection:
        raise HTTPException(404, "Collection not found")
    try:
        discovery, config, required_fields = await preview_blueprint(
            str(body.start_url),
            domain_pack=body.domain_pack,
            requested_fields=body.required_fields,
            max_pages=body.max_pages,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"The planning sample could not be fetched: {type(exc).__name__}") from exc
    blueprint = CrawlBlueprint(
        organization_id=principal.organization_id,
        collection_id=body.collection_id,
        name=body.name,
        start_url=str(body.start_url),
        objective=body.objective,
        domain_pack=body.domain_pack,
        required_fields=required_fields,
        suggested_config=config,
        discovery_json=discovery,
    )
    session.add(blueprint)
    await session.commit()
    await session.refresh(blueprint)
    return blueprint


@router.get("/{blueprint_id}", response_model=CrawlBlueprintOut)
async def detail(blueprint_id: str, session: Session, principal: Editor) -> CrawlBlueprint:
    return await owned_blueprint(session, blueprint_id, principal)


@router.post("/{blueprint_id}/approve", response_model=CrawlBlueprintOut)
async def approve(
    blueprint_id: str, session: Session, principal: Editor
) -> CrawlBlueprint:
    blueprint = await owned_blueprint(session, blueprint_id, principal)
    if blueprint.status == BlueprintStatus.approved:
        return blueprint
    config = dict(blueprint.suggested_config)
    source_url = str(config.pop("start_url", blueprint.start_url))
    hostname = source_url.lower()
    has_sitemap = bool(blueprint.discovery_json.get("sitemaps"))
    if blueprint.domain_pack == "university" and "gre.ac.uk" in hostname and has_sitemap:
        kind = SourceKind.greenwich
    elif has_sitemap:
        kind = SourceKind.sitemap
    else:
        kind = SourceKind.website
    source = Source(
        collection_id=blueprint.collection_id,
        name=blueprint.name,
        kind=kind,
        url=source_url,
        config=config,
    )
    session.add(source)
    await session.flush()
    blueprint.source_id = source.id
    blueprint.status = BlueprintStatus.approved
    blueprint.approved_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(blueprint)
    return blueprint


@router.post("/{blueprint_id}/run", response_model=RunOut, status_code=202)
async def run_blueprint(
    blueprint_id: str,
    background: BackgroundTasks,
    session: Session,
    principal: Editor,
) -> Run:
    blueprint = await owned_blueprint(session, blueprint_id, principal)
    if blueprint.status != BlueprintStatus.approved or not blueprint.source_id:
        raise HTTPException(409, "Approve the crawl blueprint before running it")
    active = await session.scalar(
        select(Run).where(
            Run.source_id == blueprint.source_id,
            Run.status.in_([RunStatus.queued, RunStatus.running]),
        )
    )
    if active:
        return active
    run = Run(source_id=blueprint.source_id, mode="full")
    session.add(run)
    await session.commit()
    await session.refresh(run)
    if get_settings().celery_enabled:
        ingest_task.delay(run.id)
    else:
        background.add_task(ingest_run, run.id)
    return run
