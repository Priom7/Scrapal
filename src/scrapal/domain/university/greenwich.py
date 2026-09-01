import re
from typing import Any

from bs4 import BeautifulSoup, Tag

from scrapal.connectors.website import WebsiteConfig, WebsiteConnector
from scrapal.domain.university.schemas import (
    CourseFee,
    CourseIntake,
    CourseIntelligenceRecord,
    FieldEvidence,
    course_coverage,
)
from scrapal.extensions import ExtensionManifest


class GreenwichConfig(WebsiteConfig):
    start_url: str = "https://www.gre.ac.uk/sitemap.xml"
    allowed_domains: list[str] = ["www.gre.ac.uk"]
    include_patterns: list[str] = ["/undergraduate-courses/", "/postgraduate-courses/"]
    max_pages: int = 500
    max_depth: int = 0


def section_text(soup: BeautifulSoup, section_id: str) -> str | None:
    anchor = soup.select_one(f"#{section_id}")
    if not anchor:
        return None
    section = anchor.find_parent("section") or anchor.parent
    return section.get_text(" ", strip=True) if isinstance(section, Tag) else None


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def residency_kind(label: str) -> str:
    lowered = label.lower()
    if "international" in lowered or "overseas" in lowered:
        return "international"
    if "home" in lowered or "uk" in lowered:
        return "home"
    return "unknown"


def money(value: str) -> tuple[int | None, str | None]:
    match = re.search(r"£\s*([0-9][0-9,]*)", value)
    return (int(match.group(1).replace(",", "")), "GBP") if match else (None, None)


