from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from scrapal.db import get_session
from scrapal.domain.university.schemas import (
    REQUIRED_COURSE_FIELDS,
    CourseIntelligenceRecord,
    course_coverage,
)
from scrapal.jobs import reindex_task
from scrapal.models import (
    Document,
    Institution,
    RecordStatus,
    StructuredRecord,
    StructuredRecordRevision,
)
from scrapal.schemas import InstitutionOut, StructuredRecordOut
from scrapal.security import Principal, require_super_admin

router = APIRouter(prefix="/v1/admin/course-intelligence", tags=["course-intelligence"])
Session = Annotated[AsyncSession, Depends(get_session)]
SuperAdmin = Annotated[Principal, Depends(require_super_admin)]


class RecordReview(BaseModel):
    note: str = Field(min_length=3, max_length=1000)
    data: dict[str, Any] | None = None


async def course_record(session: AsyncSession, record_id: str) -> StructuredRecord:
    record = await session.scalar(
        select(StructuredRecord).where(
            StructuredRecord.id == record_id,
            StructuredRecord.schema_name == "university.course",
        )
    )
    if not record:
        raise HTTPException(404, "Course record not found")
    return record


def reviewer(principal: Principal) -> str:
    return f"platform:{principal.role.value}"


def revision_snapshot(record: StructuredRecord, note: str) -> StructuredRecordRevision:
    return StructuredRecordRevision(
        record_id=record.id,
        revision=record.revision,
        data=record.data,
        evidence=record.evidence,
        validation_json=record.validation_json,
        confidence=record.confidence,
        status=record.status,
        note=note,
    )


def institution_breakdown(
    records: list[Any],
    names: dict[str, tuple[str, str | None]],
) -> list[dict[str, Any]]:
    """Per-university totals, so an operator sees which sites are producing."""
    grouped: dict[str | None, list[Any]] = {}
    for record in records:
        grouped.setdefault(record.institution_id, []).append(record)
    rows: list[dict[str, Any]] = []
    for institution_id, group in grouped.items():
        name, country = names.get(institution_id or "", ("Unattributed", None))
        coverage = [float(item.validation_json.get("coverage", 0)) for item in group]
        rows.append(
            {
                "institution_id": institution_id,
                "name": name,
                "country_code": country,
                "total": len(group),
                "published": sum(item.status == RecordStatus.published for item in group),
                "review": sum(item.status == RecordStatus.review for item in group),
                "rejected": sum(item.status == RecordStatus.rejected for item in group),
                "average_coverage": round(sum(coverage) / len(coverage), 3) if coverage else 0,
            }
        )
    return sorted(rows, key=lambda row: (-row["published"], -row["total"], row["name"]))


@router.get("/institutions", response_model=list[InstitutionOut])
async def institutions(session: Session, _: SuperAdmin) -> list[Institution]:
    return list(await session.scalars(select(Institution).order_by(Institution.name)))


@router.get("/overview")
async def overview(
    session: Session,
    _: SuperAdmin,
    collection_id: str | None = None,
) -> dict[str, Any]:
    statement = select(StructuredRecord).where(
        StructuredRecord.schema_name == "university.course"
    )
    if collection_id:
        statement = statement.where(StructuredRecord.collection_id == collection_id)
    records = list(await session.scalars(statement))
    institution_rows = list(await session.scalars(select(Institution)))
    names = {row.id: (row.name, row.country_code) for row in institution_rows}
    coverage = [float(record.validation_json.get("coverage", 0)) for record in records]
    missing: dict[str, int] = {}
    for record in records:
        for field in record.validation_json.get("missing_fields", []):
            missing[field] = missing.get(field, 0) + 1
    return {
        "total": len(records),
        "published": sum(record.status == RecordStatus.published for record in records),
        "review": sum(record.status == RecordStatus.review for record in records),
        "rejected": sum(record.status == RecordStatus.rejected for record in records),
        "average_coverage": round(sum(coverage) / len(coverage), 3) if coverage else 0,
        "by_institution": institution_breakdown(records, names),
        "missing_fields": sorted(
            ({"field": field, "count": count} for field, count in missing.items()),
            key=lambda item: (-item["count"], item["field"]),
        ),
    }


