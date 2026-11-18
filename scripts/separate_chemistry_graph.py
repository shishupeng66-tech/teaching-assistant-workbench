"""Offline inspect / verified transfer; never physically deletes main-library rows."""

import argparse, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from dotenv import load_dotenv
from app.core.config import Settings
from app.services.storage import Storage
from app.services.chemistry_store import ChemistryStore
from app.services.chemistry_transfer import collect, transfer

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    load_dotenv(ROOT / ".env", override=False)
    main = Storage(Settings())
    graph = None
    try:
        main.initialize()
        graph = ChemistryStore(main)
        if args.apply:
            result = transfer(main, graph)
        else:
            data = collect(main)
            result = dict(
                conflicts=data["conflicts"],
                tables=data["manifest"],
                points=len(data["points"]),
                questions=len(data["questions"]),
                assets=len(data["assets"]),
            )
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        if graph:
            graph.close()
        main.close()
