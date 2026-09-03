"""The hand-written Greenwich extractor, behind the registry's interface.

Greenwich's pages use stable anchor ids, which the generic extractor cannot
assume. Keeping this as a site override preserves the accuracy of the 211
records already published from it.
"""

from typing import Any

from scrapal.domain.university.greenwich import GreenwichConnector


class GreenwichCourseExtractor:
    version = "greenwich-course-intelligence-v2"

    async def extract_records(self, url: str, html: bytes) -> list[dict[str, Any]]:
        extracted = await GreenwichConnector().extract(url, html, "text/html")
        return list(extracted.get("structured_records", []))
