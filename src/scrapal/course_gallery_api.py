import re
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from scrapal.db import get_session
from scrapal.models import (
    Collection,
    CourseShortlistEntry,
    Institution,
    RecordStatus,
    StructuredRecord,
    StructuredRecordRevision,
)
from scrapal.security import Principal, require_super_admin
from scrapal.services.ollama import OllamaService, OllamaUnavailable

router = APIRouter(prefix="/v1/admin/course-gallery", tags=["course-gallery"])
Session = Annotated[AsyncSession, Depends(get_session)]
SuperAdmin = Annotated[Principal, Depends(require_super_admin)]


class ShortlistCreate(BaseModel):
    record_id: str
    note: str | None = Field(default=None, max_length=1000)


class GalleryInterpretRequest(BaseModel):
    query: str = Field(min_length=3, max_length=500)


class GalleryInterpretation(BaseModel):
    q: str | None = None
    level: str | None = None
    countries: list[str] = Field(default_factory=list)
    institution_ids: list[str] = Field(default_factory=list)
    study_modes: list[str] = Field(default_factory=list)
    intake_months: list[str] = Field(default_factory=list)
    durations: list[str] = Field(default_factory=list)
    fee_max: int | None = Field(default=None, ge=0)
    explanation: str = ""


_QUERY_STOPWORDS = {
    "a", "an", "and", "course", "courses", "degree", "find", "for", "i", "in", "is",
    "looking", "me", "of", "or", "that", "the", "to", "under", "up", "want", "with",
    "uk", "united", "kingdom", "part", "full", "time", "postgraduate", "undergraduate",
}


def _query_keywords(query: str) -> str | None:
    words = [
        word for word in re.findall(r"[a-z][a-z+.-]+", query.lower())
        if word not in _QUERY_STOPWORDS and not word.startswith("£")
    ]
    return " ".join(words[:4]) or None


def _guard_interpretation(
    interpretation: GalleryInterpretation,
    query: str,
    allowed: dict[str, list[str]],
    institutions: dict[str, str],
) -> dict[str, Any]:
    """Discard model slots that are not grounded in the user's own words."""
    text = " ".join(query.lower().replace("-", " ").split())
    country_aliases = {"GB": ("uk", "united kingdom", "britain", "england", "scotland", "wales")}
    countries = [
        code for code in interpretation.countries
        if code in allowed["countries"]
        and any(alias in text for alias in country_aliases.get(code, (code.lower(),)))
    ]
    level = interpretation.level
    level_terms = {
        "postgraduate": ("postgraduate", "postgrad", "master", "msc", "mba"),
        "undergraduate": ("undergraduate", "undergrad", "bachelor", "bsc", "ba ", "beng"),
    }
    if level not in allowed["levels"] or not any(term in text for term in level_terms.get(level or "", (str(level).lower(),))):
        level = None
    modes = [
        value for value in interpretation.study_modes
        if value in allowed["study_modes"] and value.lower().replace("-", " ") in text
    ]
    intakes = [value for value in interpretation.intake_months if value in allowed["intake_months"] and value.lower() in text]
    durations = [
        value for value in interpretation.durations
        if value in allowed["durations"] and value.lower().replace("-", " ") in text
    ]
    institution_ids = [
        identifier for name, identifier in institutions.items()
        if identifier in interpretation.institution_ids and name.lower() in text
    ]
    numbers = {int(value.replace(",", "")) for value in re.findall(r"\d[\d,]*", text)}
    fee_max = interpretation.fee_max if interpretation.fee_max in numbers and any(term in text for term in ("under", "maximum", "max", "budget", "up to", "less than", "£")) else None
    proposed_q = interpretation.q or ""
    q = proposed_q if proposed_q and all(word in text for word in proposed_q.lower().split()) else _query_keywords(query)
    summary = [q and f"topic '{q}'", level, countries and ", ".join(countries), modes and ", ".join(modes), intakes and f"{', '.join(intakes)} intake", fee_max is not None and f"fees up to £{fee_max:,}"]
    return {
        "q": q, "level": level, "countries": countries, "institution_ids": institution_ids,
        "study_modes": modes, "intake_months": intakes, "durations": durations,
        "fee_max": fee_max,
        "explanation": "Applied " + "; ".join(str(item) for item in summary if item) + ".",
    }


def principal_key(principal: Principal) -> str:
    """Stable shortlist owner; API keys in one organization remain isolated."""
    return principal.key_id or f"{principal.organization_id}:{principal.role.value}"


