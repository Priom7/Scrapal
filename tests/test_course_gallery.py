from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from scrapal.course_gallery_api import (
    GalleryInterpretation,
    _guard_interpretation,
    gallery_facets,
    principal_key,
    shortlist,
)
from scrapal.db import Base
from scrapal.models import (
    Collection,
    CourseShortlistEntry,
    Document,
    Institution,
    Organization,
    RecordStatus,
    Role,
    Source,
    SourceKind,
    StructuredRecord,
)
from scrapal.security import Principal


def _course(
    identifier: str,
    institution_id: str,
    country: str,
    level: str,
) -> dict:
    return {
        "id": identifier,
        "institution_id": institution_id,
        "institution": {"id": institution_id, "name": institution_id, "country_code": country},
        "title": identifier,
        "award": "MSc",
        "level": level,
        "campuses": ["Main campus"],
        "study_modes": ["Full-time"],
        "durations": ["1 year"],
        "intake_months": ["September"],
        "fees": [{"amount": 15000}],
        "coverage": 1.0,
    }


def test_facet_counts_exclude_the_facet_being_counted() -> None:
    courses = [
        _course("Greenwich course", "greenwich", "GB", "postgraduate"),
        _course("Buckingham course", "buckingham", "GB", "postgraduate"),
        _course("Leiden course", "leiden", "NL", "undergraduate"),
    ]
    facets = gallery_facets(
        courses,
        {
            "institution": ["greenwich"],
            "country": ["GB"],
            "level": [],
            "study_mode": [],
            "campus": [],
            "intake_month": [],
            "duration": [],
            "min_coverage": 0,
        },
    )
    institution_counts = {item["value"]: item["count"] for item in facets["institution"]}
    country_counts = {item["value"]: item["count"] for item in facets["country"]}
    assert institution_counts == {"buckingham": 1, "greenwich": 1}
    assert country_counts == {"GB": 1}


def test_ai_gallery_slots_must_be_grounded_in_the_request() -> None:
    clean = _guard_interpretation(
        GalleryInterpretation(
            q="computing",
            level="postgraduate",
            countries=["GB"],
            study_modes=["part-time"],
            intake_months=["January"],
            durations=["2 years part-time"],
            fee_max=20000,
        ),
        "A part-time postgraduate computing course in the UK under £20,000",
        {
            "countries": ["GB"],
            "study_modes": ["part-time"],
            "intake_months": ["January", "September"],
            "durations": ["2 years part-time"],
            "levels": ["undergraduate", "postgraduate"],
        },
        {},
    )
    assert clean["q"] == "computing"
    assert clean["level"] == "postgraduate"
    assert clean["countries"] == ["GB"]
    assert clean["study_modes"] == ["part-time"]
    assert clean["fee_max"] == 20000
    assert clean["intake_months"] == []
    assert clean["durations"] == []


async def test_shortlists_are_isolated_by_api_key_principal() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        organization = Organization(name="Test")
        session.add(organization)
        await session.flush()
        collection = Collection(organization_id=organization.id, name="Courses")
        session.add(collection)
        await session.flush()
        institution = Institution(
            organization_id=organization.id,
            name="University of Greenwich",
            slug="greenwich",
            domain="gre.ac.uk",
        )
        session.add(institution)
        await session.flush()
        source = Source(
            collection_id=collection.id,
            institution_id=institution.id,
            name="Greenwich",
            kind=SourceKind.greenwich,
        )
        session.add(source)
        await session.flush()
        document = Document(
            collection_id=collection.id,
            source_id=source.id,
            canonical_url="https://www.gre.ac.uk/course",
            title="Course",
        )
        session.add(document)
        await session.flush()
        record = StructuredRecord(
            collection_id=collection.id,
            institution_id=institution.id,
            document_id=document.id,
            schema_name="university.course",
            external_id=document.canonical_url,
            data={"title": "Course", "level": "postgraduate", "source_url": document.canonical_url},
            evidence={},
            status=RecordStatus.published,
            published=True,
            validation_json={"coverage": 1},
        )
        session.add(record)
        await session.flush()
        first = Principal(organization.id, Role.super_admin, ["*"], "key-one")
        second = Principal(organization.id, Role.super_admin, ["*"], "key-two")
        session.add_all(
            [
                CourseShortlistEntry(principal_key=principal_key(first), record_id=record.id),
                CourseShortlistEntry(
                    principal_key=principal_key(second),
                    record_id=record.id,
                    note="Second principal",
                ),
            ]
        )
        await session.commit()
        first_rows = await shortlist(session, first)
        second_rows = await shortlist(session, second)
    assert len(first_rows) == 1 and first_rows[0]["note"] is None
    assert len(second_rows) == 1 and second_rows[0]["note"] == "Second principal"
    await engine.dispose()
