from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import (
    String,
    Integer,
    ForeignKey,
    UniqueConstraint,
    CheckConstraint,
    Index,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


def now():
    return datetime.now(timezone.utc).isoformat()


def uid():
    return uuid4().hex


class Classroom(Base):
    __tablename__ = "classrooms"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    school_year: Mapped[str] = mapped_column(String, nullable=False)
    grade: Mapped[str] = mapped_column(String, nullable=False, default="")
    class_number: Mapped[str] = mapped_column(String, nullable=False, default="")
    archived: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[str] = mapped_column(String, default=now)
    updated_at: Mapped[str] = mapped_column(String, default=now)
    __table_args__ = (CheckConstraint("archived IN (0,1)"),)


class Student(Base):
    __tablename__ = "students"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    student_no: Mapped[str | None] = mapped_column(String, unique=True)
    gender: Mapped[str | None] = mapped_column(String)
    entry_year: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str] = mapped_column(String, nullable=False, default="")
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")
    created_at: Mapped[str] = mapped_column(String, default=now)
    updated_at: Mapped[str] = mapped_column(String, default=now)
    __table_args__ = (CheckConstraint("status IN ('active','archived')"),)


class Enrollment(Base):
    __tablename__ = "enrollments"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id"), nullable=False)
    class_id: Mapped[str] = mapped_column(ForeignKey("classrooms.id"), nullable=False)
    class_name: Mapped[str] = mapped_column(String, nullable=False)
    school_year: Mapped[str] = mapped_column(String, nullable=False)
    grade: Mapped[str] = mapped_column(String, nullable=False)
    class_number: Mapped[str] = mapped_column(String, nullable=False)
    started_at: Mapped[str] = mapped_column(String, default=now)
    ended_at: Mapped[str | None] = mapped_column(String)
    end_reason: Mapped[str | None] = mapped_column(String)
    __table_args__ = (
        Index(
            "uq_current_enrollment",
            "student_id",
            unique=True,
            sqlite_where=text("ended_at IS NULL"),
        ),
    )


class Layout(Base):
    __tablename__ = "classroom_layouts"
    class_id: Mapped[str] = mapped_column(ForeignKey("classrooms.id"), primary_key=True)
    rows: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    columns: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    __table_args__ = (
        CheckConstraint("rows BETWEEN 1 AND 12 AND columns BETWEEN 1 AND 12"),
    )


class SeatAssignment(Base):
    __tablename__ = "seat_assignments"
    class_id: Mapped[str] = mapped_column(
        ForeignKey("classroom_layouts.class_id"), primary_key=True
    )
    row: Mapped[int] = mapped_column(Integer, primary_key=True)
    column: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id"), nullable=False, unique=True
    )
    __table_args__ = (CheckConstraint('row > 0 AND "column" > 0'),)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    at: Mapped[str] = mapped_column(String, nullable=False, default=now)
    action: Mapped[str] = mapped_column(String, nullable=False)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    before_json: Mapped[str | None] = mapped_column(String)
    after_json: Mapped[str | None] = mapped_column(String)
    actor: Mapped[str] = mapped_column(String, nullable=False, default="本机教师")


class ImportBatch(Base):
    __tablename__ = "import_batches"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    class_id: Mapped[str] = mapped_column(ForeignKey("classrooms.id"), nullable=False)
    file_hash: Mapped[str] = mapped_column(String, nullable=False)
    result_json: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[str] = mapped_column(String, nullable=False, default=now)
    __table_args__ = (UniqueConstraint("class_id", "file_hash"),)
