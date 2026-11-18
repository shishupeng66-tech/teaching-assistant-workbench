from alembic import context
from sqlalchemy import create_engine, pool
from app.core.database import Base, make_engine
from app.core import models, library_models, taxonomy_models, content_models

config = context.config
# No implicit fallback database: migration must be called through the guarded CLI.
if "db_path" not in config.attributes or "instance_id" not in config.attributes:
    raise RuntimeError("请使用 python -m app.manage migrate，以先检查数据库归属")
engine = make_engine(config.attributes["db_path"])
with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()
engine.dispose()
