"""add run control and message idempotency

Revision ID: 0003_run_control
Revises: 0002_run_issues
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_run_control"
down_revision: str | None = "0002_run_issues"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE runstatus ADD VALUE IF NOT EXISTS 'cancelled'")
    run_columns = {column["name"] for column in inspector.get_columns("runs")}
    if "cancel_requested" not in run_columns:
        op.add_column("runs", sa.Column("cancel_requested", sa.Boolean(), nullable=False, server_default=sa.false()))
    if "retry_of_run_id" not in run_columns:
        op.add_column("runs", sa.Column("retry_of_run_id", sa.String(length=36), nullable=True))
        op.create_foreign_key("fk_runs_retry_of_run_id", "runs", "runs", ["retry_of_run_id"], ["id"])
    if "last_heartbeat_at" not in run_columns:
        op.add_column("runs", sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True))
    if "policy_skips_count" not in run_columns:
        op.add_column("runs", sa.Column("policy_skips_count", sa.Integer(), nullable=False, server_default="0"))
        if "run_issues" in inspector.get_table_names():
            op.execute(
                """UPDATE runs SET
                policy_skips_count = (SELECT count(*) FROM run_issues WHERE run_issues.run_id = runs.id AND stage = 'policy'),
                issues_count = (SELECT count(*) FROM run_issues WHERE run_issues.run_id = runs.id AND stage <> 'policy')"""
            )
    message_columns = {column["name"] for column in inspector.get_columns("messages")}
    if "request_id" not in message_columns:
        op.add_column("messages", sa.Column("request_id", sa.String(length=36), nullable=True))
    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("messages")}
    if "ix_messages_conversation_request_role" not in indexes:
        op.create_index(
            "ix_messages_conversation_request_role",
            "messages",
            ["conversation_id", "request_id", "role"],
            unique=True,
        )


def downgrade() -> None:
    op.drop_index("ix_messages_conversation_request_role", table_name="messages")
    op.drop_column("messages", "request_id")
    op.drop_constraint("fk_runs_retry_of_run_id", "runs", type_="foreignkey")
    op.drop_column("runs", "last_heartbeat_at")
    op.drop_column("runs", "retry_of_run_id")
    op.drop_column("runs", "cancel_requested")
    op.drop_column("runs", "policy_skips_count")