def _values(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if item not in (None, "")]
    return [str(value)] if value not in (None, "") else []


def _fee_amounts(data: dict[str, Any]) -> list[int]:
    return [
        int(fee["amount"])
        for fee in data.get("fees", [])
        if isinstance(fee, dict) and isinstance(fee.get("amount"), (int, float))
    ]


def gallery_course(record: StructuredRecord, institution: Institution) -> dict[str, Any]:
    data = record.data
    return {
        "id": record.id,
        "institution_id": institution.id,
        "institution": {
            "id": institution.id,
            "name": institution.name,
            "country_code": institution.country_code,
            "city": institution.city,
            "logo_url": institution.logo_url,
            "banner_url": institution.banner_url,
            "brand_color": institution.brand_color,
        },
        "title": data.get("title") or "Untitled course",
        "award": data.get("award"),
        "level": data.get("level"),
        "campuses": _values(data.get("campuses")),
        "study_modes": _values(data.get("study_modes")),
        "durations": _values(data.get("durations")),
        "intake_months": _values(data.get("intake_months")),
        "fees": data.get("fees", []),
        "entry_requirements": data.get("entry_requirements"),
        "english_requirements": data.get("english_requirements"),
        "modules": _values(data.get("modules")),
        "scholarships": _values(data.get("scholarships")),
        "course_content": data.get("course_content"),
        "careers": data.get("careers"),
        "source_url": data.get("source_url") or record.external_id,
        "coverage": float(record.validation_json.get("coverage", 0)),
        "evidence": record.evidence,
        "updated_at": record.updated_at,
    }


def matches_gallery_filters(
    course: dict[str, Any],
    filters: dict[str, Any],
    *,
    omit: str | None = None,
) -> bool:
    institution = course["institution"]
    scalar = {
        "institution": course["institution_id"],
        "country": institution.get("country_code"),
        "level": course.get("level"),
    }
    plural = {
        "study_mode": course.get("study_modes", []),
        "campus": course.get("campuses", []),
        "intake_month": course.get("intake_months", []),
        "duration": course.get("durations", []),
    }
    for name, value in scalar.items():
        selected = filters.get(name) or []
        if name != omit and selected and value not in selected:
            return False
    for name, values in plural.items():
        selected = filters.get(name) or []
        if name != omit and selected and not set(selected).intersection(values):
            return False
    if omit != "q" and filters.get("q"):
        haystack = " ".join(
            [str(course.get("title") or ""), str(course.get("award") or ""), institution["name"]]
        ).lower()
        if str(filters["q"]).lower() not in haystack:
            return False
    amounts = _fee_amounts({"fees": course.get("fees", [])})
    if omit != "fee" and filters.get("fee_min") is not None:
        if not amounts or max(amounts) < filters["fee_min"]:
            return False
    if omit != "fee" and filters.get("fee_max") is not None:
        if not amounts or min(amounts) > filters["fee_max"]:
            return False
    if omit != "coverage" and course["coverage"] < float(filters.get("min_coverage") or 0):
        return False
    return True


def gallery_facets(courses: list[dict[str, Any]], filters: dict[str, Any]) -> dict[str, Any]:
    definitions = {
        "institution": lambda course: [course["institution_id"]],
        "country": lambda course: [course["institution"].get("country_code")],
        "level": lambda course: [course.get("level")],
        "study_mode": lambda course: course.get("study_modes", []),
        "campus": lambda course: course.get("campuses", []),
        "intake_month": lambda course: course.get("intake_months", []),
        "duration": lambda course: course.get("durations", []),
    }
    result: dict[str, Any] = {}
    for name, reader in definitions.items():
        counts: dict[str, int] = {}
        for course in courses:
            if not matches_gallery_filters(course, filters, omit=name):
                continue
            for value in set(reader(course)):
                if value:
                    counts[str(value)] = counts.get(str(value), 0) + 1
        result[name] = [
            {"value": value, "count": count}
            for value, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        ]
    fees = sorted(amount for course in courses for amount in _fee_amounts({"fees": course["fees"]}))
    result["fee"] = {"min": fees[0] if fees else None, "max": fees[-1] if fees else None}
    return result


