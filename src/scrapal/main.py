from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from scrapal.api import router
from scrapal.blueprints_api import router as blueprints_router
from scrapal.config import get_settings
from scrapal.course_gallery_api import router as course_gallery_router
from scrapal.course_intelligence_api import router as course_intelligence_router
from scrapal.db import SessionLocal, init_db
from scrapal.models import Collection
from scrapal.observability_api import router as observability_router
from scrapal.retrieval_api import router as retrieval_router
from scrapal.security import bootstrap_identity
from scrapal.services.indexing import ensure_default_profile
from scrapal.telemetry import setup_observability


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    settings.artifact_dir.mkdir(parents=True, exist_ok=True)
    await init_db()
    async with SessionLocal() as session:
        await bootstrap_identity(session)
        await ensure_default_profile(session)
        collection = await session.scalar(select(Collection).limit(1))
        if not collection:
            from scrapal.models import Organization

            organization = await session.scalar(select(Organization).limit(1))
            assert organization is not None
            session.add(
                Collection(
                    organization_id=organization.id,
                    name="Greenwich launch collection",
                    description="University courses and student guidance for Scrapal's first domain pack.",
                )
            )
            await session.commit()
    yield


settings = get_settings()
app = FastAPI(
    title="Scrapal API",
    version="0.1.0",
    description="Scraping, versioned knowledge, local RAG, and approval-gated agent actions.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
app.include_router(blueprints_router)
app.include_router(observability_router)
app.include_router(retrieval_router)
app.include_router(course_intelligence_router)
app.include_router(course_gallery_router)
setup_observability("scrapal-api", app=app)


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "scrapal-api"}


from prometheus_client import make_asgi_app  # noqa: E402

app.mount("/metrics", make_asgi_app())
