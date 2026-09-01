from __future__ import annotations

import logging
import re
from collections.abc import Mapping, MutableMapping
from typing import Any

import structlog
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.celery import CeleryInstrumentor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from prometheus_client import Counter, Gauge, Histogram

from scrapal.config import get_settings

SECRET_KEY = re.compile(r"authorization|cookie|secret|token|password|api[_-]?key", re.I)
REDACTED = "[REDACTED]"
_configured = False

RUNS_TOTAL = Counter(
    "scrapal_crawl_runs_total", "Crawler runs by connector and outcome", ["connector", "outcome"]
)
ACTIVE_RUNS = Gauge("scrapal_crawl_active_runs", "Currently active crawler runs")
PAGES_TOTAL = Counter(
    "scrapal_crawl_pages_total", "Crawler page stage outcomes", ["stage", "outcome"]
)
STAGE_DURATION = Histogram(
    "scrapal_crawl_stage_duration_seconds",
    "Crawler stage duration",
    ["stage", "outcome"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60),
)
FETCH_BYTES = Counter("scrapal_crawl_fetch_bytes_total", "Downloaded crawler bytes")
OUTPUT_TOTAL = Counter(
    "scrapal_crawl_output_total", "Crawler output objects", ["kind"]
)
RAG_STAGE_DURATION = Histogram(
    "scrapal_rag_stage_duration_seconds",
    "RAG stage duration",
    ["stage", "outcome"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 180),
)
RAG_CANDIDATES = Histogram(
    "scrapal_rag_candidates", "RAG candidates by lane", ["lane"], buckets=(0, 1, 3, 5, 10, 20, 50)
)
RAG_QUERIES = Counter(
    "scrapal_rag_queries_total", "RAG queries by outcome", ["outcome"]
)
RAG_CITATIONS = Counter(
    "scrapal_rag_citations_total", "RAG sentence citation validation", ["outcome"]
)
RAG_CONTEXT_SIZE = Histogram(
    "scrapal_rag_context_items",
    "Evidence items packed into an answer context",
    buckets=(0, 1, 2, 3, 4, 6, 8, 10),
)
RAG_INDEX_FAILURES = Counter(
    "scrapal_rag_index_failures_total", "RAG indexing failures", ["reason"]
)


def redact_value(value: Any, key: str = "") -> Any:
    if SECRET_KEY.search(key):
        return REDACTED
    if isinstance(value, Mapping):
        return {str(k): redact_value(v, str(k)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_value(item) for item in value]
    return value


def redact_event(
    _: Any, __: str, event_dict: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    return redact_value(event_dict)


def add_trace_context(
    _: Any, __: str, event_dict: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    context = trace.get_current_span().get_span_context()
    if context.is_valid:
        event_dict["trace_id"] = f"{context.trace_id:032x}"
        event_dict["span_id"] = f"{context.span_id:016x}"
    return event_dict


def configure_logging(service_name: str) -> None:
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    if not root.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        root.addHandler(handler)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            add_trace_context,
            redact_event,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    structlog.contextvars.bind_contextvars(service_name=service_name)


def setup_observability(service_name: str, *, app: Any | None = None, engine: Any | None = None) -> None:
    global _configured
    configure_logging(service_name)
    if _configured:
        if app is not None:
            FastAPIInstrumentor.instrument_app(app)
        return
    _configured = True
    settings = get_settings()
    if not settings.otel_enabled:
        return
    provider = TracerProvider(
        resource=Resource.create(
            {
                "service.name": service_name,
                "service.namespace": "scrapal",
                "deployment.environment.name": settings.environment,
            }
        )
    )
    provider.add_span_processor(
        BatchSpanProcessor(
            OTLPSpanExporter(endpoint=settings.otel_exporter_otlp_endpoint, insecure=True)
        )
    )
    trace.set_tracer_provider(provider)
    log_provider = LoggerProvider(resource=provider.resource)
    log_provider.add_log_record_processor(
        BatchLogRecordProcessor(
            OTLPLogExporter(endpoint=settings.otel_exporter_otlp_endpoint, insecure=True)
        )
    )
    logging.getLogger().addHandler(LoggingHandler(logger_provider=log_provider))
    HTTPXClientInstrumentor().instrument()
    RedisInstrumentor().instrument()
    CeleryInstrumentor().instrument()
    if engine is not None:
        SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)
    if app is not None:
        FastAPIInstrumentor.instrument_app(app)


def trace_ids() -> tuple[str | None, str | None]:
    context = trace.get_current_span().get_span_context()
    if not context.is_valid:
        return None, None
    return f"{context.trace_id:032x}", f"{context.span_id:016x}"


tracer = trace.get_tracer("scrapal.crawler")
logger = structlog.get_logger("scrapal")
