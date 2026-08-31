"""add run issue telemetry

Revision ID: 0002_run_issues
Revises: 0001_initial
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_run_issues"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    run_columns = {column["name"] for column in inspector.get_columns("runs")}
    if "issues_count" not in run_columns:
        op.add_column("runs", sa.Column("issues_count", sa.Integer(), nullable=False, server_default="0"))
    if "run_issues" not in inspector.get_table_names():
        op.create_table(
            "run_issues",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("run_id", sa.String(length=36), nullable=False),
            sa.Column("url", sa.Text(), nullable=False),
            sa.Column("stage", sa.String(length=32), nullable=False),
            sa.Column("code", sa.String(length=80), nullable=True),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("retryable", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["run_id"], ["runs.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_run_issues_run_id", "run_issues", ["run_id"])


def downgrade() -> None:
    op.drop_index("ix_run_issues_run_id", table_name="run_issues")
    op.drop_table("run_issues")
    op.drop_column("runs", "issues_count")
