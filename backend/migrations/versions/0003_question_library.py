"""Phase 3: independent curriculum, knowledge, questions, immutable snapshots and assets."""

from alembic import op
from sqlalchemy import MetaData

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None
from sqlalchemy import (
    Table,
    Column,
    String,
    Integer,
    Float,
    JSON,
    ForeignKey,
    UniqueConstraint,
    CheckConstraint,
    Index,
    text,
    ForeignKeyConstraint,
)


def define(metadata):
    def identity():
        return Column("id", String, primary_key=True)

    def fk(name, target, **kw):
        return Column(name, String, ForeignKey(target), **kw)

    def required(name):
        return Column(name, String, nullable=False)

    def active():
        return Column("active", Integer, nullable=False, server_default="1")

    subjects = Table(
        "subjects",
        metadata,
        identity(),
        required("name"),
        Column("code", String, nullable=False, unique=True),
        active(),
    )
    editions = Table(
        "textbook_editions",
        metadata,
        identity(),
        fk("subject_id", "subjects.id", nullable=False),
        required("name"),
        Column("description", String, nullable=False, server_default=""),
        active(),
        UniqueConstraint("subject_id", "name"),
    )
    books = Table(
        "textbook_books",
        metadata,
        identity(),
        fk("edition_id", "textbook_editions.id", nullable=False),
        required("grade"),
        required("volume"),
        active(),
        UniqueConstraint("edition_id", "grade", "volume"),
    )
    nodes = Table(
        "curriculum_nodes",
        metadata,
        identity(),
        fk("book_id", "textbook_books.id", nullable=False),
        fk("parent_id", "curriculum_nodes.id"),
        required("name"),
        required("kind"),
        Column("position", Integer, nullable=False),
        Column("description", String, nullable=False, server_default=""),
        active(),
        CheckConstraint("kind IN ('chapter','section','lesson')"),
        CheckConstraint("position>=0"),
    )
    Index(
        "ix_nodes_parent_order",
        nodes.c.book_id,
        nodes.c.parent_id,
        nodes.c.position,
        nodes.c.id,
    )
    points = Table(
        "knowledge_points",
        metadata,
        identity(),
        fk("subject_id", "subjects.id", nullable=False),
        required("name"),
        required("code"),
        Column("description", String, nullable=False, server_default=""),
        fk("parent_id", "knowledge_points.id"),
        active(),
        UniqueConstraint("subject_id", "code"),
    )
    relations = Table(
        "knowledge_point_relations",
        metadata,
        identity(),
        fk("source_id", "knowledge_points.id", nullable=False),
        fk("target_id", "knowledge_points.id", nullable=False),
        required("kind"),
        UniqueConstraint("source_id", "target_id", "kind"),
        CheckConstraint("source_id<>target_id"),
        CheckConstraint("kind IN ('prerequisite','related')"),
    )
    mappings = Table(
        "curriculum_mappings",
        metadata,
        fk("node_id", "curriculum_nodes.id", primary_key=True),
        fk("knowledge_point_id", "knowledge_points.id", primary_key=True),
    )
    questions = Table(
        "questions",
        metadata,
        identity(),
        fk("subject_id", "subjects.id", nullable=False),
        required("grade"),
        required("question_type"),
        Column("difficulty", Integer, nullable=False),
        Column("stem", JSON, nullable=False),
        Column("answer", JSON, nullable=False),
        Column("explanation", JSON, nullable=False),
        Column("parts", JSON, nullable=False),
        Column("source", String, nullable=False),
        Column("source_kind", String, nullable=False),
        required("status"),
        Column("version", Integer, nullable=False),
        Column("normalized_text", String, nullable=False),
        Column("fingerprint", String, nullable=False),
        required("created_at"),
        required("updated_at"),
        CheckConstraint("difficulty BETWEEN 1 AND 5"),
        CheckConstraint("status IN ('draft','pending','approved','archived')"),
    )
    Index(
        "ix_questions_filter",
        questions.c.subject_id,
        questions.c.status,
        questions.c.grade,
        questions.c.question_type,
        questions.c.difficulty,
    )
    Index("ix_questions_fingerprint", questions.c.subject_id, questions.c.fingerprint)
    qkp = Table(
        "question_knowledge_points",
        metadata,
        fk("question_id", "questions.id", primary_key=True),
        fk("knowledge_point_id", "knowledge_points.id", primary_key=True),
        Column("is_primary", Integer, nullable=False),
        Column("weight", Float),
        Column("part_refs", JSON, nullable=False),
        CheckConstraint("is_primary IN (0,1)"),
        CheckConstraint("weight IS NULL OR (weight>0 AND weight<=1)"),
    )
    Index(
        "uq_question_primary_point",
        qkp.c.question_id,
        unique=True,
        sqlite_where=text("is_primary=1"),
    )
    qnodes = Table(
        "question_curriculum_nodes",
        metadata,
        fk("question_id", "questions.id", primary_key=True),
        fk("node_id", "curriculum_nodes.id", primary_key=True),
    )
    assets = Table(
        "question_assets",
        metadata,
        identity(),
        Column("storage_name", String, nullable=False, unique=True),
        required("original_name"),
        required("mime"),
        Column("size", Integer, nullable=False),
        required("sha256"),
        Column("width", Integer, nullable=False),
        Column("height", Integer, nullable=False),
        required("created_at"),
    )
    alinks = Table(
        "question_asset_links",
        metadata,
        fk("question_id", "questions.id", primary_key=True),
        fk("asset_id", "question_assets.id", primary_key=True),
    )
    revisions = Table(
        "question_revisions",
        metadata,
        identity(),
        fk("question_id", "questions.id", nullable=False),
        Column("version", Integer, nullable=False),
        Column("snapshot", JSON, nullable=False),
        required("reason"),
        required("created_at"),
        UniqueConstraint("question_id", "version"),
    )
    reviews = Table(
        "question_reviews",
        metadata,
        identity(),
        fk("question_id", "questions.id", nullable=False),
        Column("version", Integer, nullable=False),
        required("action"),
        required("before_status"),
        required("after_status"),
        Column("note", String, nullable=False),
        required("created_at"),
        ForeignKeyConstraint(
            ["question_id", "version"],
            ["question_revisions.question_id", "question_revisions.version"],
        ),
    )
    batches = Table(
        "library_import_batches",
        metadata,
        identity(),
        required("kind"),
        required("scope_id"),
        required("file_hash"),
        Column("result", JSON, nullable=False),
        required("created_at"),
        UniqueConstraint("kind", "scope_id", "file_hash"),
    )
    return dict(
        subjects=subjects,
        editions=editions,
        books=books,
        nodes=nodes,
        points=points,
        relations=relations,
        mappings=mappings,
        questions=questions,
        qkp=qkp,
        qnodes=qnodes,
        assets=assets,
        alinks=alinks,
        revisions=revisions,
        reviews=reviews,
        batches=batches,
    )