async def _published_courses(
    session: AsyncSession,
    organization_id: str,
    collection_id: str | None = None,
) -> list[dict[str, Any]]:
    statement = (
        select(StructuredRecord, Institution)
            .join(Institution, Institution.id == StructuredRecord.institution_id)
            .join(Collection, Collection.id == StructuredRecord.collection_id)
            .where(
                Collection.organization_id == organization_id,
                StructuredRecord.schema_name == "university.course",
                StructuredRecord.status == RecordStatus.published,
                StructuredRecord.published.is_(True),
            )
    )
    if collection_id:
        statement = statement.where(StructuredRecord.collection_id == collection_id)
    rows = (await session.execute(statement)).all()
    return [gallery_course(record, institution) for record, institution in rows]


@router.post("/interpret")
async def interpret_gallery_query(
    body: GalleryInterpretRequest,
    session: Session,
    principal: SuperAdmin,
) -> dict[str, Any]:
    """Turn a natural-language course brief into visible, editable filters."""
    courses = await _published_courses(session, principal.organization_id)
    facet_data = gallery_facets(courses, _filters(None, None, None, None, None, None, None, None, None, None, 0))
    institutions = {
        course["institution"]["name"]: course["institution_id"] for course in courses
    }
    allowed = {
        "countries": [item["value"] for item in facet_data["country"]],
        "study_modes": [item["value"] for item in facet_data["study_mode"]],
        "intake_months": [item["value"] for item in facet_data["intake_month"]],
        "durations": [item["value"] for item in facet_data["duration"]],
        "levels": [item["value"] for item in facet_data["level"]],
    }
    prompt = (
        "Interpret the course-search request into the supplied schema. Use only exact values "
        "from AVAILABLE. Put subject or course keywords in q. Never invent a filter. Give a "
        "brief explanation of what was understood.\n"
        f"AVAILABLE: {allowed}; institutions={institutions}\nREQUEST: {body.query}"
    )
    try:
        ollama = OllamaService()
        payload = await ollama.structured(
            [{"role": "user", "content": prompt}],
            GalleryInterpretation.model_json_schema(),
            model=ollama.settings.ollama_chat_model,
        )
        interpretation = GalleryInterpretation.model_validate(payload)
        source = "model"
    except (OllamaUnavailable, ValueError):
        interpretation = GalleryInterpretation(
            q=body.query,
            explanation="AI interpretation was unavailable, so the full brief is being used as a keyword search.",
        )
        source = "fallback"

    clean = _guard_interpretation(interpretation, body.query, allowed, institutions)
    return {"source": source, "filters": clean}


def _filters(
    q: str | None,
    institution_id: list[str] | None,
    country: list[str] | None,
    level: str | None,
    study_mode: list[str] | None,
    campus: list[str] | None,
    intake_month: list[str] | None,
    duration: list[str] | None,
    fee_min: int | None,
    fee_max: int | None,
    min_coverage: float,
) -> dict[str, Any]:
    return {
        "q": q,
        "institution": institution_id or [],
        "country": country or [],
        "level": [level] if level else [],
        "study_mode": study_mode or [],
        "campus": campus or [],
        "intake_month": intake_month or [],
        "duration": duration or [],
        "fee_min": fee_min,
        "fee_max": fee_max,
        "min_coverage": min_coverage,
    }


@router.get("/institutions")
async def institutions(
    session: Session,
    principal: SuperAdmin,
    collection_id: str | None = None,
) -> list[dict[str, Any]]:
    courses = await _published_courses(session, principal.organization_id, collection_id)
    counts: dict[str, int] = {}
    for course in courses:
        counts[course["institution_id"]] = counts.get(course["institution_id"], 0) + 1
    rows = list(
        await session.scalars(
            select(Institution)
            .where(Institution.organization_id == principal.organization_id)
            .order_by(Institution.name)
        )
    )
    return [
        {
            "id": row.id,
            "name": row.name,
            "country_code": row.country_code,
            "city": row.city,
            "logo_url": row.logo_url,
            "banner_url": row.banner_url,
            "brand_color": row.brand_color,
            "published_courses": counts.get(row.id, 0),
        }
        for row in rows
    ]


