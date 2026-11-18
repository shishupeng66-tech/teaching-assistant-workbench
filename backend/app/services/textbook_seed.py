"""Auditable, additive textbook seed. Run offline under the normal Storage lock."""

import hashlib
import json
from pathlib import Path
from uuid import UUID, uuid5
from sqlalchemy import insert, select
from app.core import library_models as m
from app.core.models import now
from app.services.classes import transaction, audit, BusinessError

NAMESPACE = UUID("2e566792-3859-4189-9db9-5fbba94164f9")
SEED = "shanghai-junior-chemistry-v1"
KINDS = dict(
    theme="chapter",
    topic="section",
    lesson="lesson",
    practice="lesson",
    review="lesson",
    appendix="chapter",
)


def identity(key):
    return uuid5(NAMESPACE, SEED + ":" + key).hex


def load(directory):
    directory = Path(directory)
    provenance = json.loads((directory / "sources.json").read_text())
    books = [
        json.loads((directory / f"grade{grade}.json").read_text()) for grade in (8, 9)
    ]
    seen = set()
    for book in books:
        parents = {}
        sibling_names = set()
        sibling_orders = set()
        for n in book["nodes"]:
            key, parent = n["key"], n["parent_key"]
            if key in seen or (parent and parent not in parents):
                raise ValueError("目录重复、循环或父级不在前")
            if n["book_key"] != book["key"] or n["node_type"] not in KINDS:
                raise ValueError("教材身份或节点类型无效")
            if (
                not n["original_name"].strip()
                or "/" in n["original_name"]
                or "|" in n["original_name"]
            ):
                raise ValueError("目录名称无效")
            if not isinstance(n["position"], int) or n["position"] <= 0:
                raise ValueError("排序无效")
            for value, collection in (
                (n["original_name"], sibling_names),
                (n["position"], sibling_orders),
            ):
                if (parent, value) in collection:
                    raise ValueError("同级名称或顺序重复")
                collection.add((parent, value))
            if not n["sources"] or any(
                src not in provenance["sources"] for src in n["sources"]
            ):
                raise ValueError("缺少可追溯来源")
            expected = {
                "theme": None,
                "topic": "theme",
                "lesson": "topic",
                "practice": "topic",
                "review": "topic",
                "appendix": None,
            }[n["node_type"]]
            if (parents.get(parent) if parent else None) != expected:
                raise ValueError("主题/专题/课题层级错误")
            parents[key] = n["node_type"]
            seen.add(key)
    payload = dict(books=books, provenance=provenance)
    digest = hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()
    return payload, digest


def apply(storage, directory):
    payload, digest = load(directory)
    with storage.lock:
        # Validate a complete DB + assets snapshot before any write, including re-runs.
        backup = storage.backup()
        with transaction(storage) as s:
            batch_id = identity("batch")
            batch = (
                s.execute(select(m.batches).where(m.batches.c.id == batch_id))
                .mappings()
                .first()
            )
            if batch and batch["file_hash"] != digest:
                raise BusinessError(
                    "种子内容已经改变：请人工核对并建立新的数据版本，禁止覆盖"
                )
            existing_subjects = list(
                s.execute(
                    select(m.subjects).where(m.subjects.c.name == "化学")
                ).mappings()
            )
            if len(existing_subjects) > 1 or (
                existing_subjects and not existing_subjects[0]["active"]
            ):
                raise BusinessError("化学学科存在歧义或已停用，请教师先处理")
            subject_id = (
                existing_subjects[0]["id"] if existing_subjects else identity("subject")
            )
            added = []

            def ensure(table, key, data):
                rid = identity(key)
                row = (
                    s.execute(select(table).where(table.c.id == rid)).mappings().first()
                )
                if row:
                    if any(row[k] != v for k, v in data.items()):
                        raise BusinessError("已导入内容发生人工修改，拒绝覆盖：" + key)
                    return rid
                # Same name/identity under a different ID must never be silently reused.
                conditions = [
                    table.c[k] == data[k]
                    for k in (
                        "name",
                        "subject_id",
                        "edition_id",
                        "grade",
                        "volume",
                        "book_id",
                        "parent_id",
                    )
                    if k in data
                ]
                if (
                    conditions
                    and s.execute(select(table.c.id).where(*conditions)).first()
                ):
                    raise BusinessError("发现同名不同身份的目录，请人工核对：" + key)
                s.execute(insert(table).values(id=rid, **data))
                audit(
                    s,
                    "textbook.seed.create",
                    table.name,
                    rid,
                    None,
                    {**data, "seed": SEED, "sha256": digest},
                )
                added.append(rid)
                return rid

            if not existing_subjects:
                subject_id = ensure(
                    m.subjects, "subject", dict(name="化学", code="CHEM-SH54", active=1)
                )
            result = []
            for book in payload["books"]:
                # Keep within the existing 5000-character description field.
                edition = ensure(
                    m.editions,
                    book["key"] + ":edition",
                    dict(
                        subject_id=subject_id,
                        name=book["edition_name"],
                        description=f"{book['title']}；{book['publisher']}；{book['edition']}；ISBN {book['isbn']}。第三方版权页及目录转录，出版社原件待复核。参考标签：{book['requested_label']}。来源详见 data-seeds/textbooks/shanghai-junior-chemistry/sources.json",
                        active=1,
                    ),
                )
                bid = ensure(
                    m.books,
                    book["key"],
                    dict(
                        edition_id=edition,
                        grade=book["grade"],
                        volume=book["volume"],
                        active=1,
                    ),
                )
                for n in book["nodes"]:
                    ensure(
                        m.nodes,
                        n["key"],
                        dict(
                            book_id=bid,
                            parent_id=identity(n["parent_key"])
                            if n["parent_key"]
                            else None,
                            name=n["original_name"],
                            kind=KINDS[n["node_type"]],
                            position=n["position"],
                            description=f"目录类型：{dict(theme='主题', topic='专题', lesson='课题', practice='跨学科实践', review='专题复习', appendix='附录')[n['node_type']]}；教材页码：{n['page']}；核实状态：{n['verification']}。来源："
                            + "；".join(
                                payload["provenance"]["sources"][k]["url"]
                                for k in n["sources"]
                            ),
                            active=1,
                        ),
                    )
                result.append(
                    dict(
                        book_id=bid,
                        edition_id=edition,
                        grade=book["grade"],
                        nodes=len(book["nodes"]),
                    )
                )
            if not batch:
                s.execute(
                    insert(m.batches).values(
                        id=batch_id,
                        kind="textbook_seed",
                        scope_id=SEED,
                        file_hash=digest,
                        result=dict(books=result, added_ids=added),
                        created_at=now(),
                    )
                )
            outcome = dict(
                seed=SEED,
                sha256=digest,
                backup=backup,
                added=len(added),
                already_imported=bool(batch),
                books=result,
            )
            audit(
                s,
                "textbook.seed.verify" if batch else "textbook.seed.import",
                "textbook_seed",
                batch_id,
                None,
                outcome,
            )
        storage.journal("textbook.seed.completed", outcome)
        return outcome
