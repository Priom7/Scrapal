"""add principal-scoped course shortlist entries

Revision ID: 0010_course_gallery_shortlist
Revises: 0009_institutions
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010_course_gallery_shortlist"
down_revision: str | None = "0009_institutions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "course_shortlist_entries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("principal_key", sa.String(length=180), nullable=False),
        sa.Column("record_id", sa.String(length=36), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["record_id"],
            ["structured_records.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_course_shortlist_principal_key",
        "course_shortlist_entries",
        ["principal_key"],
    )
    op.create_index(
        "ix_course_shortlist_record_id",
        "course_shortlist_entries",
        ["record_id"],
    )
    op.create_index(
        "ix_course_shortlist_principal_record",
        "course_shortlist_entries",
        ["principal_key", "record_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_course_shortlist_principal_record",
        table_name="course_shortlist_entries",
    )
    op.drop_index("ix_course_shortlist_record_id", table_name="course_shortlist_entries")
    op.drop_index("ix_course_shortlist_principal_key", table_name="course_shortlist_entries")
    op.drop_table("course_shortlist_entries")
