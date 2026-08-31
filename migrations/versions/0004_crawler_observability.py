"""add crawler observability and platform super admin

Revision ID: 0004_observability
Revises: 0003_run_control
"""

from collections.abc import Sequence

from alembic import op

from scrapal.db import Base

revision: str = "0004_observability"
down_revision: str | None = "0003_run_control"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE role ADD VALUE IF NOT EXISTS 'super_admin'")
    Base.metadata.tables["crawl_events"].create(bind=bind, checkfirst=True)
    Base.metadata.tables["incidents"].create(bind=bind, checkfirst=True)
    op.execute("UPDATE api_keys SET role = 'super_admin' WHERE name = 'Local development'")


def downgrade() -> None:
    Base.metadata.tables["incidents"].drop(bind=op.get_bind(), checkfirst=True)
    Base.metadata.tables["crawl_events"].drop(bind=op.get_bind(), checkfirst=True)
