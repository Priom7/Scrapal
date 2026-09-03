"""Shared contract for anything that turns a course page into records."""

import re
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class CourseExtractor(Protocol):
    """Turns one fetched page into zero or more structured_record payloads."""

    version: str

    async def extract_records(self, url: str, html: bytes) -> list[dict[str, Any]]:
        ...


def normalise(text: str) -> str:
    """Fold the whitespace HTML scatters through a sentence, and lowercase it."""
    return re.sub(r"\s+", " ", text).strip().lower()


def verify_excerpt(excerpt: str, page_text: str) -> bool:
    """True when this excerpt genuinely appears in the page.

    The generic extractor lets a local model fill fields the structural passes
    could not. Without this check that would quietly weaken the publish gate:
    a plausible invented fee would carry evidence that points nowhere. A field
    whose excerpt does not verify is dropped rather than kept at lower
    confidence, so an unevidenced fact never reaches a published record.
    """
    candidate = normalise(excerpt)
    if len(candidate) < 8:
        return False
    return candidate in normalise(page_text)
