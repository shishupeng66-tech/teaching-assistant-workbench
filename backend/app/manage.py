import sys
from app.core.config import Settings
from app.services.storage import Storage

if __name__ == "__main__":
    if sys.argv[1:] != ["migrate"]:
        raise SystemExit("用法: python -m app.manage migrate")
    storage = Storage(Settings())
    storage.initialize()
    from app.core.database import REVISION
    print("数据库归属检查与 Alembic 迁移完成："+REVISION)
    storage.close()
