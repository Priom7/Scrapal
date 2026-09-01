"""quarantine legacy course records without field evidence

Revision ID: 0008_quarantine_legacy_courses
Revises: 0007_course_intelligence
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_quarantine_legacy_courses"
down_revision: str | None = "0007_course_intelligence"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


records = sa.table(
    "structured_records",
    sa.column("schema_name", sa.String()),
    sa.column("extractor_version", sa.String()),
    sa.column(
        "status",
        postgresql.ENUM(
            "review", "published", "rejected", name="recordstatus", create_type=False
        ),
    ),
    sa.column("published", sa.Boolean()),
    sa.column("validation_json", sa.JSON()),
)


def upgrade() -> None:
    op.execute(
        records.update()
        .where(
            records.c.schema_name == "university.course",
            records.c.extractor_version == "unknown",
        )
        .values(
            status="review",
            published=False,
            validation_json={
                "coverage": 0,
                "missing_fields": [
                    "title",
                    "award",
                    "level",
                    "campuses",
                    "durations",
                    "intake_months",
                    "fees",
                    "entry_requirements",
                ],
                "review_reasons": ["Recrawl required to capture field-level evidence"],
            },
        )
    )


def downgrade() -> None:
    op.execute(
        records.update()
        .where(
            records.c.schema_name == "university.course",
            records.c.extractor_version == "unknown",
        )
        .values(status="published", published=True, validation_json={})
    )