@router.get("/records", response_model=list[StructuredRecordOut])
async def records(
    session: Session,
    _: SuperAdmin,
    collection_id: str | None = None,
    institution_id: str | None = None,
    status: RecordStatus | None = None,
    limit: int = Query(100, ge=1, le=500),
) -> list[StructuredRecord]:
    statement = select(StructuredRecord).where(
        StructuredRecord.schema_name == "university.course"
    )
    if collection_id:
        statement = statement.where(StructuredRecord.collection_id == collection_id)
    if institution_id:
        statement = statement.where(StructuredRecord.institution_id == institution_id)
    if status:
        statement = statement.where(StructuredRecord.status == status)
    return list(
        await session.scalars(statement.order_by(desc(StructuredRecord.updated_at)).limit(limit))
    )


@router.get("/records/{record_id}", response_model=StructuredRecordOut)
async def record_detail(record_id: str, session: Session, _: SuperAdmin) -> StructuredRecord:
    return await course_record(session, record_id)


@router.post("/records/{record_id}/review", response_model=StructuredRecordOut)
async def review_record(
    record_id: str,
    body: RecordReview,
    session: Session,
    principal: SuperAdmin,
) -> StructuredRecord:
    record = await course_record(session, record_id)
    if body.data is not None:
        try:
            typed = CourseIntelligenceRecord.model_validate(body.data)
        except ValueError as exc:
            raise HTTPException(422, f"Course data is invalid: {exc}") from exc
        coverage, missing = course_coverage(typed)
        record.data = typed.model_dump()
        record.validation_json = {
            **record.validation_json,
            "coverage": coverage,
            "missing_fields": missing,
            "review_reasons": [f"Missing required field: {field}" for field in missing],
        }
        evidence = dict(record.evidence)
        evidence.setdefault("operator_reviews", []).append(
            {"reviewed_by": reviewer(principal), "reviewed_at": datetime.now(UTC).isoformat()}
        )
        record.evidence = evidence
    record.status = RecordStatus.review
    record.published = False
    record.reviewed_at = datetime.now(UTC)
    record.reviewed_by = reviewer(principal)
    record.revision += 1
    session.add(revision_snapshot(record, body.note))
    await session.commit()
    await session.refresh(record)
    return record


@router.post("/records/{record_id}/publish", response_model=StructuredRecordOut)
async def publish_record(
    record_id: str,
    body: RecordReview,
    session: Session,
    principal: SuperAdmin,
) -> StructuredRecord:
    record = await course_record(session, record_id)
    missing = record.validation_json.get("missing_fields", [])
    contradictions = record.validation_json.get("contradictions", [])
    evidence_fields = record.evidence.get("fields", {})
    missing_evidence = [field for field in REQUIRED_COURSE_FIELDS if not evidence_fields.get(field)]
    if (
        record.validation_json.get("coverage") != 1
        or missing
        or contradictions
        or missing_evidence
    ):
        raise HTTPException(
            409,
            {
                "message": "Resolve required-field gaps and contradictions before publication",
                "missing_fields": missing,
                "contradictions": contradictions,
                "missing_evidence": missing_evidence,
            },
        )
    record.status = RecordStatus.published
    record.published = True
    record.reviewed_at = datetime.now(UTC)
    record.reviewed_by = reviewer(principal)
    record.published_at = datetime.now(UTC)
    record.revision += 1
    session.add(revision_snapshot(record, body.note))
    document = await session.get(Document, record.document_id)
    await session.commit()
    await session.refresh(record)
    if document and document.current_version_id:
        reindex_task.delay(document.id, document.current_version_id)
    return record


@router.post("/records/{record_id}/reject", response_model=StructuredRecordOut)
async def reject_record(
    record_id: str,
    body: RecordReview,
    session: Session,
    principal: SuperAdmin,
) -> StructuredRecord:
    record = await course_record(session, record_id)
    record.status = RecordStatus.rejected
    record.published = False
    record.reviewed_at = datetime.now(UTC)
    record.reviewed_by = reviewer(principal)
    record.revision += 1
    session.add(revision_snapshot(record, body.note))
    await session.commit()
    await session.refresh(record)
    return record


@router.get("/records/{record_id}/revisions")
async def revisions(record_id: str, session: Session, _: SuperAdmin) -> list[dict[str, Any]]:
    await course_record(session, record_id)
    rows = list(
        await session.scalars(
            select(StructuredRecordRevision)
            .where(StructuredRecordRevision.record_id == record_id)
            .order_by(desc(StructuredRecordRevision.revision))
        )
    )
    return [
        {
            "id": row.id,
            "revision": row.revision,
            "status": row.status,
            "confidence": row.confidence,
            "validation": row.validation_json,
            "note": row.note,
            "created_at": row.created_at,
            # The snapshot already stores the field values; without returning
            # them a caller can see that a record changed but not what changed,
            # which is the only thing a reader actually wants to know.
            "data": row.data,
        }
        for row in rows
    ]
