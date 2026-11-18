from sqlalchemy import (
    Table,
    Column,
    String,
    JSON,
    ForeignKey,
    UniqueConstraint,
    CheckConstraint,
    Float,
)
from app.core.database import Base


def define(metadata):
    sources = Table(
        "taxonomy_sources",
        metadata,
        Column("id", String, primary_key=True),
        Column("repository", String, nullable=False),
        Column("commit_sha", String, nullable=False),
        Column("license", String, nullable=False),
        Column("attribution", String, nullable=False),
        Column("manifest", JSON, nullable=False),
        Column("created_at", String, nullable=False),
        UniqueConstraint("repository", "commit_sha"),
    )
    items = Table(
        "taxonomy_items",
        metadata,
        Column("id", String, primary_key=True),
        Column("source_id", String, ForeignKey("taxonomy_sources.id"), nullable=False),
        Column("kind", String, nullable=False),
        Column("external_id", String, nullable=False),
        Column("original_name", String, nullable=False),
        Column("point_id", String, ForeignKey("knowledge_points.id")),
        Column("question_id", String, ForeignKey("questions.id")),
        Column("prerequisite_id", String, ForeignKey("knowledge_points.id")),
        Column("payload", JSON, nullable=False),
        Column("review_status", String, nullable=False),
        Column("processing_status", String, nullable=False),
        Column("note", String, nullable=False),
        UniqueConstraint("source_id", "kind", "external_id"),
        CheckConstraint("review_status IN ('pending','approved','rejected')"),
        CheckConstraint("kind IN ('point','question','dependency')"),
    )
    mappings = Table(
        "taxonomy_mappings",
        metadata,
        Column("id", String, primary_key=True),
        Column("item_id", String, ForeignKey("taxonomy_items.id"), nullable=False),
        Column("node_id", String, ForeignKey("curriculum_nodes.id"), nullable=False),
        Column("reason", String, nullable=False),
        Column("confidence", Float, nullable=False),
        Column("status", String, nullable=False),
        UniqueConstraint("item_id", "node_id"),
        CheckConstraint("confidence>=0 AND confidence<=1"),
        CheckConstraint("status IN ('pending','approved','rejected')"),
    )
    return sources, items, mappings


sources, items, mappings = define(Base.metadata)
