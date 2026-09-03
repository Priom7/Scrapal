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


async def test_generic_reads_a_definition_list_and_fee_table_page() -> None:
    html = Path("tests/fixtures/buckingham_course.html").read_bytes()
    records = await GenericUniversityExtractor().extract_records(
        "https://www.buckingham.ac.uk/courses/llm-international-commercial-law", html
    )
    assert len(records) == 1
    record = records[0]
    data = record["data"]
    assert data["title"] == "International and Commercial Law, LLM"
    assert data["award"] == "LLM"
    assert data["level"] == "postgraduate"
    assert data["campuses"] == ["Buckingham Campus"]
    assert data["durations"] == ["12 months full-time"]
    assert data["intake_months"] == ["January", "September"]
    assert {fee["residency"] for fee in data["fees"]} == {"home", "international"}
    assert [fee["amount"] for fee in data["fees"]] == [16140, 19320]
    assert "second-class honours" in data["entry_requirements"]
    assert "IELTS 6.5" in data["english_requirements"]
    assert data["modules"] == ["International Trade Law", "Corporate Governance", "Dissertation"]
    assert record["extractor_version"] == "generic-university-v1"
    assert record["validation"]["coverage"] == 1
    assert record["status"] == "published"
    # every filled field carries a quote that is on the page
    for field, entries in record["evidence"]["fields"].items():
        for entry in entries:
            assert entry["excerpt"], field


async def test_generic_reads_json_ld_and_routes_a_feeless_page_to_review() -> None:
    html = Path("tests/fixtures/westminster_course.html").read_bytes()
    records = await GenericUniversityExtractor().extract_records(
        "https://www.westminster.ac.uk/media-campaigning-social-change-ma", html
    )
    record = records[0]
    assert record["data"]["title"] == "Media, Campaigning and Social Change, MA"
    assert record["data"]["award"] == "MA"
    assert record["data"]["campuses"] == ["Harrow Campus, London"]
    assert record["data"]["intake_months"] == ["September"]
    assert record["data"]["fees"] == []
    # No fee on the page means the record cannot publish, and says which field is short.
    assert record["status"] == "review"
    assert "fees" in record["validation"]["missing_fields"]
    assert record["validation"]["coverage"] < 1


async def test_generic_returns_nothing_for_a_page_that_is_not_a_course() -> None:
    html = b"<html><body><h2>Our campuses</h2><p>Visit us.</p></body></html>"
    records = await GenericUniversityExtractor().extract_records(
        "https://www.buckingham.ac.uk/about/campus", html
    )
    assert records == []
