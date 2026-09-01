import asyncio
import mimetypes
import time
from collections import deque
from pathlib import Path
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from scrapal.config import get_settings
from scrapal.connectors.document import DocumentConnector
from scrapal.connectors.website import (
    WebsiteConfig,
    WebsiteConnector,
    extract_links,
    robots_allowed,
    validate_public_url,
)
from scrapal.db import SessionLocal
from scrapal.domain.university.greenwich import GreenwichConfig, GreenwichConnector
from scrapal.models import (
    Collection,
    Document,
    DocumentVersion,
    Run,
    RunIssue,
    RunStatus,
    Source,
    SourceKind,
    StructuredRecord,
    now,
)
from scrapal.services.artifacts import store_artifact
from scrapal.services.chunking import chunk_text
from scrapal.services.crawl_events import (
    publish_worker_heartbeat,
    record_crawl_event,
    upsert_incident,
)
from scrapal.services.indexing import index_document_version
from scrapal.telemetry import ACTIVE_RUNS, FETCH_BYTES, OUTPUT_TOTAL, RUNS_TOTAL, trace_ids, tracer


class FetchFailure(RuntimeError):
    def __init__(
        self, url: str, message: str, *, status_code: int | None = None, retryable: bool = False
    ):
        super().__init__(message)
        self.url = url
        self.status_code = status_code
        self.retryable = retryable


class RunCancelled(RuntimeError):
    pass


def retryable_status(status_code: int) -> bool:
    return status_code == 429 or status_code >= 500


async def safe_fetch(url: str, *, attempts: int = 3) -> httpx.Response:
    settings = get_settings()
    current = url
    async with httpx.AsyncClient(
        timeout=settings.request_timeout_seconds, follow_redirects=False
    ) as client:
        for _ in range(6):
            await validate_public_url(current)
            response: httpx.Response | None = None
            for attempt in range(attempts):
                try:
                    response = await client.get(
                        current, headers={"User-Agent": settings.user_agent}
                    )
                except (httpx.TimeoutException, httpx.NetworkError) as exc:
                    if attempt + 1 == attempts:
                        raise FetchFailure(current, str(exc), retryable=True) from exc
                    await asyncio.sleep(0.35 * (2**attempt))
                    continue
                if retryable_status(response.status_code) and attempt + 1 < attempts:
                    await asyncio.sleep(0.35 * (2**attempt))
                    continue
                break
            assert response is not None
            if response.is_redirect:
                location = response.headers.get("location")
                if not location:
                    raise ValueError("Redirect response did not include a location")
                current = urljoin(current, location)
                continue
            if response.is_error:
                raise FetchFailure(
                    current,
                    f"HTTP {response.status_code} {response.reason_phrase}",
                    status_code=response.status_code,
                    retryable=retryable_status(response.status_code),
                )
            return response
    raise FetchFailure(current, "Too many redirects", retryable=False)


def sitemap_urls(content: bytes) -> list[str]:
    root = ElementTree.fromstring(content)
    return [node.text.strip() for node in root.iter() if node.tag.endswith("loc") and node.text]


async def ingest_run(run_id: str) -> None:
    terminal_status = RunStatus.completed
    terminal_error: str | None = None
    active_incremented = False
    try:
        async with SessionLocal() as session:
            run = await session.get(Run, run_id)
            if not run:
                return
            source = await session.get(Source, run.source_id)
            if not source:
                terminal_status = RunStatus.failed
                terminal_error = "Source no longer exists"
                return
            run.status = RunStatus.running
            run.started_at = run.started_at or now()
            run.last_heartbeat_at = now()
            ACTIVE_RUNS.inc()
            active_incremented = True
            await publish_worker_heartbeat()
            with tracer.start_as_current_span(
                "crawl.run",
                attributes={
                    "scrapal.run.id": run.id,
                    "scrapal.source.id": source.id,
                    "scrapal.connector": source.kind.value,
                },
            ):
                await record_crawl_event(session, run, source, "run", "started")
                await session.commit()
                await _ingest_source(session, source, run)
    except RunCancelled:
        terminal_status = RunStatus.cancelled
        terminal_error = None
    except Exception as exc:  # worker boundary must survive an aborted processing transaction
        terminal_status = RunStatus.failed
        terminal_error = f"{type(exc).__name__}: {exc}"[:4000]
    finally:
        if active_incremented:
            ACTIVE_RUNS.dec()
        await mark_run_terminal(run_id, terminal_status, terminal_error)


