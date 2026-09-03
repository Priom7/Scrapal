from pathlib import Path

from scrapal.domain.university.extractors.base import normalise, verify_excerpt
from scrapal.domain.university.extractors.generic import GenericUniversityExtractor
from scrapal.domain.university.extractors.greenwich import GreenwichCourseExtractor
from scrapal.domain.university.extractors.registry import resolve_extractor


def test_registry_prefers_a_site_override_then_the_domain_then_the_generic() -> None:
    assert isinstance(resolve_extractor("gre.ac.uk"), GreenwichCourseExtractor)
    assert isinstance(resolve_extractor("buckingham.ac.uk"), GenericUniversityExtractor)
    assert isinstance(resolve_extractor(None), GenericUniversityExtractor)
    assert isinstance(resolve_extractor("gre.ac.uk", override="generic"), GenericUniversityExtractor)


async def test_greenwich_extractor_still_produces_what_it_always_did() -> None:
    html = Path("tests/fixtures/greenwich_course.html").read_bytes()
    records = await GreenwichCourseExtractor().extract_records(
        "https://www.gre.ac.uk/postgraduate-courses/eduhea/ed", html
    )
    assert len(records) == 1
    assert records[0]["data"]["title"] == "Education, MA"
    assert records[0]["extractor_version"] == "greenwich-course-intelligence-v2"


def test_normalise_collapses_the_whitespace_html_scatters_through_a_sentence() -> None:
    assert normalise("International  students:\n £17,900\tper year") == (
        "international students: £17,900 per year"
    )


def test_verify_excerpt_accepts_a_quote_that_is_really_on_the_page() -> None:
    page = "Tuition and fees. International students: £17,900 per year. Apply now."
    assert verify_excerpt("International students: £17,900 per year", page) is True


def test_verify_excerpt_rejects_a_quote_the_model_invented() -> None:
    # This is the rule the whole generic extractor rests on. A model that
    # cannot point at the page does not get to fill the field.
    page = "Tuition and fees. International students: £17,900 per year."
    assert verify_excerpt("International students: £18,400 per year", page) is False
    assert verify_excerpt("", page) is False
    assert verify_excerpt("   ", page) is False
