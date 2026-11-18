"""Lossless copy, verify, then quarantine historical main-library rows. No DELETE."""

import hashlib
import json
from pathlib import Path
from uuid import uuid4
from sqlalchemy import select, update, insert, or_, text
from app.core import library_models as m, taxonomy_models as t
from app.core.models import now, AuditLog
from app.services.classes import transaction, audit, BusinessError
from app.services.library import all_rows, question_view
from app.services import asset_snapshots
from app.services.chemistry_store import dumps, utc


def digest(value):
    return hashlib.sha256(dumps(value).encode()).hexdigest()


def collect(main):
    with transaction(main) as s:
        records = all_rows(s, t.items)
        points = [r for r in records if r["kind"] == "point"]
        questions = [r for r in records if r["kind"] == "question" and r["question_id"]]
        pids = {r["point_id"] for r in points}
        qids = {r["question_id"] for r in questions}
        itemids = {r["id"] for r in records}
        point_rows = [
            dict(r)
            for r in s.execute(
                select(m.points).where(m.points.c.id.in_(pids))
            ).mappings()
        ]
        qrows = [
            dict(r)
            for r in s.execute(
                select(m.questions).where(m.questions.c.id.in_(qids))
            ).mappings()
        ]
        qviews = {qid: question_view(s, qid, True) for qid in sorted(qids)}
        archive = {
            "taxonomy_sources": all_rows(s, t.sources),
            "taxonomy_items": records,
            "taxonomy_mappings": [
                r for r in all_rows(s, t.mappings) if r["item_id"] in itemids
            ],
            "knowledge_points": point_rows,
            "questions": qrows,
            "question_revisions": [
                r for r in all_rows(s, m.revisions) if r["question_id"] in qids
            ],
            "question_reviews": [
                r for r in all_rows(s, m.reviews) if r["question_id"] in qids
            ],
            "question_knowledge_points": [
                r
                for r in all_rows(s, m.qkp)
                if r["question_id"] in qids or r["knowledge_point_id"] in pids
            ],
            "question_curriculum_nodes": [
                r for r in all_rows(s, m.qnodes) if r["question_id"] in qids
            ],
            "curriculum_mappings": [
                r for r in all_rows(s, m.mappings) if r["knowledge_point_id"] in pids
            ],
            "knowledge_point_relations": [
                r
                for r in all_rows(s, m.relations)
                if r["source_id"] in pids or r["target_id"] in pids
            ],
            "question_asset_links": [
                r for r in all_rows(s, m.alinks) if r["question_id"] in qids
            ],
        }
        audits = s.execute(
            select(AuditLog).where(
                or_(
                    AuditLog.entity_id.in_(pids | qids | itemids),
                    AuditLog.action.like("taxonomy.%"),
                )
            )
        ).scalars()
        archive["audit_logs"] = [
            {c.key: getattr(r, c.key) for c in AuditLog.__table__.columns}
            for r in audits
        ]
        # Include images referenced in both current and historical snapshots.
        from app.services.rich_content import asset_ids

        aids = {r["asset_id"] for r in archive["question_asset_links"]}
        for r in archive["question_revisions"]:
            snap = r["snapshot"]
            for field in ["stem", "answer", "explanation"]:
                if field in snap:
                    aids |= asset_ids(snap[field])
        assets = [
            dict(r)
            for r in s.execute(
                select(m.assets).where(m.assets.c.id.in_(aids))
            ).mappings()
        ]
        archive["question_assets"] = assets
    conflicts = []
    originals = {r["point_id"]: r["payload"] for r in points}
    for p in point_rows:
        raw = originals[p["id"]]
        expected = (
            raw["description"]
            + "\n掌握标准（来源建议，教师待审核）：\n"
            + "\n".join(raw.get("mastery_criteria", []))
            + "\n来源：https://github.com/xiaoyang111222/cn-math-taxonomy @ aa2c22058222d0df404f1819e2fbdb97a62049ea；CC BY-NC 4.0"
        )
        if (
            p["active"] != 1
            or p["code"] != raw["id"]
            or p["parent_id"] is not None
            or p["review_status"] != "pending"
            or p["name"] != raw["name"]
            or p["description"] != expected
        ):
            conflicts.append(
                dict(
                    kind="point",
                    id=p["id"],
                    reason="知识点已审核或修改；需保留修改并确认原题库关联处理",
                )
            )
    for q in qrows:
        if q["status"] != "pending" or q["version"] != 1:
            conflicts.append(
                dict(
                    kind="question",
                    id=q["id"],
                    reason="题目已审核或修改；不得自动清除原题库引用",
                )
            )
    for key in [
        "curriculum_mappings",
        "question_curriculum_nodes",
        "knowledge_point_relations",
    ]:
        if archive[key]:
            conflicts.append(
                dict(
                    kind=key,
                    count=len(archive[key]),
                    reason="发现人工正式关联，需项目所有者确认如何保留原空间引用",
                )
            )
    cross = [
        r for r in archive["question_knowledge_points"] if r["question_id"] not in qids
    ]
    if cross:
        conflicts.append(
            dict(
                kind="manual_question_links",
                count=len(cross),
                reason="教师题目关联了来源知识点，不能自动隔离该关联",
            )
        )
    for r in records:
        if r["review_status"] != "pending":
            conflicts.append(
                dict(kind=r["kind"], id=r["id"], reason="来源审核记录已变化")
            )
    manifest = {
        k: dict(count=len(v), sha256=digest(sorted(v, key=dumps)))
        for k, v in archive.items()
    }
    return dict(
        points=point_rows,
        questions=qviews,
        records=records,
        archive=archive,
        assets=assets,
        manifest=manifest,
        conflicts=conflicts,
    )


