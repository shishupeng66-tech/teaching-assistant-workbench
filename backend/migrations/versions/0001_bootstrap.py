"""Only application identity; business entities are deferred."""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    table = op.create_table(
        "app_metadata",
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("value", sa.String(), nullable=False),
    )
    op.bulk_insert(
        table,
        [
            {"key": "app_id", "value": "teaching-assistant-workbench"},
            {
                "key": "instance_id",
                "value": op.get_context().config.attributes["instance_id"],
            },
        ],
    )


def downgrade():
    raise RuntimeError("第一阶段不提供破坏性降级，请使用经过验证的备份")
