import pytest
from fastapi import HTTPException

from scrapal.models import Role
from scrapal.security import Principal, require_super_admin
from scrapal.services.crawl_events import sanitize_url
from scrapal.telemetry import REDACTED, redact_value


def test_sanitize_url_removes_query_values_and_fragments() -> None:
    assert (
        sanitize_url("https://example.edu/course?id=student@example.com&token=secret#fees")
        == "https://example.edu/course"
    )


def test_telemetry_redaction_is_recursive() -> None:
    payload = {
        "authorization": "Bearer secret",
        "request": {"cookie": "session=secret", "status_code": 200},
        "api_key": "secret",
    }
    assert redact_value(payload) == {
        "authorization": REDACTED,
        "request": {"cookie": REDACTED, "status_code": 200},
        "api_key": REDACTED,
    }


def test_only_platform_super_admin_can_access_observability() -> None:
    super_admin = Principal("org", Role.super_admin, ["*"])
    assert require_super_admin(super_admin) == super_admin
    with pytest.raises(HTTPException) as error:
        require_super_admin(Principal("org", Role.admin, ["*"]))
    assert error.value.status_code == 403
