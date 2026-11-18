"""Phase 2: stable identities, temporal enrollment, consistent seating and audit."""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "classrooms",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("school_year", sa.String(), nullable=False),
        sa.Column("grade", sa.String(), nullable=False),
        sa.Column("class_number", sa.String(), nullable=False),
        sa.Column("archived", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.CheckConstraint("archived IN (0,1)"),
    )
    op.create_table(
        "students",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("student_no", sa.String(), unique=True),
        sa.Column("gender", sa.String()),
        sa.Column("entry_year", sa.Integer()),
        sa.Column("notes", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.CheckConstraint("status IN ('active','archived')"),
    )
    op.create_table(
        "enrollments",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "student_id", sa.String(), sa.ForeignKey("students.id"), nullable=False
        ),
        sa.Column(
            "class_id", sa.String(), sa.ForeignKey("classrooms.id"), nullable=False
        ),
        sa.Column("class_name", sa.String(), nullable=False),
        sa.Column("school_year", sa.String(), nullable=False),
        sa.Column("grade", sa.String(), nullable=False),
        sa.Column("class_number", sa.String(), nullable=False),
        sa.Column("started_at", sa.String(), nullable=False),
        sa.Column("ended_at", sa.String()),
        sa.Column("end_reason", sa.String()),
    )
    op.create_index(
        "uq_current_enrollment",
        "enrollments",
        ["student_id"],
        unique=True,
        sqlite_where=sa.text("ended_at IS NULL"),
    )
    op.create_index("ix_enrollment_class", "enrollments", ["class_id", "ended_at"])
    op.create_table(
        "classroom_layouts",
        sa.Column(
            "class_id", sa.String(), sa.ForeignKey("classrooms.id"), primary_key=True
        ),
        sa.Column("rows", sa.Integer(), nullable=False),
        sa.Column("columns", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.CheckConstraint("rows BETWEEN 1 AND 12 AND columns BETWEEN 1 AND 12"),
    )
    op.create_table(
        "seat_assignments",
        sa.Column(
            "class_id",
            sa.String(),
            sa.ForeignKey("classroom_layouts.class_id"),
            primary_key=True,
        ),
        sa.Column("row", sa.Integer(), primary_key=True),
        sa.Column("column", sa.Integer(), primary_key=True),
        sa.Column(
            "student_id",
            sa.String(),
            sa.ForeignKey("students.id"),
            nullable=False,
            unique=True,
        ),
        sa.CheckConstraint('row > 0 AND "column" > 0'),
    )
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("at", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("before_json", sa.String()),
        sa.Column("after_json", sa.String()),
        sa.Column("actor", sa.String(), nullable=False),
    )
    op.create_index("ix_audit_logs_entity_id", "audit_logs", ["entity_id"])
    op.create_table(
        "import_batches",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "class_id", sa.String(), sa.ForeignKey("classrooms.id"), nullable=False
        ),
        sa.Column("file_hash", sa.String(), nullable=False),
        sa.Column("result_json", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.UniqueConstraint("class_id", "file_hash"),
    )
    # DB-level checks also cover writes outside the application service.
    for operation in ("INSERT", "UPDATE"):
        op.execute(f"""CREATE TRIGGER seat_guard_{operation.lower()} BEFORE {operation} ON seat_assignments BEGIN
          SELECT RAISE(ABORT, 'seat membership or bounds invalid') WHERE
          NOT EXISTS (SELECT 1 FROM enrollments e JOIN students s ON s.id=e.student_id JOIN classrooms c ON c.id=e.class_id JOIN classroom_layouts l ON l.class_id=c.id
          WHERE e.student_id=NEW.student_id AND e.class_id=NEW.class_id AND e.ended_at IS NULL AND s.status='active' AND c.archived=0 AND NEW.row<=l.rows AND NEW."column"<=l.columns);
        END""")
    op.execute("""CREATE TRIGGER layout_guard BEFORE UPDATE ON classroom_layouts BEGIN
      SELECT RAISE(ABORT, 'occupied seat outside layout') WHERE EXISTS (SELECT 1 FROM seat_assignments WHERE class_id=NEW.class_id AND (row>NEW.rows OR "column">NEW.columns)); END""")


def downgrade():
    raise RuntimeError("第二阶段不支持破坏性降级，请恢复经验证的本项目备份")
