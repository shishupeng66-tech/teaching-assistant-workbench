import hashlib
import io
import json
import re
from difflib import SequenceMatcher
from pathlib import Path
from uuid import UUID, uuid5
from fractions import Fraction
from PIL import Image
from sqlalchemy import select, insert, update
from app.core import library_models as m, taxonomy_models as t
from app.core.library_schemas import QuestionInput
from app.core.models import now
from app.services.classes import transaction, audit, BusinessError
from app.services.library import all_rows, get, save_question_in_session, node_usable
from app.services.question_assets import asset_directory
from app.services.rich_content import document
from app.services.textbook_seed import identity as node_identity

REPO = "https://github.com/xiaoyang111222/cn-math-taxonomy"
COMMIT = "aa2c22058222d0df404f1819e2fbdb97a62049ea"
DIRECTORY = Path(__file__).resolve().parents[3] / "data-seeds/cn-math-taxonomy"
NS = UUID("e8551ef0-8980-4e2a-a08a-40e934269afe")
DIFFICULTIES = {"basic": 1, "standard": 3, "advanced": 4, "challenge": 4}


def uid(key):
    return uuid5(NS, REPO + ":" + COMMIT + ":" + key).hex


def load(directory=DIRECTORY):
    directory = Path(directory)
    if (directory / "source.json").stat().st_size > 4_000_000:
        raise BusinessError("来源文件过大")
    data = json.loads((directory / "source.json").read_text())
    manifest = data["manifest"]
    if (
        manifest["repository"] != REPO
        or manifest["commit"] != COMMIT
        or manifest["license"] != "CC BY-NC 4.0"
    ):
        raise BusinessError("来源身份或许可不匹配")
    topics = data["topics"]
    ids = {p["id"] for p in topics}
    if len(ids) != len(topics) or any(
        not re.fullmatch(r"cnk_j\d+", p["id"]) or p.get("subject") != "chemistry"
        for p in topics
    ):
        raise BusinessError("知识点范围不合法")
    qids = set()
    for q in data["questions"]:
        if (
            q["id"] in qids
            or q["topicId"] not in ids
            or not q["id"].startswith(q["topicId"] + "_q")
            or not re.fullmatch(r"cnk_j\d+_q\d+", q["id"])
        ):
            raise BusinessError("题目来源ID或学科不合法")
        qids.add(q["id"])
    edges = set()
    graph = {i: [] for i in ids}
    for e in data["dependencies"]:
        pair = (e["topicId"], e["prerequisiteId"])
        if (
            any(i not in ids for i in pair)
            or pair in edges
            or e["strength"] not in ("hard", "soft")
        ):
            raise BusinessError("先修关系范围或重复错误")
        edges.add(pair)
        graph[pair[0]].append(pair[1])
    visiting = set()
    done = set()

    def visit(i):
        if i in visiting:
            raise BusinessError("先修关系形成循环")
        if i in done:
            return
        visiting.add(i)
        for p in graph[i]:
            visit(p)
        visiting.remove(i)
        done.add(i)

    for i in ids:
        visit(i)
    rules = json.loads((directory / "mapping-rules.json").read_text())
    for r in rules:
        if (
            r["topic_id"] not in ids
            or r.get("confirmed")
            or not 0 <= r["confidence"] <= 1
        ):
            raise BusinessError("映射规则非法或未经授权确认")
    return data, rules


