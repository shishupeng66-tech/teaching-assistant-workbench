"""只为隔离浏览器自测准备内容；正式启动脚本不使用本文件。"""

import json
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "backend"))
from app.core.config import Settings
from app.services import library as lib
from app.services import textbook_content as tc
from app.services.classes import transaction
from app.services.storage import Storage
from sqlalchemy import insert

settings = Settings()
assert (
    "taw-e2e-" in str(settings.data_dir)
    and settings.data_dir
    != Settings(
        _env_file=None,
        data_dir=Path.home()
        / "Library/Application Support/TeachingAssistantWorkbench/data",
    ).data_dir
)
st = Storage(settings)
st.initialize()
c = json.loads((tc.SEED.parent / "catalog-snapshot.json").read_text())
with transaction(st) as s:
    for key in ["subjects", "editions", "books"]:
        for row in c[key]:
            s.execute(insert(lib.TABLES[key]).values(**row))
    pending = c["nodes"].copy()
    seen = set()
    while pending:
        for row in pending.copy():
            if not row["parent_id"] or row["parent_id"] in seen:
                s.execute(insert(lib.m.nodes).values(**row))
                seen.add(row["id"])
                pending.remove(row)
tc.seed(st, True)
st.close()
os.execv(sys.executable, [sys.executable, str(root / "scripts/dev.py")])
