"""The single place an Institution row comes into existence.

Sources arrive from blueprint approval and from direct creation. Both routes
call resolve_institution, so adding a fourth university needs no code.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from scrapal.domain.university.institutions import (
    country_for_domain,
    institution_name_from_domain,
    registrable_domain,
    slugify,
)
from scrapal.models import Institution


async def resolve_institution(
    session: AsyncSession,
    organization_id: str,
    url: str,
    name: str | None = None,
) -> Institution | None:
    """Return the institution publishing at this address, creating it if new.

    Returns None when the address has no readable domain; the caller keeps a
    source without an institution rather than inventing one.
    """
    domain = registrable_domain(url or "")
    if not domain:
        return None
    existing = await session.scalar(
        select(Institution).where(
            Institution.organization_id == organization_id,
            Institution.domain == domain,
        )
    )
    if existing:
        return existing
    label = (name or "").strip() or institution_name_from_domain(domain)
    base = slugify(label) or slugify(domain)
    slug, attempt = base, 1
    while await session.scalar(
        select(Institution.id).where(
            Institution.organization_id == organization_id, Institution.slug == slug
        )
    ):
        attempt += 1
        slug = f"{base}-{attempt}"
    institution = Institution(
        organization_id=organization_id,
        name=label,
        slug=slug,
        domain=domain,
        country_code=country_for_domain(domain),
        website_url=f"https://{domain}",
    )
    session.add(institution)
    await session.flush()
    return institution
