"""Run offline after stopping this workbench; performs the authorized consolidation."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from dotenv import load_dotenv
from app.core.config import Settings
from app.services.storage import Storage
from app.services.consolidate_chemistry import consolidate

if __name__ == "__main__":
    load_dotenv(ROOT / ".env", override=False)
    storage = Storage(Settings())
    try:
        storage.initialize()
        print(
            json.dumps(
                consolidate(
                    storage, ROOT / "data-seeds/textbooks/shanghai-junior-chemistry"
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
    finally:
        storage.close()
