import re
from typing import Any

from bs4 import BeautifulSoup, Tag

from scrapal.connectors.website import WebsiteConfig, WebsiteConnector
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

        def labelled(label: str) -> list[str]:
            node = next(
                (
                    n
                    for n in soup.select("h2, h3, h4")
                    if n.get_text(" ", strip=True).lower() == label
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
                return values
            text = (
                parent.get_text(" ", strip=True)
                .removeprefix(node.get_text(" ", strip=True))
                .strip()
            )
            return [text] if text else []

        fee_rows: list[dict[str, Any]] = []
        for row in soup.select(".gre-prog-fees-table tbody tr"):
            cells = [cell.get_text(" ", strip=True) for cell in row.select("th, td")]
            if len(cells) >= 2:
                fee_rows.append({"residency": cells[0], "values": cells[1:]})
        starts = labelled("start month")
        months = re.findall(
            r"January|February|March|April|May|June|July|August|September|October|November|December",
            " ".join(starts),
            re.I,
        )
        record = {
            "title": title,
            "award": title.rsplit(",", 1)[-1].strip() if "," in title else None,
            "level": "undergraduate" if "/undergraduate-courses/" in url else "postgraduate",
            "school": labelled("school"),
            "locations": labelled("location"),
            "durations": labelled("duration"),
            "intake_months": list(dict.fromkeys(month.title() for month in months)),
            "fees": fee_rows,
            "entry_requirements": section_text(soup, "entry-requirements"),
            "course_content": section_text(soup, "course-content"),
            "careers": section_text(soup, "careers"),
            "source_url": url,
        }
        generic["structured_records"] = [
            {
                "schema_name": "university.course",
                "external_id": url,
                "data": record,
                "confidence": 0.98,
                "evidence": {"source_url": url, "method": "greenwich-css-v1"},
            }
        ]
        return generic
