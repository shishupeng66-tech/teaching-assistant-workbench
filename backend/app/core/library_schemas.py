from typing import Any, Literal
from pydantic import Field, field_validator
from app.core.schemas import Input
from app.services.rich_content import validate_document, document

QUESTION_TYPES = [
    "单选题",
    "多选题",
    "判断题",
    "填空题",
    "简答题",
    "计算题",
    "实验题",
    "综合题",
]


class CatalogInput(Input):
    name: str = Field(default="", max_length=100)
    code: str = Field(default="", max_length=50)
    subject_id: str | None = None
    edition_id: str | None = None
    book_id: str | None = None
    parent_id: str | None = None
    grade: str = Field(default="", max_length=40)
    volume: str = Field(default="", max_length=60)
    kind: Literal["chapter", "section", "lesson"] = "chapter"
    position: int = Field(default=10, ge=0, le=100000)
    description: str = Field(default="", max_length=5000)
    active: bool = True


class PointInput(Input):
    subject_id: str
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=50)
    description: str = Field(default="", max_length=5000)
    parent_id: str | None = None
    active: bool = True
    prerequisite_ids: list[str] = Field(default_factory=list, max_length=100)
    related_ids: list[str] = Field(default_factory=list, max_length=100)
    node_ids: list[str] = Field(default_factory=list, max_length=200)

    teaching_requirements: str = Field(default="", max_length=5000)
    mastery_criteria: list[str] = Field(default_factory=list, max_length=40)
    difficulty_min: int = Field(default=1, ge=1, le=5)
    difficulty_max: int = Field(default=5, ge=1, le=5)
    content_source: str = Field(default="", max_length=5000)
    expected_version: int | None = None


class MappingInput(Input):
    knowledge_point_ids: list[str] = Field(max_length=200)


class KnowledgeLink(Input):
    knowledge_point_id: str
    is_primary: bool = False
    weight: float | None = Field(default=None, gt=0, le=1)
    part_refs: list[str] = Field(default_factory=list, max_length=20)


class Part(Input):
    ref: str = Field(min_length=1, max_length=40)
    max_score: float | None = Field(default=None, gt=0, le=1000)
    rubric: dict[str, Any] = Field(default_factory=document)

    @field_validator("rubric")
    @classmethod
    def doc(cls, v):
        return validate_document(v)


class QuestionInput(Input):
    subject_id: str
    grade: str = Field(default="", max_length=40)
    question_type: Literal[
        "单选题", "多选题", "判断题", "填空题", "简答题", "计算题", "实验题", "综合题"
    ]
    difficulty: int = Field(ge=1, le=5)
    stem: dict[str, Any]
    answer: dict[str, Any] = Field(default_factory=document)
    explanation: dict[str, Any] = Field(default_factory=document)
    source: str = Field(default="", max_length=1000)
    knowledge_links: list[KnowledgeLink] = Field(default_factory=list, max_length=100)
    node_ids: list[str] = Field(default_factory=list, max_length=200)
    parts: list[Part] = Field(default_factory=list, max_length=20)
    expected_version: int | None = Field(default=None, ge=1)
    confirm_similarity: bool = False

    @field_validator("stem", "answer", "explanation")
    @classmethod
    def doc(cls, v):
        return validate_document(v)


class ReviewInput(Input):
    action: Literal["submit", "approve", "reject", "archive", "draft"]
    expected_version: int = Field(ge=1)
    note: str = Field(default="", max_length=2000)


class DuplicateInput(Input):
    subject_id: str
    stem: dict[str, Any]
    exclude_id: str | None = None

    @field_validator("stem")
    @classmethod
    def doc(cls, v):
        return validate_document(v)
