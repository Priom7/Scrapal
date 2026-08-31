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
    assert record["data"]["fees"][1]["residency"] == "International"
    assert "2:2" in record["data"]["entry_requirements"]
