import pytest

from scrapal.connectors.website import validate_public_url
from scrapal.security import hash_key, sign_webhook


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
