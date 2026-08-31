from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from scrapal.config import get_settings

settings = get_settings()
engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    if engine.dialect.name == "postgresql":
        async with engine.begin() as connection:
            await connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    from scrapal import models  # noqa: F401

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        if engine.dialect.name == "postgresql":
            await connection.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_chunks_embedding_hnsw "
                    "ON chunks USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL"
                )
            )
            await connection.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_chunks_content_fts "
                    "ON chunks USING gin (to_tsvector('english', content))"
                )
            )
