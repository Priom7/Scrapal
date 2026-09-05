from pathlib import Path
from typing import Any

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


async def test_a_required_field_nobody_read_does_not_count_as_covered() -> None:
    # `level` is a required Literal, so a record is given a default to validate
    # at all. That default must never be mistaken for a fact read from the page:
    # it has no evidence, so it counts as missing and the record cannot publish.
    page = (
        b"<html><body><h1>Marine Ecology</h1>"
        b"<p>Tuition for international students is 14,000 pounds.</p></body></html>"
    )
    records = await GenericUniversityExtractor().extract_records(
        "https://www.example.ac.uk/courses/marine-ecology", page
    )
    record = records[0]
    assert record["data"]["level"] == "postgraduate"
    assert "level" not in record["evidence"]["fields"]
    assert "level" in record["validation"]["missing_fields"]
    assert record["status"] == "review"
    assert record["validation"]["coverage"] < 1


async def test_coverage_counts_only_fields_that_carry_evidence() -> None:
    html = Path("tests/fixtures/westminster_course.html").read_bytes()
    records = await GenericUniversityExtractor().extract_records(
        "https://www.westminster.ac.uk/media-campaigning-social-change-ma", html
    )
    record = records[0]
    evidenced = set(record["evidence"]["fields"])
    for field in record["data"]:
        if field in record["validation"]["missing_fields"]:
            continue
        if record["data"][field] in (None, [], ""):
            continue
        # Anything present and not reported missing must be able to prove itself.
        assert field in evidenced or field in {"level", "source_url", "intakes"}, field
    assert record["validation"]["required_fields"] == 8
    # intakes is derived, but it still cites the months it was derived from
    if record["data"]["intakes"]:
        assert record["evidence"]["fields"]["intakes"][0]["method"] == (
            "derived-from-intake-months"
        )


async def test_a_cost_of_living_row_is_not_read_as_tuition() -> None:
    # "student" alone used to qualify a table row as a fee, which turned a
    # living-costs table into a tuition figure — the one kind of error that
    # can reach a published record looking entirely legitimate.
    page = (
        b"<html><body><h1>Marine Ecology, MSc</h1>"
        b"<dl><dt>Duration</dt><dd>1 year full-time</dd>"
        b"<dt>Location</dt><dd>Plymouth Campus</dd>"
        b"<dt>Start dates</dt><dd>September</dd></dl>"
        b"<h2>Living costs</h2><table><tbody>"
        b"<tr><th>Average student spend</th><td>&pound;1,200 per month</td></tr>"
        b"</tbody></table>"
        b"<h2>Entry requirements</h2><p>A 2:1 honours degree in a science subject.</p>"
        b"</body></html>"
    )
    records = await GenericUniversityExtractor().extract_records(
        "https://www.example.ac.uk/courses/marine-ecology-msc", page
    )
    record = records[0]
    assert record["data"]["fees"] == []
    assert "fees" in record["validation"]["missing_fields"]
    assert record["status"] == "review"



class FakeOllama:
    """Stands in for the local model. Tests never reach a real one."""

    def __init__(self, reply: dict[str, Any]) -> None:
        self.reply = reply
        self.calls = 0

    async def structured(
        self, messages: list[dict[str, str]], schema: dict[str, Any], **kwargs: Any
    ) -> dict[str, Any]:
        self.calls += 1
        self.last_prompt = messages[-1]["content"]
        return self.reply


BARE_FEE_PAGE = (
    b"<html><body><h1>Data Science, MSc</h1>"
    b"<p>Tuition for international students is 15,400 pounds for the full course.</p>"
    b"<p>The course runs for one year.</p></body></html>"
)


async def test_model_fills_a_field_the_structure_missed_when_it_can_quote_the_page() -> None:
    ollama = FakeOllama(
        {
            "fees": {
                "value": "£15,400",
                "excerpt": "Tuition for international students is 15,400 pounds for the full course.",
            }
        }
    )
    records = await GenericUniversityExtractor(ollama=ollama).extract_records(
        "https://www.example.ac.uk/courses/data-science-msc", BARE_FEE_PAGE
    )
    record = records[0]
    assert ollama.calls == 1
    assert record["data"]["fees"][0]["amount"] == 15400
    assert record["evidence"]["fields"]["fees"][0]["method"] == "llm-verified"
    assert record["evidence"]["fields"]["fees"][0]["confidence"] == 0.7


async def test_model_field_is_dropped_when_its_quote_is_not_on_the_page() -> None:
    ollama = FakeOllama(
        {"fees": {"value": "£22,000", "excerpt": "International tuition is £22,000 per year."}}
    )
    records = await GenericUniversityExtractor(ollama=ollama).extract_records(
        "https://www.example.ac.uk/courses/data-science-msc", BARE_FEE_PAGE
    )
    record = records[0]
    assert record["data"]["fees"] == []
    assert "fees" in record["validation"]["missing_fields"]
    assert record["status"] == "review"


async def test_the_model_is_not_called_when_the_structure_already_filled_everything() -> None:
    ollama = FakeOllama({})
    html = Path("tests/fixtures/buckingham_course.html").read_bytes()
    await GenericUniversityExtractor(ollama=ollama).extract_records(
        "https://www.buckingham.ac.uk/courses/llm-international-commercial-law", html
    )
    assert ollama.calls == 0


async def test_a_model_outage_leaves_a_reviewable_record_rather_than_failing_the_crawl() -> None:
    class Broken:
        async def structured(self, messages: Any, schema: Any, **kwargs: Any) -> dict[str, Any]:
            raise RuntimeError("ollama unavailable")

    records = await GenericUniversityExtractor(ollama=Broken()).extract_records(
        "https://www.example.ac.uk/courses/data-science-msc", BARE_FEE_PAGE
    )
    assert records[0]["status"] == "review"
    assert "fees" in records[0]["validation"]["missing_fields"]


async def test_a_universitys_study_section_is_not_a_course_catalogue() -> None:
    """Westminster files accommodation and open days under /study/, so the section
    prefix alone cannot stand in for a course signal."""
    extractor = GenericUniversityExtractor()
    for url, heading in (
        ("https://www.westminster.ac.uk/study/accommodation/harrow-hall", "Harrow Hall"),
        ("https://www.westminster.ac.uk/study/student-life/cultural-london", "Cultural London"),
        ("https://www.westminster.ac.uk/study/postgraduate/how-to-apply", "How to apply"),
        ("https://www.westminster.ac.uk/study/fees-and-funding/fees", "Fees"),
        ("https://www.westminster.ac.uk/study/student-profiles/usbah-aamir", "Usbah Aamir"),
        (
            "https://www.westminster.ac.uk/study/postgraduate/research-degrees/thinking-of-doing-a-phd",
            "Thinking of doing a PhD?",
        ),
        ("https://www.westminster.ac.uk/course-search", "Course Search"),
    ):
        html = f"<html><body><h1>{heading}</h1><p>Some prose.</p></body></html>".encode()
        assert await extractor.extract_records(url, html) == [], url


async def test_a_real_course_page_under_a_study_section_still_extracts() -> None:
    """Tightening the guard must not lock out course pages that live under /study/."""
    html = (
        b"<html><body><h1>Business Management BA (Hons)</h1>"
        b"<dl><dt>Duration</dt><dd>3 years full-time</dd></dl></body></html>"
    )
    records = await GenericUniversityExtractor().extract_records(
        "https://www.westminster.ac.uk/study/undergraduate/courses/business-management-ba", html
    )
    assert records and records[0]["data"]["title"] == "Business Management BA (Hons)"