async def mark_run_terminal(run_id: str, status: RunStatus, error: str | None) -> None:
    for attempt in range(6):
        try:
            async with SessionLocal() as session:
                run = await session.get(Run, run_id)
                if not run:
                    return
                source = await session.get(Source, run.source_id)
                run.status = status
                run.error = error
                run.finished_at = now()
                run.last_heartbeat_at = now()
                if source:
                    source.last_run_at = now()
                    outcome = status.value
                    await record_crawl_event(
                        session,
                        run,
                        source,
                        "run",
                        outcome,
                        error_code="run_failed" if status == RunStatus.failed else None,
                        error_message=error,
                    )
                    RUNS_TOTAL.labels(connector=source.kind.value, outcome=outcome).inc()
                    if status == RunStatus.failed:
                        trace_id, _ = trace_ids()
                        organization_id = await session.scalar(
                            select(Collection.organization_id).where(
                                Collection.id == source.collection_id
                            )
                        )
                        await upsert_incident(
                            session,
                            fingerprint=f"run-failed:{run.id}",
                            rule_id="crawler_run_failed",
                            summary=error or "Crawler run failed",
                            severity="critical",
                            organization_id=organization_id,
                            source_id=source.id,
                            run_id=run.id,
                            trace_id=trace_id,
                        )
                await session.commit()
                return
        except Exception:
            if attempt == 5:
                return
            await asyncio.sleep(0.5 * (2**attempt))


