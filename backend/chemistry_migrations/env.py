from alembic import context
from app.core.database import make_engine

config = context.config
if "db_path" not in config.attributes:
    raise RuntimeError("必须使用独立图谱存储管理器迁移")
engine = make_engine(config.attributes["db_path"])
with engine.connect() as connection:
    context.configure(connection=connection)
    with context.begin_transaction():
        context.run_migrations()
engine.dispose()
