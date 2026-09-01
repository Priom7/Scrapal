"""add retrieval lab answer diagnostics

Revision ID: 0006_retrieval_lab_answers
Revises: 0005_evidence_rag
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_retrieval_lab_answers"
down_revision: str | None = "0005_evidence_rag"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing = {column["name"] for column in inspector.get_columns("retrieval_runs")}
    additions = {
        "generated_answer": sa.Column("generated_answer", sa.Text(), nullable=True),
        "citation_results": sa.Column(
            "citation_results", sa.JSON(), nullable=False, server_default="[]"
        ),
        "abstention_reason": sa.Column("abstention_reason", sa.String(length=240), nullable=True),
        "answer_model": sa.Column("answer_model", sa.String(length=180), nullable=True),
    }
    for name, column in additions.items():
        if name not in existing:
            op.add_column("retrieval_runs", column)


def downgrade() -> None:
    for name in ("answer_model", "abstention_reason", "citation_results", "generated_answer"):
        op.drop_column("retrieval_runs", name)
