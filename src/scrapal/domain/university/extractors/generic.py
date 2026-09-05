"""Course extraction for any university, without per-site code.

Three structural sources, in decreasing reliability: JSON-LD a university
publishes about itself, key/value pairs in definition lists and two-column
tables, and sections found by heading text. Greenwich's extractor can rely on
stable anchor ids like #entry-requirements; no other site guarantees them,
so headings are matched by their words instead.
"""

import json
import re
from typing import Any

from bs4 import BeautifulSoup, Tag

from scrapal.domain.university.extractors.base import verify_excerpt
from scrapal.domain.university.schemas import (
    REQUIRED_COURSE_FIELDS,
    CourseFee,
    CourseIntake,
    CourseIntelligenceRecord,
    course_coverage,
)

MONTHS = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)
AWARD_PATTERN = re.compile(
    r"\b(BA|BSc|BEng|BEd|BN|LLB|MA|MSc|MEng|MBA|MPH|MRes|MArch|MMus|LLM|PhD|MPhil|EdD|DBA"
    r"|PGCE|PGCert|PGDip|FdA|FdSc|HND)"
    r"(?:\s*\(Hons\))?\b",
    re.I,
)
CURRENCY = {"£": "GBP", "€": "EUR", "$": "USD"}
MONEY_PATTERN = re.compile(r"([£€$])\s*([0-9][0-9,]{2,})")

# Which words in a key or a heading mean which field.
KEY_SIGNALS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("durations", ("duration", "course length", "length of course", "study duration")),
    ("campuses", ("campus", "location", "where you", "taught at")),
    ("intake_months", ("start date", "start dates", "intake", "starting", "commencement")),
    ("study_modes", ("study mode", "mode of study", "attendance")),
    ("school", ("school", "faculty", "department")),
    ("ucas_code", ("ucas code", "ucas tariff code", "course code")),
)
SECTION_SIGNALS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("entry_requirements", ("entry requirement", "admission requirement", "entry criteria")),
    ("english_requirements", ("english language", "english requirement", "language requirement")),
    ("course_content", ("course content", "what you will study", "about the course", "overview")),
    ("careers", ("career", "employability", "after the course", "graduate destinations")),
)
LIST_SECTION_SIGNALS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("modules", ("module", "course structure", "what you will study")),
    ("scholarships", ("scholarship", "bursary", "funding")),
    ("application_documents", ("documents required", "supporting documents", "what you need")),
    ("application_routes", ("how to apply", "applying", "application process")),
    ("deadlines", ("deadline", "closing date", "key dates")),
    ("accreditations", ("accreditation", "accredited by", "professional recognition")),
)
# A course lives on its own page, under a path segment that names it. A section
# prefix is not enough: Westminster files accommodation, open days and student
# profiles under /study/, and every one of those pages has an h1.
COURSE_URL_HINTS = ("/course/", "/courses/", "/programme/", "/program/", "/degree/")
# Paths that name a course section but never a single course.
NOT_A_COURSE_URL_HINTS = (
    "/accommodation", "/student-life", "/student-profiles", "/open-days-and-events",
    "/fees-and-funding", "/how-to-apply", "/after-you-apply", "/offer-holders",
    "/prospectus", "/programme-specifications", "/research-areas", "/course-search",
    "/subjects", "/chat-with-our-students", "/parents-and-supporters", "/faqs",
)

# What the model is asked for, and how its answer is folded back in.
LLM_FIELD_PROMPTS: dict[str, str] = {
    "award": "the qualification abbreviation, such as MSc, BEng (Hons) or LLM",
    "campuses": "the campus or campuses where the course is taught",
    "durations": "how long the course takes, as written",
    "intake_months": "the months the course starts, as full month names",
    "fees": "the tuition fee, including its currency symbol",
    "entry_requirements": "the academic entry requirements",
    "english_requirements": "the English language requirements",
}


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def field_for(label: str, signals: tuple[tuple[str, tuple[str, ...]], ...]) -> str | None:
    lowered = label.lower()
    for field, words in signals:
        if any(word in lowered for word in words):
            return field
    return None