def convert(q, subject_id, asset_id=None):
    if q["difficulty"] not in DIFFICULTIES:
        raise ValueError("未知难度")
    text = q["prompt"]
    if q["type"] == "choice":
        choices = q.get("choices", [])
        keys = [x["key"] for x in choices]
        if (
            keys != list("ABCD")[: len(keys)]
            or not 2 <= len(keys) <= 4
            or q["answer"] not in keys
            or len({x["text"] for x in choices}) != len(choices)
        ):
            raise ValueError("选项顺序、答案字母或重复选项无效")
        if any(x.get("figure") for x in choices):
            raise ValueError("选项图片格式待转换")
        text += "\n" + "\n".join(x["key"] + ". " + x["text"] for x in choices)
        answer = (
            q["answer"]
            + "："
            + next(x["text"] for x in choices if x["key"] == q["answer"])
        )
        kind = "单选题"
    elif q["type"] == "numeric":
        Fraction(q["answer"])
        answer = q["answer"]
        kind = "计算题"
    else:
        raise ValueError("尚不支持此题型，原始内容保留待处理")
    stem = document(text)
    if q.get("figure"):
        if not asset_id:
            raise ValueError("SVG尚未安全转换为PNG")
        stem["content"].append(
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "asset",
                        "attrs": {
                            "assetId": asset_id,
                            "alt": "来源诊断题示意图（已安全转PNG）",
                        },
                    }
                ],
            }
        )
    return QuestionInput(
        subject_id=subject_id,
        grade="初中",
        question_type=kind,
        difficulty=DIFFICULTIES[q["difficulty"]],
        stem=stem,
        answer=document(answer),
        explanation=document(q["explanation"]),
        source=f"{REPO} @ {COMMIT} / {q['id']}；CC BY-NC 4.0；xiaoyang111222及贡献者；上游AI生成，教师待审核；原始作答规则见知识图谱来源详情",
        knowledge_links=[{"knowledge_point_id": uid(q["topicId"]), "is_primary": True}],
    )


def preview(storage, directory=DIRECTORY):
    data, rules = load(directory)
    unsupported = []
    ready = []
    for q in data["questions"]:
        try:
            convert(q, "preview", uid("asset:" + q["id"]) if q.get("figure") else None)
            if q.get("figure"):
                image_file = Path(directory) / "images" / (q["id"] + ".png")
                expected = data["manifest"]["asset_hashes"].get(image_file.name)
                if (
                    image_file.is_symlink()
                    or not expected
                    or hashlib.sha256(image_file.read_bytes()).hexdigest() != expected
                ):
                    raise ValueError("PNG缺失或校验失败")
            ready.append(q["id"])
        except (ValueError, OSError, KeyError) as exc:
            unsupported.append({"id": q["id"], "reason": str(exc)})
    with transaction(storage) as s:
        points = all_rows(s, m.points)
        nodes = {n["id"]: n for n in all_rows(s, m.nodes)}
        synonyms = [
            dict(external_id=p["id"], local_id=x["id"], local_name=x["name"])
            for p in data["topics"]
            for x in points
            if not x["code"].startswith("cnk_j")
            and SequenceMatcher(None, p["name"], x["name"]).ratio() >= 0.7
        ]
        imported = [
            dict(r)
            for r in s.execute(
                select(t.items).where(t.items.c.source_id == uid("source"))
            ).mappings()
        ]
    proposals = [
        {
            **r,
            "node_id": node_identity(r["node_key"]),
            "available": node_identity(r["node_key"]) in nodes,
        }
        for r in rules
    ]
    if imported:
        g = graph(storage)
        mapped_items = {
            r["item_id"] for r in g["mappings"] if r["status"] != "rejected"
        }
        unmapped_ids = [
            p["external_id"] for p in g["points"] if p["id"] not in mapped_items
        ]
    else:
        unmapped_ids = [
            p["id"]
            for p in data["topics"]
            if not any(r["topic_id"] == p["id"] and r["available"] for r in proposals)
        ]
    return dict(
        repository=REPO,
        commit=COMMIT,
        license=data["manifest"]["license"],
        attribution=data["manifest"]["attribution"],
        topics=len(data["topics"]),
        questions=len(data["questions"]),
        dependencies=len(data["dependencies"]),
        hard=sum(e["strength"] == "hard" for e in data["dependencies"]),
        soft=sum(e["strength"] == "soft" for e in data["dependencies"]),
        images=sum(bool(q.get("figure")) for q in data["questions"]),
        ready=len(ready),
        unsupported=unsupported,
        synonyms=synonyms,
        suggested_mappings=proposals,
        unmapped=unmapped_ids,
        imported=len(imported),
    )