def upgrade():
    metadata = MetaData()
    define(metadata)
    for table in metadata.sorted_tables:
        table.create(op.get_bind())

    for table, field in (
        ("curriculum_nodes", "book_id"),
        ("knowledge_points", "subject_id"),
    ):
        for operation in ("INSERT", "UPDATE"):
            op.execute(f"""CREATE TRIGGER guard_{table}_{operation.lower()} BEFORE {operation} ON {table} WHEN NEW.parent_id IS NOT NULL BEGIN
              SELECT RAISE(ABORT,'invalid parent scope') WHERE NOT EXISTS (SELECT 1 FROM {table} WHERE id=NEW.parent_id AND {field}=NEW.{field});
              SELECT RAISE(ABORT,'cyclic parent') WHERE NEW.parent_id=NEW.id OR EXISTS (WITH RECURSIVE ancestors(id,parent_id) AS (SELECT id,parent_id FROM {table} WHERE id=NEW.parent_id UNION SELECT p.id,p.parent_id FROM {table} p JOIN ancestors a ON p.id=a.parent_id) SELECT 1 FROM ancestors WHERE id=NEW.id);
            END""")
    for table, condition in (
        (
            "knowledge_point_relations",
            "EXISTS (SELECT 1 FROM knowledge_points a JOIN knowledge_points b ON a.subject_id=b.subject_id WHERE a.id=NEW.source_id AND b.id=NEW.target_id)",
        ),
        (
            "curriculum_mappings",
            "EXISTS (SELECT 1 FROM curriculum_nodes n JOIN textbook_books b ON b.id=n.book_id JOIN textbook_editions e ON e.id=b.edition_id JOIN knowledge_points k ON k.subject_id=e.subject_id WHERE n.id=NEW.node_id AND k.id=NEW.knowledge_point_id)",
        ),
        (
            "question_knowledge_points",
            "EXISTS (SELECT 1 FROM questions q JOIN knowledge_points k ON k.subject_id=q.subject_id WHERE q.id=NEW.question_id AND k.id=NEW.knowledge_point_id)",
        ),
        (
            "question_curriculum_nodes",
            "EXISTS (SELECT 1 FROM questions q JOIN textbook_editions e ON e.subject_id=q.subject_id JOIN textbook_books b ON b.edition_id=e.id JOIN curriculum_nodes n ON n.book_id=b.id WHERE q.id=NEW.question_id AND n.id=NEW.node_id)",
        ),
    ):
        for operation in ("INSERT", "UPDATE"):
            op.execute(
                f"CREATE TRIGGER guard_{table}_{operation.lower()} BEFORE {operation} ON {table} BEGIN SELECT RAISE(ABORT,'subject mismatch') WHERE NOT ({condition}); END"
            )
    op.execute("""CREATE TRIGGER guard_prerequisite_cycle BEFORE INSERT ON knowledge_point_relations WHEN NEW.kind='prerequisite' BEGIN
      SELECT RAISE(ABORT,'cyclic prerequisite') WHERE EXISTS (WITH RECURSIVE walk(id) AS (SELECT NEW.target_id UNION SELECT r.target_id FROM knowledge_point_relations r JOIN walk w ON r.source_id=w.id WHERE r.kind='prerequisite') SELECT 1 FROM walk WHERE id=NEW.source_id); END""")


def downgrade():
    raise RuntimeError("不支持破坏性降级，请恢复经验证的本项目备份")
