"""add evidence-first RAG lifecycle

Revision ID: 0005_evidence_rag
Revises: 0004_observability
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from scrapal.db import Base

revision: str = "0005_evidence_rag"
down_revision: str | None = "0004_observability"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RAG_TABLES = [
    "embedding_profiles",
    "document_indexes",
    "chunk_embeddings",
    "retrieval_runs",
    "message_generations",
    "generation_events",
    "evaluation_runs",
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("chunks")}
    additions = {
        "content_hash": sa.Column("content_hash", sa.String(length=64), nullable=False, server_default=""),
        "section_path": sa.Column("section_path", sa.JSON(), nullable=False, server_default="[]"),
        "anchor": sa.Column("anchor", sa.String(length=240), nullable=True),
        "metadata_json": sa.Column("metadata_json", sa.JSON(), nullable=False, server_default="{}"),
    }
    for name, column in additions.items():
        if name not in columns:
            op.add_column("chunks", column)
    for table_name in RAG_TABLES:
        Base.metadata.tables[table_name].create(bind=bind, checkfirst=True)
    op.execute(
        """INSERT INTO embedding_profiles
        (id, provider, model, dimensions, normalization, version, active, healthy, created_at, activated_at)
        SELECT '00000000-0000-0000-0000-000000000768', 'ollama', 'nomic-embed-text:latest',
               768, 'l2', '1', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        WHERE NOT EXISTS (SELECT 1 FROM embedding_profiles WHERE active = true)"""
    )
    if bind.dialect.name == "postgresql":
        op.execute(
            """INSERT INTO chunk_embeddings (id, chunk_id, embedding_profile_id, embedding, created_at)
            SELECT gen_random_uuid()::text, id, '00000000-0000-0000-0000-000000000768', embedding, created_at
            FROM chunks WHERE embedding IS NOT NULL
            ON CONFLICT DO NOTHING"""
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_chunk_embeddings_hnsw "
            "ON chunk_embeddings USING hnsw (embedding vector_cosine_ops)"
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_chunks_content_fts "
            "ON chunks USING gin (to_tsvector('english', content))"
        )
    op.create_index("ix_chunks_content_hash", "chunks", ["content_hash"], unique=False, if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_chunks_content_hash", table_name="chunks", if_exists=True)
    for table_name in reversed(RAG_TABLES):
        Base.metadata.tables[table_name].drop(bind=op.get_bind(), checkfirst=True)
    for name in ("metadata_json", "anchor", "section_path", "content_hash"):
        op.drop_column("chunks", name)
