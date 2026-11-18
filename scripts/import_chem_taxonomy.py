"""Fixed-commit chemistry extraction. Never executes upstream scripts or verify."""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from dotenv import load_dotenv
from app.core.config import Settings
from app.services.storage import Storage
from app.services.taxonomy import load
from app.services.chemistry_store import ChemistryStore
from app.services.chemistry import initialize_source, overview

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="初中化学来源预览；--apply导入待审核数据"
    )
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    load_dotenv(ROOT / ".env", override=False)
    storage = Storage(Settings())
    graph = None
    try:
        storage.initialize()
        graph = ChemistryStore(storage)
        print(
            json.dumps(
                initialize_source(graph)
                if args.apply
                else {
                    "source_commit": load()[0]["manifest"]["commit"],
                    "target": "独立化学知识图谱数据库",
                    "preview": {
                        "points": 45,
                        "questions": 180,
                        "edges": 80,
                        "images": 48,
                    },
                    "current": overview(graph),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    finally:
        if graph:
            graph.close()
        storage.close()
