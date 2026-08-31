import asyncio

from celery import Celery

from scrapal.config import get_settings
from scrapal.db import engine
from scrapal.services.ingestion import ingest_run
from scrapal.telemetry import setup_observability

settings = get_settings()
celery_app = Celery("scrapal", broker=settings.celery_broker_url)
celery_app.conf.update(
    task_default_queue="default",
    task_routes={"scrapal.ingest": {"queue": "ingest"}},
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    worker_enable_remote_control=False,
    broker_connection_retry_on_startup=True,
    timezone="UTC",
    worker_send_task_events=True,
    task_send_sent_event=True,
    task_track_started=True,
)
setup_observability("scrapal-worker", engine=engine)


@celery_app.task(
    name="scrapal.ingest", autoretry_for=(ConnectionError,), retry_backoff=True, max_retries=4
)
def ingest_task(run_id: str) -> None:
    asyncio.run(_isolated_ingest(run_id))


async def _isolated_ingest(run_id: str) -> None:
    # Celery executes multiple tasks in a long-lived forked process. AsyncPG
    # connections belong to the event loop that created them, while
    # asyncio.run() creates a fresh loop per task. Dispose on both sides so a
    # pooled connection can never leak into the next task's loop.
    await engine.dispose()
    try:
        await ingest_run(run_id)
    finally:
        await engine.dispose()
