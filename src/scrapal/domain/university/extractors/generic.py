"""Course extraction for any university, without per-site code."""

from typing import Any


class GenericUniversityExtractor:
    version = "generic-university-v1"

    async def extract_records(self, url: str, html: bytes) -> list[dict[str, Any]]:
        return []