def import_data(storage, directory=DIRECTORY):
    data, rules = load(directory)
    report = preview(storage, directory)
    # Preserve an exact snapshot of both inputs; updates never overwrite this source version.
    digest = hashlib.sha256(
        json.dumps([data, rules], ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()
    created = []
    with storage.lock:
        backup = storage.backup()
        try:
            with transaction(storage) as s:
                existing = (
                    s.execute(select(t.sources).where(t.sources.c.id == uid("source")))
                    .mappings()
                    .first()
                )
                if existing:
                    if existing["manifest"].get("import_hash") != digest:
                        raise BusinessError("相同commit的数据已变化，拒绝覆盖")
                    return dict(
                        already_imported=True, added=0, backup=backup, preview=report
                    )
                subjects = list(
                    s.execute(
                        select(m.subjects).where(
                            m.subjects.c.name == "化学", m.subjects.c.active == 1
                        )
                    ).mappings()
                )
                if len(subjects) != 1:
                    raise BusinessError("化学学科不存在或存在歧义")
                sid = subjects[0]["id"]
                if any(
                    s.execute(
                        select(m.points.c.id).where(
                            m.points.c.code == p["id"], m.points.c.subject_id == sid
                        )
                    ).first()
                    for p in data["topics"]
                ):
                    raise BusinessError("来源编码与已有知识点冲突，拒绝覆盖")
                s.execute(
                    insert(t.sources).values(
                        id=uid("source"),
                        repository=REPO,
                        commit_sha=COMMIT,
                        license=data["manifest"]["license"],
                        attribution=data["manifest"]["attribution"],
                        manifest={**data["manifest"], "import_hash": digest},
                        created_at=now(),
                    )
                )

                def item(kind, key, payload, **extra):
                    rid = uid(kind + ":" + key)
                    s.execute(
                        insert(t.items).values(
                            id=rid,
                            source_id=uid("source"),
                            kind=kind,
                            external_id=key,
                            original_name=payload.get(
                                "name", payload.get("prompt", key)
                            ),
                            payload=payload,
                            review_status="pending",
                            processing_status="imported",
                            note="",
                            **extra,
                        )
                    )
                    return rid

                for p in data["topics"]:
                    s.execute(
                        insert(m.points).values(
                            id=uid(p["id"]),
                            subject_id=sid,
                            name=p["name"],
                            code=p["id"],
                            description=p["description"]
                            + "\n掌握标准（来源建议，教师待审核）：\n"
                            + "\n".join(p.get("mastery_criteria", []))
                            + "\n来源："
                            + REPO
                            + " @ "
                            + COMMIT
                            + "；CC BY-NC 4.0",
                            parent_id=None,
                            active=1,
                            review_status="pending",
                        )
                    )
                    item("point", p["id"], p, point_id=uid(p["id"]))
                for e in data["dependencies"]:
                    item(
                        "dependency",
                        e["prerequisiteId"] + "->" + e["topicId"],
                        e,
                        point_id=uid(e["topicId"]),
                        prerequisite_id=uid(e["prerequisiteId"]),
                    )
                unsupported = {r["id"]: r["reason"] for r in report["unsupported"]}
                qcount = 0
                for q in data["questions"]:
                    if q["id"] in unsupported:
                        rid = item("question", q["id"], q, point_id=uid(q["topicId"]))
                        s.execute(
                            update(t.items)
                            .where(t.items.c.id == rid)
                            .values(
                                processing_status="unsupported",
                                note=unsupported[q["id"]],
                            )
                        )
                        continue
                    aid = None
                    if q.get("figure"):
                        content = (
                            Path(directory) / "images" / (q["id"] + ".png")
                        ).read_bytes()
                        # Pillow validates and re-encodes; raw SVG is never served or executed.
                        with Image.open(io.BytesIO(content)) as img:
                            if (
                                img.format != "PNG"
                                or img.width * img.height > 4_000_000
                            ):
                                raise BusinessError("PNG图片格式或尺寸非法")
                            out = io.BytesIO()
                            img.convert("RGBA").save(out, format="PNG")
                            clean = out.getvalue()
                            w, h = img.size
                        aid = uid("asset:" + q["id"])
                        path = asset_directory(storage) / (aid + ".png")
                        with path.open("xb") as handle:
                            created.append(path)
                            handle.write(clean)
                        path.chmod(0o600)
                        s.execute(
                            insert(m.assets).values(
                                id=aid,
                                storage_name=path.name,
                                original_name=q["id"] + ".png",
                                mime="image/png",
                                size=len(clean),
                                sha256=hashlib.sha256(clean).hexdigest(),
                                width=w,
                                height=h,
                                created_at=now(),
                            )
                        )
                    body = convert(q, sid, aid)
                    local = save_question_in_session(
                        s,
                        body,
                        create_identity=uid(q["id"]),
                        source_kind="cn-math-taxonomy",
                        check_similarity=False,
                        initial_status="pending",
                    )
                    item(
                        "question",
                        q["id"],
                        q,
                        point_id=uid(q["topicId"]),
                        question_id=local["id"],
                    )
                    s.execute(
                        insert(m.reviews).values(
                            id=uid("review:" + q["id"]),
                            question_id=local["id"],
                            version=1,
                            action="import_pending",
                            before_status="draft",
                            after_status="pending",
                            note="开源AI生成题，未执行verify，等待教师逐题审核",
                            created_at=now(),
                        )
                    )
                    qcount += 1
                available = {x["id"] for x in all_rows(s, m.nodes)}
                for r in rules:
                    nid = node_identity(r["node_key"])
                    if nid not in available:
                        continue
                    if not node_usable(s, nid):
                        continue
                    s.execute(
                        insert(t.mappings).values(
                            id=uid("mapping:" + r["topic_id"] + ":" + nid),
                            item_id=uid("point:" + r["topic_id"]),
                            node_id=nid,
                            reason=r["reason"],
                            confidence=r["confidence"],
                            status="pending",
                        )
                    )
                result = dict(
                    already_imported=False,
                    points=len(data["topics"]),
                    questions=qcount,
                    dependencies=len(data["dependencies"]),
                    unsupported=report["unsupported"],
                    backup=backup,
                    commit=COMMIT,
                )
                audit(
                    s, "taxonomy.import", "taxonomy_source", uid("source"), None, result
                )
            storage.journal("taxonomy.imported", result)
            return result
        except Exception:
            for path in created:
                path.unlink(missing_ok=True)
            raise


def graph(storage):
    with transaction(storage) as s:
        records = all_rows(s, t.items)
        points = {p["id"]: p for p in all_rows(s, m.points)}
        questions = {q["id"]: q for q in all_rows(s, m.questions)}
        imported_points = []
        imported_questions = []
        for r in records:
            if r["kind"] == "point":
                imported_points.append(
                    {
                        **r,
                        "point": points.get(r["point_id"]),
                        "question_count": len(
                            list(
                                s.scalars(
                                    select(m.qkp.c.question_id).where(
                                        m.qkp.c.knowledge_point_id == r["point_id"]
                                    )
                                )
                            )
                        ),
                    }
                )
            elif r["kind"] == "question":
                q = questions.get(r["question_id"])
                imported_questions.append(
                    {
                        k: r[k]
                        for k in (
                            "id",
                            "external_id",
                            "point_id",
                            "question_id",
                            "processing_status",
                            "note",
                        )
                    }
                    | {
                        "name": r["original_name"],
                        "review_status": q["status"] if q else r["review_status"],
                    }
                )
        mapping_rows = all_rows(s, t.mappings)
        by_point = {r["point_id"]: r for r in records if r["kind"] == "point"}
        for link in all_rows(s, m.mappings):
            record = by_point.get(link["knowledge_point_id"])
            if not record:
                continue
            matched = next(
                (
                    r
                    for r in mapping_rows
                    if r["item_id"] == record["id"] and r["node_id"] == link["node_id"]
                ),
                None,
            )
            if matched:
                matched["status"] = "approved"
            else:
                mapping_rows.append(
                    dict(
                        id="manual:" + record["id"] + ":" + link["node_id"],
                        item_id=record["id"],
                        node_id=link["node_id"],
                        reason="教师在知识点主库手动关联",
                        confidence=1,
                        status="approved",
                    )
                )
        return dict(
            sources=all_rows(s, t.sources),
            points=imported_points,
            edges=[r for r in records if r["kind"] == "dependency"],
            mappings=mapping_rows,
            nodes=all_rows(s, m.nodes),
            questions=imported_questions,
        )


def source_item(storage, identity):
    with transaction(storage) as s:
        return get(s, t.items, identity)


def decide(storage, kind, identity, action):
    status = {"approve": "approved", "reject": "rejected"}[action]
    with transaction(storage) as s:
        table = t.mappings if kind == "mapping" else t.items
        old = get(s, table, identity)
        if (old["status"] if kind == "mapping" else old["review_status"]) != "pending":
            raise BusinessError("仅待审核记录可以确认或拒绝")
        if kind == "point":
            if old["kind"] != "point":
                raise BusinessError("不是知识点记录")
            s.execute(
                update(m.points)
                .where(m.points.c.id == old["point_id"])
                .values(review_status=status)
            )
        elif kind == "mapping":
            p = get(s, t.items, old["item_id"])
            point = get(s, m.points, p["point_id"])
            if action == "approve":
                if point["review_status"] != "approved":
                    raise BusinessError("请先审核知识点，再确认章节映射")
                if not node_usable(s, old["node_id"]):
                    raise BusinessError("章节已停用")
                # A suggestion becomes an official mapping only upon this explicit teacher action.
                if not s.execute(
                    select(m.mappings).where(
                        m.mappings.c.node_id == old["node_id"],
                        m.mappings.c.knowledge_point_id == p["point_id"],
                    )
                ).first():
                    s.execute(
                        insert(m.mappings).values(
                            node_id=old["node_id"], knowledge_point_id=p["point_id"]
                        )
                    )
        elif kind == "dependency":
            if old["kind"] != "dependency":
                raise BusinessError("不是先修关系")
            if action == "approve":
                if any(
                    get(s, m.points, x)["review_status"] != "approved"
                    for x in [old["point_id"], old["prerequisite_id"]]
                ):
                    raise BusinessError("请先审核关系两端的知识点")
                # Upstream topicId REQUIRES prerequisiteId; core source REQUIRES target.
                condition = (
                    (m.relations.c.source_id == old["point_id"])
                    & (m.relations.c.target_id == old["prerequisite_id"])
                    & (m.relations.c.kind == "prerequisite")
                )
                if not s.execute(select(m.relations).where(condition)).first():
                    s.execute(
                        insert(m.relations).values(
                            id=uid("relation:" + old["external_id"]),
                            source_id=old["point_id"],
                            target_id=old["prerequisite_id"],
                            kind="prerequisite",
                        )
                    )
        else:
            raise BusinessError("审核类型不支持")
        s.execute(
            update(table)
            .where(table.c.id == identity)
            .values(**{"status" if kind == "mapping" else "review_status": status})
        )
        audit(
            s, "taxonomy.review." + kind, kind, identity, old, get(s, table, identity)
        )
        return {"status": status}
