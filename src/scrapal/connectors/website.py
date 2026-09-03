import asyncio
import ipaddress
import socket
from typing import Any
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field, field_validator
from trafilatura import extract

from scrapal.extensions import Connector, ExtensionManifest


class WebsiteConfig(BaseModel):
    start_url: str
    allowed_domains: list[str] = Field(default_factory=list)
    include_patterns: list[str] = Field(default_factory=list)
    exclude_patterns: list[str] = Field(default_factory=list)
    max_pages: int = Field(default=100, ge=1, le=10_000)
    max_depth: int = Field(default=2, ge=0, le=10)
    max_llm_pages: int = Field(default=200, ge=0, le=10_000)
    respect_robots: bool = True

    @field_validator("start_url")
    @classmethod
    def http_url(cls, value: str) -> str:
        if urlparse(value).scheme not in {"http", "https"}:
            raise ValueError("Only http and https sources are allowed")
        return value


class WebsiteConnector(Connector[WebsiteConfig]):
    manifest = ExtensionManifest(
        name="website",
        version="0.1.0",
        description="Crawl a public website with domain, depth, and robots controls.",
        capabilities=["discover", "html", "sitemap", "robots"],
        content_types=["text/html", "application/pdf"],
    )
    config_model = WebsiteConfig

    async def discover(self, config: WebsiteConfig) -> list[str]:
        await validate_public_url(config.start_url)
        return [config.start_url]

    async def extract(self, url: str, content: bytes, content_type: str) -> dict[str, Any]:
        html = content.decode("utf-8", errors="replace")
        soup = BeautifulSoup(html, "html.parser")
        title = soup.title.get_text(" ", strip=True) if soup.title else url
        text = extract(html, url=url, include_links=True, include_tables=True) or soup.get_text(
            "\n"
        )
        return {"title": title, "text": text, "metadata": {"url": url}}


async def validate_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Only absolute HTTP(S) URLs are allowed")
    if parsed.hostname in {"localhost", "host.docker.internal"}:
        raise ValueError("Private network destinations are blocked")
    loop = asyncio.get_running_loop()
    addresses = await loop.run_in_executor(
        None,
        lambda: socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM),
    )
    for result in addresses:
        address = ipaddress.ip_address(result[4][0])
        if any(
            (
                address.is_private,
                address.is_loopback,
                address.is_link_local,
                address.is_multicast,
                address.is_reserved,
                address.is_unspecified,
            )
        ):
            raise ValueError("Private or reserved network destinations are blocked")


async def robots_allowed(url: str, user_agent: str) -> bool:
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    parser = RobotFileParser()
    parser.set_url(robots_url)
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            response = await client.get(robots_url, headers={"User-Agent": user_agent})
        if response.status_code >= 400:
            return True
        parser.parse(response.text.splitlines())
        return parser.can_fetch(user_agent, url)
    except httpx.HTTPError:
        return False


def allowed_link(url: str, config: WebsiteConfig, base_domain: str) -> bool:
    parsed = urlparse(url)
    domains = config.allowed_domains or [base_domain]
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in domains:
        return False
    if config.include_patterns and not any(pattern in url for pattern in config.include_patterns):
        return False
    return not any(pattern in url for pattern in config.exclude_patterns)


def extract_links(url: str, html: bytes, config: WebsiteConfig) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    domain = urlparse(config.start_url).hostname or ""
    links: set[str] = set()
    for anchor in soup.select("a[href]"):
        href = anchor.get("href")
        if not isinstance(href, str) or href.startswith(("mailto:", "tel:", "javascript:")):
            continue
        links.add(urljoin(url, href).split("#", 1)[0])
    return sorted(link for link in links if allowed_link(link, config, domain))
