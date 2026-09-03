"""Identity for an institution, derived from the address it publishes at.

A university is recognised by its registrable domain rather than by its name.
Names vary across a site ("Greenwich", "University of Greenwich", "UoG"); the
domain does not, and it is the one thing every source for that institution
shares.
"""

import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

# Second-level suffixes that are part of the public suffix, not the name.
# Deliberately a short explicit list rather than a public-suffix dependency:
# academic domains are the only ones this platform crawls, and an unknown
# suffix degrades to a two-label domain, which is right far more often than
# it is wrong.
COMPOUND_SUFFIXES: frozenset[str] = frozenset(
    {
        "ac.uk", "co.uk", "org.uk", "gov.uk", "sch.uk",
        "edu.au", "gov.au", "com.au", "org.au",
        "ac.nz", "edu.sg", "edu.my", "com.my",
        "edu.in", "ac.in", "edu.cn", "ac.jp", "edu.hk",
        "edu.br", "edu.mx", "ac.za", "edu.pk", "ac.ae",
    }
)

# TLD to ISO 3166-1 alpha-2. Only suffixes we can be certain about appear
# here; anything absent resolves to None so an administrator is asked.
COUNTRY_BY_SUFFIX: dict[str, str] = {
    "ac.uk": "GB", "co.uk": "GB", "org.uk": "GB", "gov.uk": "GB", "uk": "GB",
    "edu.au": "AU", "com.au": "AU", "org.au": "AU", "au": "AU",
    "ac.nz": "NZ", "nz": "NZ",
    "edu.my": "MY", "com.my": "MY", "my": "MY",
    "edu.sg": "SG", "sg": "SG",
    "ie": "IE", "nl": "NL", "de": "DE", "fr": "FR", "es": "ES", "it": "IT",
    "se": "SE", "no": "NO", "dk": "DK", "fi": "FI", "pt": "PT", "pl": "PL",
    "be": "BE", "at": "AT", "ch": "CH", "cz": "CZ", "gr": "GR", "hu": "HU",
    "ac.za": "ZA", "za": "ZA",
    "edu.in": "IN", "ac.in": "IN", "in": "IN",
    "ac.jp": "JP", "jp": "JP",
    "edu.hk": "HK", "hk": "HK",
    "edu.cn": "CN", "cn": "CN",
    "edu.br": "BR", "br": "BR",
    "edu.mx": "MX", "mx": "MX",
    "edu.pk": "PK", "pk": "PK",
    "ac.ae": "AE", "ae": "AE",
    "ca": "CA",
    "edu": "US",
}

HEX_COLOR = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def registrable_domain(url: str) -> str | None:
    """The domain that identifies an institution, with subdomains removed."""
    if not url or "://" not in url:
        return None
    host = (urlparse(url).hostname or "").lower().strip(".")
    if not host or "." not in host:
        return None
    labels = host.split(".")
    for depth in (3, 2):
        if len(labels) >= depth and ".".join(labels[-(depth - 1):]) in COMPOUND_SUFFIXES:
            return ".".join(labels[-depth:])
    return ".".join(labels[-2:])


def country_for_domain(domain: str) -> str | None:
    """ISO country code implied by the domain suffix, or None if unknown."""
    labels = domain.lower().split(".")
    for depth in (2, 1):
        if len(labels) >= depth:
            suffix = ".".join(labels[-depth:])
            if suffix in COUNTRY_BY_SUFFIX:
                return COUNTRY_BY_SUFFIX[suffix]
    return None


def institution_name_from_domain(domain: str) -> str:
    """A readable stand-in until a crawl or an administrator supplies the real name."""
    return domain.split(".")[0].replace("-", " ").title()


def slugify(name: str) -> str:
    # Apostrophes vanish rather than becoming separators, so "St Mary's"
    # slugs as "st-marys" and not "st-mary-s".
    bare = name.lower().replace("'", "").replace("’", "")
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", bare)).strip("-")


def branding_from_html(html: bytes, url: str) -> dict[str, str]:
    """Read the logo, banner, and brand colour a university publishes."""
    soup = BeautifulSoup(html, "html.parser")
    found: dict[str, str] = {}
    banner = soup.find("meta", attrs={"property": "og:image"})
    if banner and banner.get("content"):
        found["banner_url"] = urljoin(url, str(banner["content"]).strip())
    icon = soup.find("link", rel=lambda value: value and "icon" in value.lower())
    if icon and icon.get("href"):
        found["logo_url"] = urljoin(url, str(icon["href"]).strip())
    color = soup.find("meta", attrs={"name": "theme-color"})
    if color and color.get("content"):
        value = str(color["content"]).strip()
        if HEX_COLOR.match(value):
            found["brand_color"] = value
    return found
