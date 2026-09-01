"""add course intelligence review lifecycle

Revision ID: 0007_course_intelligence
Revises: 0006_retrieval_lab_answers
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_course_intelligence"
down_revision: str | None = "0006_retrieval_lab_answers"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


record_status = postgresql.ENUM(
    "review", "published", "rejected", name="recordstatus", create_type=False
)
record_status_ddl = postgresql.ENUM("review", "published", "rejected", name="recordstatus")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {column["name"] for column in inspector.get_columns("structured_records")}
    if bind.dialect.name == "postgresql":
        record_status_ddl.create(bind, checkfirst=True)
    additions = {
        "status": sa.Column(
            "status", record_status, nullable=False, server_default="published"
        ),
        "validation_json": sa.Column(
            "validation_json", sa.JSON(), nullable=False, server_default="{}"
        ),
        "extractor_version": sa.Column(
            "extractor_version", sa.String(length=120), nullable=False, server_default="unknown"
        ),
        "reviewed_at": sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        "reviewed_by": sa.Column("reviewed_by", sa.String(length=180), nullable=True),
        "published_at": sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    }
    for name, column in additions.items():
        if name not in existing:
            op.add_column("structured_records", column)
    op.execute(
        "UPDATE structured_records SET published_at = created_at "
        "WHERE published = true AND published_at IS NULL"
    )
    op.create_index(
        "ix_structured_records_status", "structured_records", ["status"], unique=False
    )
    op.create_table(
        "structured_record_revisions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("record_id", sa.String(length=36), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("validation_json", sa.JSON(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("status", record_status, nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["record_id"], ["structured_records.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_record_revisions_record_revision",
        "structured_record_revisions",
        ["record_id", "revision"],
        unique=True,
    )
    op.create_index(
        "ix_structured_record_revisions_record_id",
        "structured_record_revisions",
        ["record_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("structured_record_revisions")
    op.drop_index("ix_structured_records_status", table_name="structured_records")
    for name in (
        "published_at",
        "reviewed_by",
        "reviewed_at",
        "extractor_version",
        "validation_json",
        "status",
    ):
        op.drop_column("structured_records", name)
    if op.get_bind().dialect.name == "postgresql":
        record_status_ddl.drop(op.get_bind(), checkfirst=True)
