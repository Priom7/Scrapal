"""Which extractor reads a given institution's pages.

Order: an explicit override on the institution, then a site-specific
extractor registered for its domain, then the generic one. Adding a
university requires no entry here.
"""

from collections.abc import Callable

from scrapal.domain.university.extractors.base import CourseExtractor
from scrapal.domain.university.extractors.generic import GenericUniversityExtractor
from scrapal.domain.university.extractors.greenwich import GreenwichCourseExtractor

DOMAIN_EXTRACTORS: dict[str, Callable[[], CourseExtractor]] = {
    "gre.ac.uk": GreenwichCourseExtractor,
}
NAMED_EXTRACTORS: dict[str, Callable[[], CourseExtractor]] = {
    "generic": GenericUniversityExtractor,
    "greenwich": GreenwichCourseExtractor,
}


def resolve_extractor(domain: str | None, override: str | None = None) -> CourseExtractor:
    if override and override in NAMED_EXTRACTORS:
        return NAMED_EXTRACTORS[override]()
    if domain and domain in DOMAIN_EXTRACTORS:
        return DOMAIN_EXTRACTORS[domain]()
    return GenericUniversityExtractor()