class GreenwichConnector(WebsiteConnector):
    manifest = ExtensionManifest(
        name="greenwich",
        version="0.1.0",
        description="University of Greenwich course and student knowledge connector.",
        capabilities=["sitemap", "course", "fees", "intakes", "requirements"],
        content_types=["text/html", "application/pdf"],
    )
    config_model = GreenwichConfig

    async def extract(self, url: str, content: bytes, content_type: str) -> dict[str, Any]:
        generic = await super().extract(url, content, content_type)
        if "/undergraduate-courses/" not in url and "/postgraduate-courses/" not in url:
            return generic
        soup = BeautifulSoup(content, "html.parser")
        heading = soup.select_one("h1")
        title = heading.get_text(" ", strip=True) if heading else generic["title"]

        field_evidence: dict[str, list[dict[str, Any]]] = {}

        def remember(
            field: str,
            excerpt: str,
            *,
            method: str,
            selector: str | None = None,
            section: str | None = None,
            confidence: float = 0.98,
        ) -> None:
            excerpt = clean_text(excerpt)
            if not excerpt:
                return
            evidence = FieldEvidence(
                source_url=url,
                field=field,
                method=method,
                excerpt=excerpt[:700],
                selector=selector,
                section=section,
                confidence=confidence,
            )
            field_evidence.setdefault(field, []).append(evidence.model_dump())

        if title:
            remember("title", title, method="css", selector="h1")

        def labelled(label: str, field: str) -> list[str]:
            node = next(
                (
                    n
                    for n in soup.select("h2, h3, h4")
                    if clean_text(n.get_text(" ", strip=True)).lower() == label.lower()
                ),
                None,
            )
            if not node:
                return []
            parent = node.parent
            if not isinstance(parent, Tag):
                return []
            values = [item.get_text(" ", strip=True) for item in parent.select("li")]
            if values:
                remember(field, "; ".join(values), method="labelled-list", section=label)
                return values
            text = (
                parent.get_text(" ", strip=True)
                .removeprefix(node.get_text(" ", strip=True))
                .strip()
            )
            if text:
                remember(field, text, method="labelled-text", section=label)
            return [text] if text else []

        def section(field: str, *ids: str) -> str | None:
            for section_id in ids:
                text = section_text(soup, section_id)
                if text:
                    remember(
                        field,
                        text,
                        method="section-anchor",
                        selector=f"#{section_id}",
                        section=section_id,
                    )
                    return text
            return None

        def section_items(field: str, *ids: str) -> list[str]:
            for section_id in ids:
                anchor = soup.select_one(f"#{section_id}")
                container = (anchor.find_parent("section") or anchor.parent) if anchor else None
                if isinstance(container, Tag):
                    items = [clean_text(item.get_text(" ", strip=True)) for item in container.select("li")]
                    if items:
                        remember(
                            field,
                            "; ".join(items),
                            method="section-list",
                            selector=f"#{section_id}",
                            section=section_id,
                        )
                        return items
            return []

        fee_rows: list[CourseFee] = []
        for row in soup.select(".gre-prog-fees-table tbody tr"):
            cells = [cell.get_text(" ", strip=True) for cell in row.select("th, td")]
            if len(cells) >= 2:
                amount, currency = money(" ".join(cells[1:]))
                fee_rows.append(
                    CourseFee(
                        residency=residency_kind(cells[0]),
                        label=cells[0],
                        amount=amount,
                        currency=currency,
                        raw_values=cells[1:],
                    )
                )
                remember(
                    "fees",
                    " | ".join(cells),
                    method="fee-table-row",
                    selector=".gre-prog-fees-table tbody tr",
                )
        starts = labelled("start month", "intake_months")
        months = re.findall(
            r"January|February|March|April|May|June|July|August|September|October|November|December",
            " ".join(starts),
            re.I,
        )
        intake_months = list(dict.fromkeys(month.title() for month in months))
        award = title.rsplit(",", 1)[-1].strip() if "," in title else None
        if award:
            remember("award", title, method="title-suffix", selector="h1", confidence=0.96)
        level = "undergraduate" if "/undergraduate-courses/" in url else "postgraduate"
        remember("level", url, method="url-pattern", confidence=1)
        campuses = labelled("location", "campuses")
        durations = labelled("duration", "durations")
        study_modes = list(
            dict.fromkeys(
                mode
                for duration in durations
                for mode in ("full-time", "part-time", "distance learning")
                if mode in duration.lower()
            )
        )
        if study_modes:
            remember(
                "study_modes",
                "; ".join(durations),
                method="duration-pattern",
                section="Duration",
                confidence=0.95,
            )
        intakes = [
            CourseIntake(
                month=month,
                study_modes=study_modes,
                durations=durations,
                campuses=campuses,
                scope="course_page",
            )
            for month in intake_months
        ]
        record_model = CourseIntelligenceRecord(
            title=title,
            award=award,
            level=level,
            school=labelled("school", "school"),
            campuses=campuses,
            study_modes=study_modes,
            durations=durations,
            intake_months=intake_months,
            intakes=intakes,
            fees=fee_rows,
            entry_requirements=section("entry_requirements", "entry-requirements"),
            english_requirements=section(
                "english_requirements", "english-language-requirements", "english-requirements"
            ),
            application_documents=section_items(
                "application_documents", "documents-required", "application-documents"
            ),
            application_routes=section_items(
                "application_routes", "how-to-apply", "apply", "applications"
            ),
            deadlines=section_items("deadlines", "application-deadlines", "deadlines"),
            modules=section_items("modules", "course-content", "modules"),
            accreditations=section_items("accreditations", "accreditations", "accreditation"),
            scholarships=section_items("scholarships", "scholarships", "funding"),
            course_content=section("course_content", "course-content"),
            careers=section("careers", "careers"),
            source_url=url,
        )
        coverage, missing_fields = course_coverage(record_model)
        contradictions: list[str] = []
        for fee in fee_rows:
            if fee.amount is None:
                contradictions.append(f"No numeric amount was found for {fee.label} fees")
        review_reasons = [f"Missing required field: {field}" for field in missing_fields]
        review_reasons.extend(contradictions)
        publication_state = "published" if coverage == 1 and not contradictions else "review"
        generic["structured_records"] = [
            {
                "schema_name": "university.course",
                "external_id": url,
                "data": record_model.model_dump(),
                "confidence": round(
                    sum(
                        evidence["confidence"]
                        for values in field_evidence.values()
                        for evidence in values
                    )
                    / max(1, sum(len(values) for values in field_evidence.values())),
                    3,
                ),
                "evidence": {
                    "source_url": url,
                    "method": "greenwich-course-intelligence-v2",
                    "fields": field_evidence,
                },
                "status": publication_state,
                "extractor_version": "greenwich-course-intelligence-v2",
                "validation": {
                    "coverage": coverage,
                    "required_fields": 8,
                    "missing_fields": missing_fields,
                    "contradictions": contradictions,
                    "review_reasons": review_reasons,
                },
            }
        ]
        return generic
