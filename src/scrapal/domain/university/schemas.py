from typing import Literal

from pydantic import BaseModel, Field


class FieldEvidence(BaseModel):
    source_url: str
    field: str
    method: str
    excerpt: str
    section: str | None = None
    selector: str | None = None
    confidence: float = Field(ge=0, le=1)


class CourseFee(BaseModel):
    residency: Literal["home", "international", "unknown"] = "unknown"
    label: str
    amount: int | None = None
    currency: str | None = None
    academic_year: str | None = None
    study_mode: str | None = None
    raw_values: list[str] = Field(default_factory=list)


class CourseIntake(BaseModel):
    month: str
    study_modes: list[str] = Field(default_factory=list)
    durations: list[str] = Field(default_factory=list)
    campuses: list[str] = Field(default_factory=list)
    application_deadline: str | None = None
    scope: Literal["intake", "course_page"] = "course_page"


class CourseIntelligenceRecord(BaseModel):
    title: str
    award: str | None = None
    level: Literal["undergraduate", "postgraduate"]
    school: list[str] = Field(default_factory=list)
    campuses: list[str] = Field(default_factory=list)
    study_modes: list[str] = Field(default_factory=list)
    durations: list[str] = Field(default_factory=list)
    intake_months: list[str] = Field(default_factory=list)
    intakes: list[CourseIntake] = Field(default_factory=list)
    fees: list[CourseFee] = Field(default_factory=list)
    entry_requirements: str | None = None
    english_requirements: str | None = None
    application_documents: list[str] = Field(default_factory=list)
    application_routes: list[str] = Field(default_factory=list)
    deadlines: list[str] = Field(default_factory=list)
    modules: list[str] = Field(default_factory=list)
    accreditations: list[str] = Field(default_factory=list)
    scholarships: list[str] = Field(default_factory=list)
    course_content: str | None = None
    careers: str | None = None
    ucas_code: str | None = None
    source_url: str


REQUIRED_COURSE_FIELDS = (
    "title",
    "award",
    "level",
    "campuses",
    "durations",
    "intake_months",
    "fees",
    "entry_requirements",
)


def course_coverage(record: CourseIntelligenceRecord) -> tuple[float, list[str]]:
    payload = record.model_dump()
    missing = [field for field in REQUIRED_COURSE_FIELDS if not payload.get(field)]
    return round((len(REQUIRED_COURSE_FIELDS) - len(missing)) / len(REQUIRED_COURSE_FIELDS), 3), missing
