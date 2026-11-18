"""Stop this project's server first; never bypass its exclusive database lock."""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from dotenv import load_dotenv
from app.core.config import Settings
from app.services.storage import Storage
from app.services.textbook_seed import apply, load

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="上海五四化学目录：校验或安全增量导入")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="已获教师授权后实际导入；默认仅校验数据文件",
    )
    args = parser.parse_args()
    directory = ROOT / "data-seeds/textbooks/shanghai-junior-chemistry"
    if not args.apply:
        payload, digest = load(directory)
        print(
            json.dumps(
                dict(
                    sha256=digest,
                    books=[
                        dict(grade=b["grade"], nodes=len(b["nodes"]))
                        for b in payload["books"]
                    ],
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        load_dotenv(ROOT / ".env", override=False)
        storage = Storage(Settings())
        try:
            storage.initialize()
            print(json.dumps(apply(storage, directory), ensure_ascii=False, indent=2))
        finally:
            storage.close()
