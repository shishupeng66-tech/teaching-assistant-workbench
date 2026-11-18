#!/usr/bin/env python3
"""默认只预览。停止本项目后端后运行；--apply 会先创建并验证数据库+附件快照。"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.core.config import Settings
from app.services.storage import Storage
from app.services.textbook_content import seed

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--apply", action="store_true")
args = p.parse_args()
st = Storage(Settings())
try:
    st.initialize()  # 版本变化由Storage在迁移前另行完整备份。
    preview = seed(st)
    if args.apply and not preview["already_imported"]:
        backup = st.backup()
        st._validate(st.backup_path(backup))
        result = seed(st, True)
        result["backup"] = backup
    else:
        result = preview
    print(json.dumps(result, ensure_ascii=False, indent=2))
finally:
    st.close()
