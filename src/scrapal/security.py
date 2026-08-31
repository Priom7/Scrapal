import hashlib
import hmac
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from scrapal.config import get_settings
from scrapal.db import get_session
from scrapal.models import APIKey, Organization, Role

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def hash_key(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


@dataclass(frozen=True)
class Principal:
    organization_id: str
    role: Role
    scopes: list[str]


async def bootstrap_identity(session: AsyncSession) -> None:
    existing = await session.scalar(select(Organization).limit(1))
    if existing:
        return
    organization = Organization(name="Scrapal workspace")
    session.add(organization)
    await session.flush()
    settings = get_settings()
    session.add(
        APIKey(
            organization_id=organization.id,
            name="Local development",
            key_hash=hash_key(settings.api_key),
            role=Role.super_admin,
            scopes=["*"],
        )
    )
    await session.commit()


async def get_principal(
    supplied: str | None = Security(api_key_header),
    session: AsyncSession = Depends(get_session),
) -> Principal:
    if not supplied:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing API key")
    record = await session.scalar(select(APIKey).where(APIKey.key_hash == hash_key(supplied)))
    if not record or not record.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")
    return Principal(record.organization_id, record.role, record.scopes)


def require_editor(principal: Principal = Depends(get_principal)) -> Principal:
    if principal.role not in {Role.super_admin, Role.admin, Role.editor}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Editor permission required")
    return principal


def require_super_admin(principal: Principal = Depends(get_principal)) -> Principal:
    if principal.role != Role.super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform super-admin permission required")
    return principal


def sign_webhook(secret: str, payload: bytes) -> str:
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