def residency_of(label: str) -> str:
    lowered = label.lower()
    if any(word in lowered for word in ("international", "overseas", "non-eu", "non-eea")):
        return "international"
    if any(word in lowered for word in ("home", "uk", "domestic", "eu ")):
        return "home"
    return "unknown"


class GenericUniversityExtractor:
    version = "generic-university-v1"

    def __init__(self, ollama: Any | None = None, max_llm_fields: int = 8) -> None:
        self.ollama = ollama
        self.max_llm_fields = max_llm_fields

    async def extract_records(self, url: str, html: bytes) -> list[dict[str, Any]]:
        fields, evidence, page_text = self.structural(url, html)
        if not fields.get("title"):
            return []
        await self.model_pass(fields, evidence, page_text, url)
        return [self.build_record(url, fields, evidence, page_text)]

    # ---------------------------------------------------------------- passes

    def structural(
        self, url: str, html: bytes
    ) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]], str]:
        soup = BeautifulSoup(html, "html.parser")
        page_text = soup.get_text(" ", strip=True)
        fields: dict[str, Any] = {"source_url": url}
        evidence: dict[str, list[dict[str, Any]]] = {}

        def remember(
            field: str, excerpt: str, method: str, confidence: float, section: str | None = None
        ) -> None:
            evidence.setdefault(field, []).append(
                {
                    "source_url": url,
                    "field": field,
                    "method": method,
                    "excerpt": clean(excerpt)[:400],
                    "section": section,
                    "selector": None,
                    "confidence": confidence,
                }
            )

        self._from_json_ld(soup, fields, remember)
        self._from_heading(soup, url, fields, remember)
        if not self._looks_like_a_course(url, fields):
            return {}, {}, page_text
        self._from_key_values(soup, fields, remember)
        self._from_fee_tables(soup, fields, remember)
        self._from_sections(soup, fields, remember)
        self._derive(fields, remember)
        return fields, evidence, page_text

    def _looks_like_a_course(self, url: str, fields: dict[str, Any]) -> bool:
        """A campus page has an h1 too. Require a course signal before extracting."""
        if not fields.get("title"):
            return False
        lowered = url.lower()
        if any(hint in lowered for hint in NOT_A_COURSE_URL_HINTS):
            return False
        if str(fields["title"]).rstrip().endswith("?"):
            return False  # "Thinking of doing a PhD?" mentions an award; it is not one.
        if fields.get("award"):
            return True
        return any(hint in lowered for hint in COURSE_URL_HINTS)

    def _from_json_ld(self, soup: BeautifulSoup, fields: dict[str, Any], remember: Any) -> None:
        for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
            try:
                payload = json.loads(script.string or "{}")
            except (ValueError, TypeError):
                continue
            for block in payload if isinstance(payload, list) else [payload]:
                if not isinstance(block, dict):
                    continue
                if "Course" not in str(block.get("@type", "")):
                    continue
                if block.get("name"):
                    fields["title"] = clean(str(block["name"]))
                    remember("title", str(block["name"]), "jsonld", 0.99)
                instance = block.get("hasCourseInstance")
                instance = instance[0] if isinstance(instance, list) and instance else instance
                if isinstance(instance, dict):
                    if instance.get("location"):
                        fields["campuses"] = [clean(str(instance["location"]))]
                        remember("campuses", str(instance["location"]), "jsonld", 0.95)
                    if instance.get("courseMode"):
                        fields["study_modes"] = [clean(str(instance["courseMode"])).lower()]
                        remember("study_modes", str(instance["courseMode"]), "jsonld", 0.95)
                    start = str(instance.get("startDate", ""))
                    month = self._month_of_iso_date(start)
                    if month:
                        fields["intake_months"] = [month]
                        remember("intake_months", start, "jsonld", 0.95)

    @staticmethod
    def _month_of_iso_date(value: str) -> str | None:
        match = re.match(r"\d{4}-(\d{2})", value)
        if not match:
            return None
        index = int(match.group(1))
        return MONTHS[index - 1] if 1 <= index <= 12 else None

    def _from_heading(
        self, soup: BeautifulSoup, url: str, fields: dict[str, Any], remember: Any
    ) -> None:
        heading = soup.select_one("h1")
        title = clean(heading.get_text(" ", strip=True)) if heading else fields.get("title", "")
        if title:
            fields["title"] = title
            remember("title", title, "h1", 0.97)
        award = AWARD_PATTERN.search(title or "")
        if award:
            fields["award"] = award.group(0).replace("(hons)", "(Hons)")
            remember("award", title, "title-award-pattern", 0.94)
        lowered = f"{url} {title}".lower()
        if "postgraduate" in lowered or (
            fields.get("award", "").upper().startswith(("M", "PG", "LLM", "PHD"))
        ):
            fields["level"] = "postgraduate"
            remember("level", title or url, "award-or-url", 0.92)
        elif "undergraduate" in lowered or fields.get("award", "").upper().startswith(
            ("B", "LLB")
        ):
            fields["level"] = "undergraduate"
            remember("level", title or url, "award-or-url", 0.92)

    def _from_key_values(self, soup: BeautifulSoup, fields: dict[str, Any], remember: Any) -> None:
        """Definition lists and two-column tables carry most of the key facts."""
        pairs: list[tuple[str, str, str]] = []
        for definition in soup.find_all("dl"):
            terms = definition.find_all("dt")
            for term in terms:
                definition_value = term.find_next_sibling("dd")
                if definition_value is not None:
                    pairs.append(
                        (clean(term.get_text(" ", strip=True)),
                         clean(definition_value.get_text(" ", strip=True)), "dl-pair")
                    )
        for row in soup.select("table tr"):
            cells = row.find_all(["th", "td"])
            if len(cells) == 2:
                pairs.append(
                    (clean(cells[0].get_text(" ", strip=True)),
                     clean(cells[1].get_text(" ", strip=True)), "table-pair")
                )
        for label, value, method in pairs:
            field = field_for(label, KEY_SIGNALS)
            if not field or not value:
                continue
            if field == "intake_months":
                months = [m for m in MONTHS if m.lower() in value.lower()]
                if months:
                    fields["intake_months"] = months
                    remember("intake_months", f"{label}: {value}", method, 0.93, label)
            elif field == "ucas_code":
                fields["ucas_code"] = value
                remember("ucas_code", f"{label}: {value}", method, 0.93, label)
            elif field == "study_modes":
                modes = [
                    mode for mode in ("full-time", "part-time", "distance learning", "online")
                    if mode in value.lower()
                ]
                if modes:
                    fields["study_modes"] = modes
                    remember("study_modes", f"{label}: {value}", method, 0.93, label)
            else:
                fields.setdefault(field, [])
                if value not in fields[field]:
                    fields[field].append(value)
                    remember(field, f"{label}: {value}", method, 0.93, label)

    def _from_fee_tables(self, soup: BeautifulSoup, fields: dict[str, Any], remember: Any) -> None:
        fees: list[dict[str, Any]] = []
        for row in soup.select("table tr"):
            cells = [clean(cell.get_text(" ", strip=True)) for cell in row.find_all(["th", "td"])]
            if len(cells) < 2:
                continue
            label, rest = cells[0], " ".join(cells[1:])
            match = MONEY_PATTERN.search(rest)
            if not match:
                continue
            residency = residency_of(label)
            # "student" alone is too loose — a cost-of-living row says "student"
            # too, and a bogus fee is the one error that can reach a published
            # record looking legitimate.
            if residency == "unknown" and not any(
                word in label.lower() for word in ("fee", "tuition", "cost of the course")
            ):
                continue
            fees.append(
                CourseFee(
                    residency=residency,
                    label=label,
                    amount=int(match.group(2).replace(",", "")),
                    currency=CURRENCY.get(match.group(1)),
                    raw_values=[rest],
                ).model_dump()
            )
            remember("fees", f"{label}: {rest}", "fee-table", 0.94, "Fees")
        if fees:
            fields["fees"] = fees

    def _section_body(self, heading: Tag) -> str:
        """Text between a heading and the next heading of the same or higher rank."""
        rank = int(heading.name[1])
        parts: list[str] = []
        for node in heading.find_all_next():
            if isinstance(node, Tag) and re.fullmatch(r"h[1-6]", node.name or ""):
                if int(node.name[1]) <= rank:
                    break
            if isinstance(node, Tag) and node.name in {"p", "li"}:
                parts.append(clean(node.get_text(" ", strip=True)))
        return " ".join(part for part in parts if part)

    def _section_items(self, heading: Tag) -> list[str]:
        rank = int(heading.name[1])
        items: list[str] = []
        for node in heading.find_all_next():
            if isinstance(node, Tag) and re.fullmatch(r"h[1-6]", node.name or ""):
                if int(node.name[1]) <= rank:
                    break
            if isinstance(node, Tag) and node.name == "li":
                text = clean(node.get_text(" ", strip=True))
                if text and text not in items:
                    items.append(text)
        return items

    def _from_sections(self, soup: BeautifulSoup, fields: dict[str, Any], remember: Any) -> None:
        for heading in soup.find_all(["h2", "h3", "h4"]):
            label = clean(heading.get_text(" ", strip=True))
            prose_field = field_for(label, SECTION_SIGNALS)
            if prose_field and not fields.get(prose_field):
                body = self._section_body(heading)
                if body:
                    fields[prose_field] = body
                    remember(prose_field, body, "heading-section", 0.9, label)
            list_field = field_for(label, LIST_SECTION_SIGNALS)
            if list_field and not fields.get(list_field):
                items = self._section_items(heading)
                if items:
                    fields[list_field] = items
                    remember(list_field, "; ".join(items), "heading-list", 0.9, label)

    def _derive(self, fields: dict[str, Any], remember: Any) -> None:
        """Facts implied by facts already read."""
        if not fields.get("study_modes") and fields.get("durations"):
            modes = [
                mode for mode in ("full-time", "part-time", "distance learning")
                if any(mode in duration.lower() for duration in fields["durations"])
            ]
            if modes:
                fields["study_modes"] = modes
                remember("study_modes", "; ".join(fields["durations"]), "duration-pattern", 0.88)
        fields["intakes"] = [
            CourseIntake(
                month=month,
                study_modes=fields.get("study_modes", []),
                durations=fields.get("durations", []),
                campuses=fields.get("campuses", []),
                scope="course_page",
            ).model_dump()
            for month in fields.get("intake_months", [])
        ]
        if fields.get("intakes"):
            remember(
                "intakes",
                "; ".join(fields.get("intake_months", [])),
                "derived-from-intake-months",
                0.85,
            )

    async def model_pass(
        self,
        fields: dict[str, Any],
        evidence: dict[str, list[dict[str, Any]]],
        page_text: str,
        url: str,
    ) -> None:
        """Ask the local model only for required fields the structure missed.

        A returned field is kept only when its excerpt is verbatim on the page.
        Anything the model cannot point at is discarded, so a record can never
        publish on a fact that has no evidence behind it.
        """
        if self.ollama is None:
            return
        wanted = [
            field
            for field in REQUIRED_COURSE_FIELDS
            if field in LLM_FIELD_PROMPTS and not fields.get(field)
        ][: self.max_llm_fields]
        if not wanted:
            return
        schema = {
            "type": "object",
            "properties": {
                field: {
                    "type": "object",
                    "properties": {
                        "value": {"type": "string"},
                        "excerpt": {"type": "string"},
                    },
                    "required": ["value", "excerpt"],
                }
                for field in wanted
            },
        }
        asked = "\n".join(f"- {field}: {LLM_FIELD_PROMPTS[field]}" for field in wanted)
        prompt = (
            "Read this university course page and report only the fields listed.\n"
            "For each field give the value and, in 'excerpt', the exact sentence from "
            "the page that states it, copied word for word. If the page does not state "
            "a field, omit that field entirely. Never guess.\n\n"
            f"Fields:\n{asked}\n\nPage:\n{page_text[:12000]}"
        )
        try:
            answer = await self.ollama.structured([{"role": "user", "content": prompt}], schema)
        except Exception:
            # A model outage is not a crawl failure. The record simply stays
            # in review with its missing fields named.
            return
        for field in wanted:
            entry = answer.get(field)
            if not isinstance(entry, dict):
                continue
            value, excerpt = str(entry.get("value", "")), str(entry.get("excerpt", ""))
            if not value or not verify_excerpt(excerpt, page_text):
                continue
            parsed = self._coerce(field, value)
            if parsed in (None, [], ""):
                continue
            fields[field] = parsed
            evidence.setdefault(field, []).append(
                {
                    "source_url": url,
                    "field": field,
                    "method": "llm-verified",
                    "excerpt": clean(excerpt)[:400],
                    "section": None,
                    "selector": None,
                    "confidence": 0.7,
                }
            )
        self._derive(fields, lambda *args, **kwargs: None)

    def _coerce(self, field: str, value: str) -> Any:
        """Turn the model's string into the shape the schema expects."""
        if field == "fees":
            match = MONEY_PATTERN.search(value)
            if not match:
                return None
            return [
                CourseFee(
                    residency="international",
                    label="Tuition",
                    amount=int(match.group(2).replace(",", "")),
                    currency=CURRENCY.get(match.group(1)),
                    raw_values=[value],
                ).model_dump()
            ]
        if field == "intake_months":
            return [month for month in MONTHS if month.lower() in value.lower()]
        if field in {"campuses", "durations"}:
            return [clean(part) for part in re.split(r"[;,]", value) if clean(part)]
        return clean(value)

    # ------------------------------------------------------------ assembling

    def build_record(
        self,
        url: str,
        fields: dict[str, Any],
        evidence: dict[str, list[dict[str, Any]]],
        page_text: str,
    ) -> dict[str, Any]:
        payload = {key: value for key, value in fields.items() if value not in (None, [], "")}
        payload.setdefault("level", "postgraduate")
        payload["source_url"] = url
        model = CourseIntelligenceRecord.model_validate(payload)
        coverage, missing = course_coverage(model)
        # course_coverage only asks whether a value is present. A value can be
        # present without having been read from the page — `level` is defaulted
        # below so the model validates at all. Coverage has to mean evidenced,
        # or the publish gate is guarding a number that already lied.
        unevidenced = [
            field
            for field in REQUIRED_COURSE_FIELDS
            if field not in missing and not evidence.get(field)
        ]
        if unevidenced:
            missing = sorted(missing + unevidenced, key=REQUIRED_COURSE_FIELDS.index)
            coverage = round(
                (len(REQUIRED_COURSE_FIELDS) - len(missing)) / len(REQUIRED_COURSE_FIELDS), 3
            )
        contradictions = [
            f"No numeric amount was found for {fee.label} fees"
            for fee in model.fees
            if fee.amount is None
        ]
        reasons = [f"Missing required field: {field}" for field in missing] + contradictions
        confidences = [entry["confidence"] for values in evidence.values() for entry in values]
        return {
            "schema_name": "university.course",
            "external_id": url,
            "data": model.model_dump(),
            "confidence": round(sum(confidences) / max(1, len(confidences)), 3),
            "evidence": {"source_url": url, "method": self.version, "fields": evidence},
            "status": "published" if coverage == 1 and not contradictions else "review",
            "extractor_version": self.version,
            "validation": {
                "coverage": coverage,
                "required_fields": len(REQUIRED_COURSE_FIELDS),
                "missing_fields": missing,
                "contradictions": contradictions,
                "review_reasons": reasons,
            },
        }
