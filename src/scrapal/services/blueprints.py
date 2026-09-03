import asyncio
import re
from collections import Counter
from typing import Any
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

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


def detect_evidence_fields(html: bytes, url: str, required_fields: list[str]) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True).lower()
    path = urlparse(url).path.lower()
    signals: dict[str, bool] = {
        "title": bool(soup.select_one("h1") or soup.title),
        "award": bool(re.search(r"\b(bsc|ba|bed|meng|msc|ma|mba|mph|phd|llb|llm)\b", text, re.I)),
        "level": "undergraduate" in text or "postgraduate" in text or "undergraduate" in path or "postgraduate" in path,
        "campuses": any(value in text for value in ("campus", "location", "greenwich", "medway")),
        "study_modes": any(value in text for value in ("full-time", "part-time", "distance learning", "online")),
        "durations": bool(re.search(r"\b\d+(?:\.\d+)?\s+(?:year|years|month|months)\b", text)),
        "intake_months": bool(re.search(r"\b(january|september|october|february|may)\b", text)),
        "fees": any(value in text for value in ("tuition fee", "course fee", "£", "international fee")),
        "entry_requirements": "entry requirements" in text or "admission requirements" in text,
        "english_requirements": any(value in text for value in ("ielts", "english language requirement", "toefl")),
        "application_documents": any(value in text for value in ("personal statement", "transcript", "reference letter", "documents required")),
        "application_routes": any(value in text for value in ("apply now", "ucas", "how to apply")),
        "deadlines": any(value in text for value in ("application deadline", "closing date", "deadline")),
        "scholarships": "scholarship" in text or "bursary" in text,
        "summary": len(text) > 120,
        "source_url": True,
    }
    return [field for field in required_fields if signals.get(field, field.replace("_", " ") in text)]


def representative_urls(classified: list[dict[str, str]], limit: int = 16) -> list[str]:
    selected: list[str] = []
    priorities = ("course", "fees", "admissions", "international", "scholarship", "student-support", "general")
    for page_type in priorities:
        per_type = min(8, max(4, limit // 2)) if page_type == "course" else 2
        for item in (entry for entry in classified if entry["page_type"] == page_type):
            if item["url"] not in selected:
                selected.append(item["url"])
            if len(selected) >= limit:
                return selected
            if sum(classify_page_type(url) == page_type for url in selected) >= per_type:
                break
    return selected[:limit]


async def _sitemap_candidates(
    client: httpx.AsyncClient, sitemap_urls: list[str], hostname: str
) -> list[str]:
    candidates: list[str] = []
    for sitemap_url in sitemap_urls[:2]:
        try:
            await validate_public_url(sitemap_url)
            response = await client.get(sitemap_url)
            await validate_public_url(str(response.url))
            if response.status_code >= 400:
                continue
            locs = re.findall(r"<loc>\s*([^<]+?)\s*</loc>", response.text, re.I)
            nested = [value for value in locs if value.lower().split("?", 1)[0].endswith(".xml")]
            if nested:
                for nested_url in nested[:3]:
                    await validate_public_url(nested_url)
                    nested_response = await client.get(nested_url)
                    if nested_response.status_code < 400:
                        candidates.extend(re.findall(r"<loc>\s*([^<]+?)\s*</loc>", nested_response.text, re.I))
            else:
                candidates.extend(locs)
        except (httpx.HTTPError, ValueError):
            continue
    return list(dict.fromkeys(url for url in candidates if urlparse(url).hostname == hostname))[:5000]


async def _sample_pages(
    client: httpx.AsyncClient,
    urls: list[str],
    *,
    hostname: str,
    robots_text: str,
    required_fields: list[str],
) -> list[dict[str, Any]]:
    parser = RobotFileParser()
    parser.parse(robots_text.splitlines())
    semaphore = asyncio.Semaphore(4)

    async def sample(url: str) -> dict[str, Any]:
        page_type = classify_page_type(url)
        if robots_text and not parser.can_fetch("ScrapalBlueprint/0.1", url):
            return {"url": url, "page_type": page_type, "status": "policy_skipped", "fields": []}
        try:
            await validate_public_url(url)
            async with semaphore:
                response = await client.get(url)
            await validate_public_url(str(response.url))
            if urlparse(str(response.url)).hostname != hostname:
                return {"url": url, "page_type": page_type, "status": "redirect_blocked", "fields": []}
            response.raise_for_status()
            content_type = response.headers.get("content-type", "")
            if "html" not in content_type:
                return {"url": url, "page_type": page_type, "status": "unsupported", "fields": []}
            soup = BeautifulSoup(response.content, "html.parser")
            title = soup.title.get_text(" ", strip=True) if soup.title else url
            resolved_type = classify_page_type(url, title)
            fields = detect_evidence_fields(response.content, url, required_fields)
            return {
                "url": url,
                "title": title,
                "page_type": resolved_type,
                "status": "sampled",
                "fields": fields,
                "coverage": round(len(fields) / max(len(required_fields), 1), 3),
            }
        except (httpx.HTTPError, ValueError) as exc:
            return {"url": url, "page_type": page_type, "status": "failed", "error": type(exc).__name__, "fields": []}

    return list(await asyncio.gather(*(sample(url) for url in urls)))


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
    robots_text = robots_response.text if robots_response and robots_response.status_code < 400 else ""
    sitemap_urls = _sitemaps(robots_text, origin)
    if is_xml:
        sitemap_urls = list(dict.fromkeys([start_url, *sitemap_urls]))
    async with httpx.AsyncClient(timeout=12, follow_redirects=True, headers=headers) as client:
        sitemap_candidates = await _sitemap_candidates(client, sitemap_urls, parsed.hostname or "")
        if sitemap_candidates:
            candidates = sitemap_candidates
        candidates = list(dict.fromkeys(candidates))[:5000]
        classified = [
            {"url": value, "page_type": classify_page_type(value), "reason": "URL and navigation signal"}
            for value in candidates
        ]
        sample_urls = representative_urls(classified)
        sample_results = await _sample_pages(
            client,
            sample_urls,
            hostname=parsed.hostname or "",
            robots_text=robots_text,
            required_fields=coverage_contract(domain_pack, requested_fields),
        )
    counts = Counter(item["page_type"] for item in classified)
    include_patterns = suggested_patterns(candidates, domain_pack)
    required_fields = coverage_contract(domain_pack, requested_fields)
    successful_samples = [item for item in sample_results if item["status"] == "sampled"]
    course_samples = [item for item in successful_samples if item["page_type"] == "course"]
    coverage_basis = course_samples or successful_samples
    field_counts = {
        field: sum(field in item.get("fields", []) for item in coverage_basis)
        for field in required_fields
    }
    field_rates = {
        field: round(count / max(len(coverage_basis), 1), 3)
        for field, count in field_counts.items()
    }
    projected_coverage = round(
        sum(len(item.get("fields", [])) / max(len(required_fields), 1) for item in coverage_basis)
        / max(len(coverage_basis), 1),
        3,
    )
    discovery = {
        "title": title,
        "origin": origin,
        "sampled_pages": len(successful_samples),
        "links_observed": len(candidates),
        "page_type_counts": dict(counts),
        "candidate_pages": classified[:20],
        "sample_results": sample_results,
        "coverage_projection": {
            "overall": projected_coverage,
            "field_rates": field_rates,
            "basis": "course_pages" if course_samples else "representative_pages",
            "pages": len(coverage_basis),
            "confidence": "medium" if len(coverage_basis) >= 6 else "low",
        },
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
