from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    for table in ["knowledge_points", "questions"]:
        op.add_column(
            table,
            sa.Column(
                "data_space", sa.String(), nullable=False, server_default="textbook"
            ),
        )
    op.create_table(
        "graph_transfer_receipts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("manifest", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
    )


def downgrade():
    raise RuntimeError("不支持破坏性降级")
