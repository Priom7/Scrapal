from pathlib import Path

import pytest

from scrapal.domain.university.greenwich import GreenwichConnector


@pytest.mark.asyncio
async def test_greenwich_course_extraction_models_intakes_and_fees() -> None:
    content = Path("tests/fixtures/greenwich_course.html").read_bytes()
    result = await GreenwichConnector().extract(
        "https://www.gre.ac.uk/postgraduate-courses/eduhea/ed",
        content,
        "text/html",
    )
    record = result["structured_records"][0]
    assert record["schema_name"] == "university.course"
    assert record["data"]["title"] == "Education, MA"
    assert record["data"]["intake_months"] == ["September", "January"]
    assert record["data"]["durations"] == ["1 year full-time", "2-3 years part-time"]
    assert record["data"]["study_modes"] == ["full-time", "part-time"]
    assert record["data"]["fees"][1]["residency"] == "international"
    assert record["data"]["fees"][1]["amount"] == 18700
    assert record["data"]["intakes"][0]["scope"] == "course_page"
    assert "2:2" in record["data"]["entry_requirements"]
    assert "IELTS 6.5" in record["data"]["english_requirements"]
    assert record["data"]["application_documents"] == [
        "Academic transcript",
        "Personal statement",
    ]
    assert record["validation"]["coverage"] == 1
    assert record["validation"]["missing_fields"] == []
    assert record["status"] == "published"
    assert record["evidence"]["fields"]["fees"][1]["excerpt"].startswith("International")


@pytest.mark.asyncio
async def test_greenwich_course_routes_incomplete_records_to_review() -> None:
    content = b"<html><body><h1>Data Science, MSc</h1></body></html>"
    result = await GreenwichConnector().extract(
        "https://www.gre.ac.uk/postgraduate-courses/engsci/data-science",
        content,
        "text/html",
    )
    record = result["structured_records"][0]
    assert record["status"] == "review"
    assert "fees" in record["validation"]["missing_fields"]
    assert record["validation"]["coverage"] < 1