@router.get("/courses")
async def courses(
    session: Session,
    principal: SuperAdmin,
    q: str | None = None,
    institution_id: list[str] | None = Query(default=None),
    country: list[str] | None = Query(default=None),
    level: str | None = None,
    study_mode: list[str] | None = Query(default=None),
    campus: list[str] | None = Query(default=None),
    intake_month: list[str] | None = Query(default=None),
    duration: list[str] | None = Query(default=None),
    fee_min: int | None = Query(default=None, ge=0),
    fee_max: int | None = Query(default=None, ge=0),
    min_coverage: float = Query(default=0, ge=0, le=1),
    sort: str = "updated",
    cursor: int = Query(default=0, ge=0),
    limit: int = Query(default=24, ge=1, le=100),
    collection_id: str | None = None,
) -> dict[str, Any]:
    all_courses = await _published_courses(session, principal.organization_id, collection_id)
    filters = _filters(
        q, institution_id, country, level, study_mode, campus, intake_month,
        duration, fee_min, fee_max, min_coverage,
    )
    filtered = [course for course in all_courses if matches_gallery_filters(course, filters)]
    if sort == "title":
        filtered.sort(key=lambda course: str(course["title"]).lower())
    elif sort == "coverage":
        filtered.sort(key=lambda course: -course["coverage"])
    else:
        filtered.sort(key=lambda course: str(course["updated_at"] or datetime.min), reverse=True)
    page = filtered[cursor : cursor + limit]
    next_cursor = cursor + limit if cursor + limit < len(filtered) else None
    return {"items": page, "total": len(filtered), "next_cursor": next_cursor}


@router.get("/facets")
async def facets(
    session: Session,
    principal: SuperAdmin,
    q: str | None = None,
    institution_id: list[str] | None = Query(default=None),
    country: list[str] | None = Query(default=None),
    level: str | None = None,
    study_mode: list[str] | None = Query(default=None),
    campus: list[str] | None = Query(default=None),
    intake_month: list[str] | None = Query(default=None),
    duration: list[str] | None = Query(default=None),
    fee_min: int | None = Query(default=None, ge=0),
    fee_max: int | None = Query(default=None, ge=0),
    min_coverage: float = Query(default=0, ge=0, le=1),
    collection_id: str | None = None,
) -> dict[str, Any]:
    all_courses = await _published_courses(session, principal.organization_id, collection_id)
    return gallery_facets(
        all_courses,
        _filters(
            q, institution_id, country, level, study_mode, campus, intake_month,
            duration, fee_min, fee_max, min_coverage,
        ),
    )


@router.get("/courses/{record_id}")
async def course_detail(
    record_id: str,
    session: Session,
    principal: SuperAdmin,
) -> dict[str, Any]:
    courses = await _published_courses(session, principal.organization_id)
    course = next((item for item in courses if item["id"] == record_id), None)
    if not course:
        raise HTTPException(404, "Published course not found")
    revisions = list(
        await session.scalars(
            select(StructuredRecordRevision)
            .where(StructuredRecordRevision.record_id == record_id)
            .order_by(desc(StructuredRecordRevision.revision))
        )
    )
    return {
        **course,
        "revisions": [
            {
                "revision": row.revision,
                "status": row.status,
                "note": row.note,
                "created_at": row.created_at,
            }
            for row in revisions
        ],
    }


@router.get("/shortlist")
async def shortlist(session: Session, principal: SuperAdmin) -> list[dict[str, Any]]:
    owner = principal_key(principal)
    entries = list(
        await session.scalars(
            select(CourseShortlistEntry)
            .where(CourseShortlistEntry.principal_key == owner)
            .order_by(CourseShortlistEntry.created_at)
        )
    )
    courses = {item["id"]: item for item in await _published_courses(session, principal.organization_id)}
    return [
        {"id": entry.id, "record_id": entry.record_id, "note": entry.note, "course": courses[entry.record_id]}
        for entry in entries
        if entry.record_id in courses
    ]


@router.post("/shortlist", status_code=201)
async def add_to_shortlist(
    body: ShortlistCreate,
    session: Session,
    principal: SuperAdmin,
) -> dict[str, Any]:
    courses = await _published_courses(session, principal.organization_id)
    if not any(course["id"] == body.record_id for course in courses):
        raise HTTPException(404, "Published course not found")
    entry = CourseShortlistEntry(
        principal_key=principal_key(principal),
        record_id=body.record_id,
        note=body.note,
    )
    session.add(entry)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(409, "Course is already shortlisted") from exc
    await session.refresh(entry)
    return {"id": entry.id, "record_id": entry.record_id, "note": entry.note}


@router.delete("/shortlist/{record_id}", status_code=204)
async def remove_from_shortlist(
    record_id: str,
    session: Session,
    principal: SuperAdmin,
) -> None:
    await session.execute(
        delete(CourseShortlistEntry).where(
            CourseShortlistEntry.principal_key == principal_key(principal),
            CourseShortlistEntry.record_id == record_id,
        )
    )
    await session.commit()
