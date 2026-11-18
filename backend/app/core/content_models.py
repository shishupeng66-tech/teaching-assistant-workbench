from sqlalchemy import (
    JSON,
    CheckConstraint,
    Column,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    UniqueConstraint,
)

from app.core.database import Base


def define(metadata):
    profiles = Table(
        "knowledge_point_profiles",
        metadata,
        Column("point_id", String, ForeignKey("knowledge_points.id"), primary_key=True),
        Column("requirements", String, nullable=False),
        Column("mastery", JSON, nullable=False),
        Column("difficulty_min", Integer, nullable=False),
        Column("difficulty_max", Integer, nullable=False),
        Column("source", String, nullable=False),
        Column("version", Integer, nullable=False),
        CheckConstraint(
            "difficulty_min>=1 AND difficulty_max<=5 AND difficulty_min<=difficulty_max"
        ),
    )
    candidates = Table(
        "content_candidates",
        metadata,
        Column("id", String, primary_key=True),
        Column("seed_key", String, nullable=False),
        Column("point_id", String, ForeignKey("knowledge_points.id")),
        Column("question_id", String, ForeignKey("questions.id")),
        Column("node_id", String, ForeignKey("curriculum_nodes.id"), nullable=False),
        Column("confidence", Float, nullable=False),
        Column("reason", String, nullable=False),
        Column("status", String, nullable=False),
        UniqueConstraint("point_id", "node_id"),
        UniqueConstraint("question_id", "node_id"),
        CheckConstraint(
            "(point_id IS NOT NULL AND question_id IS NULL) OR (point_id IS NULL AND question_id IS NOT NULL)"
        ),
        CheckConstraint("status IN ('pending','approved','rejected')"),
    )
    reviews = Table(
        "content_reviews",
        metadata,
        Column("id", String, primary_key=True),
        Column("entity_kind", String, nullable=False),
        Column("entity_id", String, nullable=False),
        Column("action", String, nullable=False),
        Column("note", String, nullable=False),
        Column("batch_id", String, nullable=False),
        Column("before", JSON, nullable=False),
        Column("after", JSON, nullable=False),
        Column("created_at", String, nullable=False),
    )
    batches = Table(
        "content_review_batches",
        metadata,
        Column("id", String, primary_key=True),
        Column("payload", JSON, nullable=False),
        Column("consumed", Integer, nullable=False),
        Column("created_at", String, nullable=False),
    )
    return profiles, candidates, reviews, batches


profiles, candidates, reviews, batches = define(Base.metadata)
