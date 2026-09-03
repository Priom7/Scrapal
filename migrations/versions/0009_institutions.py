"""add institutions and attach sources and course records to them

Revision ID: 0009_institutions
Revises: 0008_quarantine_legacy_courses
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from scrapal.domain.university.institutions import (
    country_for_domain,
    institution_name_from_domain,
    registrable_domain,
    slugify,
)

revision: str = "0009_institutions"
down_revision: str | None = "0008_quarantine_legacy_courses"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "institutions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("slug", sa.String(length=200), nullable=False),
        sa.Column("domain", sa.String(length=255), nullable=False),
        sa.Column("country_code", sa.String(length=2), nullable=True),
        sa.Column("city", sa.String(length=180), nullable=True),
        sa.Column("website_url", sa.Text(), nullable=True),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("banner_url", sa.Text(), nullable=True),
        sa.Column("brand_color", sa.String(length=9), nullable=True),
        sa.Column("settings", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_institutions_organization_id", "institutions", ["organization_id"])
    op.create_index("ix_institutions_country_code", "institutions", ["country_code"])
    op.create_index(
        "ix_institutions_org_domain", "institutions", ["organization_id", "domain"], unique=True
    )
    op.create_index(
        "ix_institutions_org_slug", "institutions", ["organization_id", "slug"], unique=True
    )
    op.add_column("sources", sa.Column("institution_id", sa.String(length=36), nullable=True))
    op.create_index("ix_sources_institution_id", "sources", ["institution_id"])
    op.create_foreign_key(
        "fk_sources_institution_id", "sources", "institutions", ["institution_id"], ["id"]
    )
    op.add_column(
        "structured_records", sa.Column("institution_id", sa.String(length=36), nullable=True)
    )
    op.create_index(
        "ix_structured_records_institution_id", "structured_records", ["institution_id"]
    )
    op.create_foreign_key(
        "fk_structured_records_institution_id",
        "structured_records",
        "institutions",
        ["institution_id"],
        ["id"],
    )
    _backfill()


def _backfill() -> None:
    """Give every existing source an institution, then stamp its course records.

    Idempotent: re-running resolves the same domains to the same rows and
    rewrites the same ids.
    """
    import uuid
    from datetime import UTC, datetime

    bind = op.get_bind()
    stamp = datetime.now(UTC)
    rows = bind.execute(
        sa.text(
            "SELECT s.id, s.name, s.url, c.organization_id "
            "FROM sources s JOIN collections c ON c.id = s.collection_id"
        )
    ).fetchall()
    cache: dict[tuple[str, str], str] = {}
    for source_id, source_name, url, organization_id in rows:
        domain = registrable_domain(url or "")
        if not domain:
            continue
        key = (organization_id, domain)
        if key not in cache:
            found = bind.execute(
                sa.text(
                    "SELECT id FROM institutions WHERE organization_id = :org AND domain = :domain"
                ),
                {"org": organization_id, "domain": domain},
            ).scalar()
            if found:
                cache[key] = found
            else:
                name = (source_name or "").strip() or institution_name_from_domain(domain)
                base = slugify(name) or slugify(domain)
                slug, attempt = base, 1
                while bind.execute(
                    sa.text(
                        "SELECT 1 FROM institutions WHERE organization_id = :org AND slug = :slug"
                    ),
                    {"org": organization_id, "slug": slug},
                ).scalar():
                    attempt += 1
                    slug = f"{base}-{attempt}"
                new_id = str(uuid.uuid4())
                bind.execute(
                    sa.text(
                        "INSERT INTO institutions (id, organization_id, name, slug, domain, "
                        "country_code, settings, created_at, updated_at) VALUES "
                        "(:id, :org, :name, :slug, :domain, :cc, '{}', :ts, :ts)"
                    ),
                    {
                        "id": new_id,
                        "org": organization_id,
                        "name": name,
                        "slug": slug,
                        "domain": domain,
                        "cc": country_for_domain(domain),
                        "ts": stamp,
                    },
                )
                cache[key] = new_id
        bind.execute(
            sa.text("UPDATE sources SET institution_id = :inst WHERE id = :sid"),
            {"inst": cache[key], "sid": source_id},
        )
    bind.execute(
        sa.text(
            "UPDATE structured_records SET institution_id = ("
            "  SELECT s.institution_id FROM documents d JOIN sources s ON s.id = d.source_id"
            "  WHERE d.id = structured_records.document_id"
            ") WHERE institution_id IS NULL"
        )
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_structured_records_institution_id", "structured_records", type_="foreignkey"
    )
    op.drop_index("ix_structured_records_institution_id", table_name="structured_records")
    op.drop_column("structured_records", "institution_id")
    op.drop_constraint("fk_sources_institution_id", "sources", type_="foreignkey")
    op.drop_index("ix_sources_institution_id", table_name="sources")
    op.drop_column("sources", "institution_id")
    op.drop_index("ix_institutions_org_slug", table_name="institutions")
    op.drop_index("ix_institutions_org_domain", table_name="institutions")
    op.drop_index("ix_institutions_country_code", table_name="institutions")
    op.drop_index("ix_institutions_organization_id", table_name="institutions")
    op.drop_table("institutions")