async def _ingest_source(session: AsyncSession, source: Source, run: Run) -> None:
    settings = get_settings()
    if source.kind == SourceKind.greenwich:
        connector: WebsiteConnector = GreenwichConnector()
        config: WebsiteConfig = GreenwichConfig(**source.config)
    else:
        connector = WebsiteConnector()
        config_data = {**source.config, "start_url": source.url}
        connector_config = WebsiteConfig(**config_data)
        config = connector_config
    discovery_started = time.perf_counter()
    with tracer.start_as_current_span("crawl.discovery"):
        await record_crawl_event(session, run, source, "discovery", "started")
    if run.retry_of_run_id:
        retry_issues = list(
            await session.scalars(
                select(RunIssue).where(
                    RunIssue.run_id == run.retry_of_run_id,
                    RunIssue.stage != "policy",
                )
            )
        )
        retry_urls = list(dict.fromkeys(issue.url for issue in retry_issues))
        queue = deque((url, 0) for url in retry_urls[: config.max_pages])
    elif source.kind in {SourceKind.sitemap, SourceKind.greenwich} or str(source.url).endswith(
        ".xml"
    ):
        response = await safe_fetch(str(source.url or config.start_url))
        urls = sitemap_urls(response.content)
        urls = [
            url
            for url in urls
            if not config.include_patterns or any(p in url for p in config.include_patterns)
        ]
        urls = [url for url in urls if not any(p in url for p in config.exclude_patterns)]
        queue = deque((url, 0) for url in urls[: config.max_pages])
    else:
        queue = deque([(str(source.url or config.start_url), 0)])
    seen: set[str] = set()
    run.pages_discovered = len(queue)
    await record_crawl_event(
        session,
        run,
        source,
        "discovery",
        "completed",
        duration_ms=(time.perf_counter() - discovery_started) * 1000,
        metadata={"pages_discovered": len(queue)},
    )
    await session.commit()
    while queue and len(seen) < min(config.max_pages, settings.max_pages_per_run):
        url, depth = queue.popleft()
        if url in seen:
            continue
        seen.add(url)
        page_started = time.perf_counter()
        await publish_worker_heartbeat()
        await record_crawl_event(session, run, source, "page", "started", url=url)
        await session.refresh(run, ["cancel_requested"])
        if run.cancel_requested:
            raise RunCancelled
        try:
            robots_started = time.perf_counter()
            with tracer.start_as_current_span("robots.check"):
                allowed = not config.respect_robots or await robots_allowed(url, settings.user_agent)
            if not allowed:
                await record_run_issue(
                    session, run, url, "policy", "robots_denied", "Blocked by robots.txt"
                )
                await record_crawl_event(
                    session,
                    run,
                    source,
                    "robots",
                    "policy_skipped",
                    url=url,
                    duration_ms=(time.perf_counter() - robots_started) * 1000,
                    error_code="robots_denied",
                )
                await record_crawl_event(
                    session,
                    run,
                    source,
                    "page",
                    "policy_skipped",
                    url=url,
                    duration_ms=(time.perf_counter() - page_started) * 1000,
                    error_code="robots_denied",
                )
                run.pages_processed += 1
                run.last_heartbeat_at = now()
                await session.commit()
                continue
            fetch_started = time.perf_counter()
            with tracer.start_as_current_span("http.fetch"):
                response = await safe_fetch(url)
            fetch_duration = (time.perf_counter() - fetch_started) * 1000
            FETCH_BYTES.inc(len(response.content))
            await record_crawl_event(
                session,
                run,
                source,
                "fetch",
                "completed",
                url=str(response.url),
                duration_ms=fetch_duration,
                status_code=response.status_code,
                bytes_count=len(response.content),
            )
        except FetchFailure as exc:
            await record_run_issue(
                session,
                run,
                url,
                "fetch",
                str(exc.status_code) if exc.status_code else "network_error",
                str(exc),
                retryable=exc.retryable,
            )
            await record_crawl_event(
                session,
                run,
                source,
                "fetch",
                "failed",
                url=url,
                status_code=exc.status_code,
                error_code="network_error" if exc.status_code is None else str(exc.status_code),
                error_message=str(exc),
                retryable=exc.retryable,
            )
            await record_crawl_event(
                session,
                run,
                source,
                "page",
                "failed",
                url=url,
                duration_ms=(time.perf_counter() - page_started) * 1000,
                error_code="fetch_failed",
                error_message=str(exc),
                retryable=exc.retryable,
            )
            run.pages_processed += 1
            run.last_heartbeat_at = now()
            await session.commit()
            continue
        except Exception as exc:
            await record_run_issue(session, run, url, "fetch", type(exc).__name__, str(exc))
            await record_crawl_event(
                session, run, source, "fetch", "failed", url=url,
                error_code=type(exc).__name__, error_message=str(exc)
            )
            await record_crawl_event(
                session, run, source, "page", "failed", url=url,
                duration_ms=(time.perf_counter() - page_started) * 1000,
                error_code=type(exc).__name__, error_message=str(exc)
            )
            run.pages_processed += 1
            run.last_heartbeat_at = now()
            await session.commit()
            continue

        content_type = response.headers.get("content-type", "application/octet-stream").split(
            ";", 1
        )[0]
        try:
            async with session.begin_nested():
                extract_started = time.perf_counter()
                with tracer.start_as_current_span("content.extract"):
                    extracted = await connector.extract(
                        str(response.url), response.content, content_type
                    )
                await record_crawl_event(
                    session, run, source, "extract", "completed", url=str(response.url),
                    duration_ms=(time.perf_counter() - extract_started) * 1000,
                    records_count=len(extracted.get("structured_records", [])),
                )
                persist_started = time.perf_counter()
                with tracer.start_as_current_span("document.persist"):
                    created = await persist_extraction(
                        session,
                        source,
                        run,
                        str(response.url),
                        response.content,
                        content_type,
                        extracted,
                    )
                chunks_count = len(chunk_text(extracted.get("text", "")))
                await record_crawl_event(
                    session, run, source, "persist", "completed", url=str(response.url),
                    duration_ms=(time.perf_counter() - persist_started) * 1000,
                    records_count=len(extracted.get("structured_records", [])),
                    chunks_count=chunks_count,
                    metadata={"new_document": created},
                )
                OUTPUT_TOTAL.labels(kind="documents").inc(int(created))
                OUTPUT_TOTAL.labels(kind="chunks").inc(chunks_count)
                OUTPUT_TOTAL.labels(kind="records").inc(len(extracted.get("structured_records", [])))
        except Exception as exc:
            await record_run_issue(
                session, run, url, "extract", type(exc).__name__, str(exc), retryable=True
            )
            await record_crawl_event(
                session, run, source, "extract", "failed", url=url,
                duration_ms=(time.perf_counter() - page_started) * 1000,
                error_code=type(exc).__name__, error_message=str(exc), retryable=True,
            )
            created = False
        run.pages_processed += 1
        run.documents_created += int(created)
        run.last_heartbeat_at = now()
        await record_crawl_event(
            session,
            run,
            source,
            "page",
            "completed" if created or response is not None else "failed",
            url=str(response.url),
            duration_ms=(time.perf_counter() - page_started) * 1000,
        )
        if content_type == "text/html" and depth < config.max_depth:
            for link in extract_links(str(response.url), response.content, config):
                if link not in seen:
                    queue.append((link, depth + 1))
            run.pages_discovered = min(
                len(seen) + len(queue), config.max_pages, settings.max_pages_per_run
            )
        await session.commit()


