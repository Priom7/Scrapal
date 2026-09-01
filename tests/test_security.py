import pytest
from fastapi import HTTPException

from scrapal.connectors.website import validate_public_url
from scrapal.models import Role
from scrapal.security import Principal, hash_key, require_super_admin, sign_webhook


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url",
    [
        "http://localhost/private",
        "http://127.0.0.1/admin",
        "http://169.254.169.254/latest/meta-data",
    ],
)
async def test_ssrf_guard_blocks_private_destinations(url: str) -> None:
    with pytest.raises(ValueError, match="blocked"):
        await validate_public_url(url)


def test_api_key_hash_and_webhook_signature_are_stable() -> None:
    assert hash_key("secret") == hash_key("secret")
    assert sign_webhook("secret", b"payload") == sign_webhook("secret", b"payload")
    assert sign_webhook("other", b"payload") != sign_webhook("secret", b"payload")


def test_organization_admin_cannot_access_platform_observability_or_retrieval_lab() -> None:
    principal = Principal("organization-1", Role.admin, ["*"])

    with pytest.raises(HTTPException) as denied:
        require_super_admin(principal)

    assert denied.value.status_code == 403
