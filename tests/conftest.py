"""Test-wide fixtures.

The checked-in .env targets the docker-compose stack (postgres, redis,
rabbitmq hostnames; SCRAPAL_ARTIFACT_DIR=/data/artifacts inside the
container). Tests must run offline and without docker, so artifact storage
is redirected to a throwaway directory per test rather than the real
deployment path, which does not exist on a bare host.
"""

import pytest

from scrapal.config import get_settings


@pytest.fixture(autouse=True)
def _isolated_artifact_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("SCRAPAL_ARTIFACT_DIR", str(tmp_path / "artifacts"))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