async def record_run_issue(
    session: AsyncSession,
    run: Run,
    url: str,
    stage: str,
    code: str | None,
    message: str,
    *,
    retryable: bool = False,
) -> None:
    session.add(
        RunIssue(
            run_id=run.id,
            url=url,
            stage=stage,
            code=code,
            message=(message or "Unknown error")[:2000],
            retryable=retryable,
        )
    )
    if stage == "policy":
        run.policy_skips_count += 1
    else:
        run.issues_count += 1


async def persist_extraction(
    session: AsyncSession,
    source: Source,
    run: Run | None,
    url: str,
    raw: bytes,
    content_type: str,
    extracted: dict,
) -> bool:
    suffix = mimetypes.guess_extension(content_type) or Path(urlparse(url).path).suffix or ".bin"
    with tracer.start_as_current_span("artifact.store"):
        digest, artifact_path = store_artifact(raw, suffix)
    document = await session.scalar(
        select(Document).where(Document.source_id == source.id, Document.canonical_url == url)
    )
    created = document is None
    if not document:
        document = Document(
            collection_id=source.collection_id,
            source_id=source.id,
            canonical_url=url,
            title=extracted.get("title") or url,
            media_type=content_type,
        )
        session.add(document)
        await session.flush()
    existing = await session.scalar(
        select(DocumentVersion).where(
            DocumentVersion.document_id == document.id,
            DocumentVersion.content_hash == digest,
        )
    )
    if existing:
        return False
    version = DocumentVersion(
        document_id=document.id,
        run_id=run.id if run else None,
        content_hash=digest,
        text=extracted.get("text", ""),
        metadata_json=extracted.get("metadata", {}),
        artifact_path=artifact_path,
    )
    session.add(version)
    await session.flush()
    document.title = extracted.get("title") or document.title
    with tracer.start_as_current_span("content.chunk"):
        await index_document_version(session, document, version)
    for item in extracted.get("structured_records", []):
        record = await session.scalar(
            select(StructuredRecord).where(
                StructuredRecord.schema_name == item["schema_name"],
                StructuredRecord.external_id == item["external_id"],
            )
        )
        if record:
            if record.data != item["data"]:
                record.data = item["data"]
                record.evidence = item.get("evidence", {})
                record.confidence = item.get("confidence", 1.0)
                record.revision += 1
        else:
            session.add(
                StructuredRecord(
                    collection_id=source.collection_id,
                    document_id=document.id,
                    **item,
                )
            )
    return created


async def ingest_upload(
    session: AsyncSession,
    source: Source,
    filename: str,
    content_type: str,
    raw: bytes,
) -> Document:
    connector = DocumentConnector()
    extracted = await connector.extract(filename, raw, content_type)
    await persist_extraction(
        session, source, None, f"upload://{source.id}/{filename}", raw, content_type, extracted
    )
    await session.commit()
    document = await session.scalar(
        select(Document).where(
            Document.source_id == source.id,
            Document.canonical_url == f"upload://{source.id}/{filename}",
        )
    )
    assert document is not None
    return document
