import re
from collections import Counter
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from scrapal.connectors.website import extract_links, validate_public_url

UNIVERSITY_FIELDS = [
    "title",
    "award",
    "level",
    "campuses",
    "study_modes",
    "durations",
    "intake_months",
    "fees",
    "entry_requirements",
    "english_requirements",
    "application_documents",
    "application_routes",
    "deadlines",
    "scholarships",
]

PAGE_SIGNALS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("course", ("course", "programme", "program", "degree", "undergraduate", "postgraduate")),
    ("fees", ("fee", "tuition", "funding", "cost")),
    ("admissions", ("admission", "apply", "application", "entry-requirement")),
    ("international", ("international", "visa", "english-language")),
    ("scholarship", ("scholarship", "bursary")),
    ("student-support", ("accommodation", "student-support", "campus", "student-life")),
)


def classify_page_type(url: str, title: str = "") -> str:
    haystack = f"{urlparse(url).path} {title}".lower().replace("_", "-")
    for page_type, signals in PAGE_SIGNALS:
        if any(signal in haystack for signal in signals):
            return page_type
    return "general"


def coverage_contract(domain_pack: str, requested: list[str]) -> list[str]:
    if requested:
        return list(dict.fromkeys(field.strip().lower().replace(" ", "_") for field in requested if field.strip()))
    return UNIVERSITY_FIELDS.copy() if domain_pack == "university" else ["title", "summary", "source_url"]


def suggested_patterns(urls: list[str], domain_pack: str) -> list[str]:
    if domain_pack != "university":
        return []
    paths = [urlparse(url).path.lower() for url in urls]
    candidates = (
        "/undergraduate-courses/",
        "/postgraduate-courses/",
        "/courses/",
        "/programmes/",
        "/programs/",
        "/degrees/",
        "/study/",
    )
    discovered = [pattern for pattern in candidates if any(pattern in path for path in paths)]
    # A homepage sample is intentionally small and may expose only one study level.
    # Keep the common course families in the approved sitemap filter; patterns that
    # do not exist on the target domain simply match nothing.
    defaults = [
        "/undergraduate-courses/",
        "/postgraduate-courses/",
        "/courses/",
        "/programmes/",
        "/programs/",
        "/degrees/",
    ]
    return list(dict.fromkeys([*discovered, *defaults]))


def _sitemaps(robots_text: str, base_url: str) -> list[str]:
    values = re.findall(r"(?im)^\s*sitemap\s*:\s*(\S+)\s*$", robots_text)
    return list(dict.fromkeys(urljoin(base_url, value) for value in values))


async def preview_blueprint(
    start_url: str,
    *,
    domain_pack: str,
    requested_fields: list[str],
    max_pages: int,
) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    await validate_public_url(start_url)
    parsed = urlparse(start_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    robots_url = f"{origin}/robots.txt"
    headers = {"User-Agent": "ScrapalBlueprint/0.1 (+crawl planning; no bulk fetch)"}
    async with httpx.AsyncClient(timeout=12, follow_redirects=True, headers=headers) as client:
        robots_response, page_response = await _fetch_pair(client, robots_url, start_url)
    await validate_public_url(str(page_response.url))
    page_response.raise_for_status()
    content_type = page_response.headers.get("content-type", "")
    html = page_response.content
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else parsed.hostname or start_url
    from scrapal.connectors.website import WebsiteConfig

    config = WebsiteConfig(start_url=start_url, allowed_domains=[parsed.hostname or ""], max_pages=max_pages, max_depth=2)
    is_xml = "xml" in content_type or html.lstrip().startswith(b"<?xml")
    if is_xml:
        candidates = re.findall(r"<loc>\s*([^<]+?)\s*</loc>", page_response.text, re.I)
    else:
        candidates = extract_links(start_url, html, config) if "html" in content_type else []
    candidates = candidates[:200]
    classified = [
        {"url": value, "page_type": classify_page_type(value), "reason": "URL and navigation signal"}
        for value in candidates
    ]
    counts = Counter(item["page_type"] for item in classified)
    sitemap_urls = _sitemaps(robots_response.text if robots_response and robots_response.status_code < 400 else "", origin)
    if is_xml:
        sitemap_urls = list(dict.fromkeys([start_url, *sitemap_urls]))
    include_patterns = suggested_patterns(candidates, domain_pack)
    required_fields = coverage_contract(domain_pack, requested_fields)
    discovery = {
        "title": title,
        "origin": origin,
        "sampled_pages": 1,
        "links_observed": len(candidates),
        "page_type_counts": dict(counts),
        "candidate_pages": classified[:20],
        "sitemaps": sitemap_urls[:5],
        "robots_status": robots_response.status_code if robots_response else None,
        "robots_accessible": bool(robots_response and robots_response.status_code < 400),
        "warnings": [] if candidates or sitemap_urls else ["No sitemap or eligible links were discovered from the starting page."],
    }
    source_url = sitemap_urls[0] if sitemap_urls else start_url
    suggested_config = {
        "start_url": source_url,
        "allowed_domains": [parsed.hostname] if parsed.hostname else [],
        "include_patterns": include_patterns,
        "exclude_patterns": ["/news/", "/events/", "/staff/", "/search", "?"],
        "max_pages": max_pages,
        "max_depth": 0 if sitemap_urls else 2,
        "respect_robots": True,
        "objective_fields": required_fields,
        "domain_pack": domain_pack,
    }
    return discovery, suggested_config, required_fields


async def _fetch_pair(
    client: httpx.AsyncClient, robots_url: str, start_url: str
) -> tuple[httpx.Response | None, httpx.Response]:
    try:
        robots = await client.get(robots_url)
    except httpx.HTTPError:
        robots = None
    page = await client.get(start_url)
    return robots, page