def transfer(main, graph):
    graph.ensure()
    with main.lock:
        with graph.transaction() as c:
            existing = c.execute(
                "SELECT manifest FROM imports WHERE id='legacy-main-v1'"
            ).fetchone()
        if existing:
            receipt = json.loads(existing[0])
            with main.engine.connect() as con:
                published = con.execute(
                    text(
                        "SELECT id FROM graph_transfer_receipts WHERE id='legacy-main-v1'"
                    )
                ).first()
            if not published:
                current = collect(main)
                if current["conflicts"] or current["manifest"] != receipt["tables"]:
                    raise BusinessError(
                        "独立副本已建立但原库发生变化，需人工确认后恢复迁移发布"
                    )
                publish(main, receipt)
            # A second run never overwrites independent edits or recreates source rows.
            return dict(already_transferred=True, manifest=receipt)
        data = collect(main)
        if not data["points"]:
            return dict(already_transferred=False, empty=True)
        if data["conflicts"]:
            raise BusinessError(
                "发现来源数据人工修改/审核/关联，已停止自动隔离；请先审查冲突清单",
                409,
                {"conflicts": data["conflicts"]},
            )
        main_backup = main.backup()
        graph_backup = graph.backup()
        created = []
        receipt = dict(
            main_backup=main_backup,
            graph_backup=graph_backup,
            tables=data["manifest"],
            counts=dict(
                points=len(data["points"]),
                questions=len(data["questions"]),
                edges=sum(r["kind"] == "dependency" for r in data["records"]),
                assets=len(data["assets"]),
            ),
            source_ids={
                r["external_id"]: {
                    "old_id": r["point_id"]
                    if r["kind"] == "point"
                    else r["question_id"],
                    "new_id": r["point_id"]
                    if r["kind"] == "point"
                    else r["question_id"],
                }
                for r in data["records"]
                if r["kind"] in ["point", "question"]
            },
            verified=True,
            created_at=utc(),
        )
        try:
            with graph.transaction() as c:
                if c.execute("SELECT count(*) FROM points").fetchone()[0]:
                    raise BusinessError("独立空间已有内容，拒绝覆盖；请审查来源版本")
                rawpoints = {
                    r["point_id"]: r for r in data["records"] if r["kind"] == "point"
                }
                for p in data["points"]:
                    c.execute(
                        "INSERT INTO points VALUES (?,?,?,?,?,?)",
                        (
                            p["id"],
                            rawpoints[p["id"]]["external_id"],
                            dumps(p),
                            dumps(rawpoints[p["id"]]["payload"]),
                            p["review_status"],
                            1,
                        ),
                    )
                rawqs = {
                    r["question_id"]: r
                    for r in data["records"]
                    if r["kind"] == "question" and r["question_id"]
                }
                for qid, q in data["questions"].items():
                    c.execute(
                        "INSERT INTO questions VALUES (?,?,?,?,?,?,?)",
                        (
                            qid,
                            rawqs[qid]["external_id"],
                            rawqs[qid]["point_id"],
                            dumps(q),
                            dumps(rawqs[qid]["payload"]),
                            q["status"],
                            q["version"],
                        ),
                    )
                for r in data["records"]:
                    if r["kind"] == "dependency":
                        c.execute(
                            "INSERT INTO edges VALUES (?,?,?,?,?,?,?)",
                            (
                                r["id"],
                                r["point_id"],
                                r["prerequisite_id"],
                                r["payload"]["strength"],
                                r["payload"]["reason"],
                                r["review_status"],
                                dumps(r),
                            ),
                        )
                for r in data["archive"]["taxonomy_sources"]:
                    c.execute("INSERT INTO sources VALUES (?,?)", (r["id"], dumps(r)))
                for table, rows in data["archive"].items():
                    for i, row in enumerate(rows):
                        c.execute(
                            "INSERT INTO archive VALUES (?,?,?)",
                            (table, str(i), dumps(row)),
                        )
                for r in data["archive"]["question_revisions"]:
                    c.execute(
                        "INSERT INTO history VALUES (?,?,?,?,?,?,?)",
                        (
                            r["id"],
                            "question",
                            r["question_id"],
                            r["version"],
                            dumps(r["snapshot"]),
                            r["reason"],
                            r["created_at"],
                        ),
                    )
                for a in data["assets"]:
                    content = asset_snapshots.read_checked(
                        main.settings.data_dir / "assets", a
                    )
                    path = graph.assets / a["storage_name"]
                    with path.open("xb") as f:
                        created.append(path)
                        f.write(content)
                    path.chmod(0o600)
                    cols = list(a)
                    c.execute(
                        "INSERT INTO question_assets ("
                        + ",".join(cols)
                        + ") VALUES ("
                        + ",".join("?" for _ in cols)
                        + ")",
                        [a[k] for k in cols],
                    )
                for table, expected in data["manifest"].items():
                    actual = [
                        json.loads(r[0])
                        for r in c.execute(
                            "SELECT payload FROM archive WHERE table_name=?", (table,)
                        )
                    ]
                    if (
                        len(actual) != expected["count"]
                        or digest(sorted(actual, key=dumps)) != expected["sha256"]
                    ):
                        raise BusinessError("迁移逐表哈希校验失败")
                c.execute(
                    "INSERT INTO imports VALUES (?,?,?)",
                    ("legacy-main-v1", dumps(receipt), utc()),
                )
            graph.validate(graph.db)
            for a in data["assets"]:
                asset_snapshots.read_checked(graph.assets, a)
            publish(main, receipt)
            main.journal("chemistry.transfer.completed", receipt)
            return dict(already_transferred=False, manifest=receipt)
        except Exception:
            # Never delete a verified, committed independent copy if main publication failed.
            with graph.transaction() as c:
                committed = c.execute(
                    "SELECT 1 FROM imports WHERE id='legacy-main-v1'"
                ).fetchone()
            if not committed:
                for path in created:
                    path.unlink(missing_ok=True)
            raise


def publish(main, receipt):
    with transaction(main) as s:
        existing = s.execute(
            text("SELECT id FROM graph_transfer_receipts WHERE id='legacy-main-v1'")
        ).first()
        if existing:
            return
        pids = [r["old_id"] for k, r in receipt["source_ids"].items() if "_q" not in k]
        qids = [r["old_id"] for k, r in receipt["source_ids"].items() if "_q" in k]
        s.execute(
            update(m.points)
            .where(m.points.c.id.in_(pids))
            .values(data_space="chemgraph_legacy")
        )
        s.execute(
            update(m.questions)
            .where(m.questions.c.id.in_(qids))
            .values(data_space="chemgraph_legacy")
        )
        s.execute(
            text(
                "INSERT INTO graph_transfer_receipts (id,manifest,created_at) VALUES (:id,:manifest,:created_at)"
            ),
            dict(id="legacy-main-v1", manifest=dumps(receipt), created_at=utc()),
        )
        audit(
            s,
            "chemistry.transfer",
            "chemistry_workspace",
            "legacy-main-v1",
            None,
            receipt,
        )
