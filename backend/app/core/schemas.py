from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ClassInput(Input):
    name: str = Field(min_length=1, max_length=80)
    school_year: str = Field(min_length=1, max_length=30)
    grade: str = Field(default="", max_length=30)
    class_number: str = Field(default="", max_length=30)


class StudentInput(Input):
    name: str = Field(min_length=1, max_length=80)
    student_no: str | None = Field(default=None, max_length=60)
    gender: Literal["男", "女", "其他"] | None = None
    entry_year: int | None = Field(default=None, ge=1900, le=2100)
    notes: str = Field(default="", max_length=2000)

    @field_validator("student_no", mode="before")
    @classmethod
    def optional_no(cls, v):
        return None if v is None or str(v).strip() == "" else str(v).strip()


class StudentCreate(StudentInput):
    class_id: str


class TransferInput(Input):
    class_id: str


class ArchiveInput(Input):
    confirmation: Literal["确认归档"]


class SeatInput(Input):
    row: int = Field(ge=1, le=12)
    column: int = Field(ge=1, le=12)
    student_id: str


class LayoutInput(Input):
    rows: int = Field(ge=1, le=12)
    columns: int = Field(ge=1, le=12)
    expected_version: int = Field(ge=1)
    assignments: list[SeatInput] = Field(max_length=144)
