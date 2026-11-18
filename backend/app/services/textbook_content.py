"""正式教材题库的候选内容、幂等种子及教师集中审核。"""

import hashlib
import json
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import insert, select, update

from app.core import content_models as cm
from app.core import library_models as m
from app.core.library_schemas import QuestionInput, ReviewInput
from app.core.models import now
from app.services import library as lib
from app.services.classes import BusinessError, audit, transaction
from app.services.rich_content import document

SEED = (
    Path(__file__).resolve().parents[3]
    / "data-seeds/textbook-chemistry-content/content.json"
)


def digest(value):
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()


def profile(s, identity):
    row = (
        s.execute(select(cm.profiles).where(cm.profiles.c.point_id == identity))
        .mappings()
        .first()
    )
    return dict(row) if row else {}


def candidates(s, kind, identity):
    col = cm.candidates.c.point_id if kind == "point" else cm.candidates.c.question_id
    return [
        dict(x)
        for x in s.execute(select(cm.candidates).where(col == identity)).mappings()
    ]


def seed(storage, commit=False):
    from app.services.textbook_validation import validate

    data = json.loads(SEED.read_text())
    validation = validate(data)
    sha = digest(data)
    with transaction(storage) as s:
        # 只校验种子使用的真实永久ID、名称和父子关系，不改教师目录。
        for n in data["catalog"]:
            actual = lib.get(s, m.nodes, n["id"])
            if any(actual[k] != n[k] for k in ("name", "parent_id", "book_id")):
                raise BusinessError(
                    "教材目录身份或父子关系已变，停止种子导入以待重新映射"
                )
        existing = (
            s.execute(
                select(m.batches).where(
                    m.batches.c.kind == "textbook_seed",
                    m.batches.c.scope_id == data["seed_key"],
                )
            )
            .mappings()
            .first()
        )
        if existing:
            if existing["file_hash"] != sha:
                raise BusinessError("同版本种子内容已变，拒绝覆盖教师内容")
            for p in data["points"]:
                lib.visible_point(s, p["id"])
                for q in p["questions"]:
                    lib.visible_question(s, q["id"])
            return {
                "already_imported": True,
                "points": 64,
                "questions": 192,
                "sha256": sha,
                "validation": validation,
            }
        for p in data["points"]:
            if s.execute(
                select(m.points.c.id).where(
                    (m.points.c.id == p["id"])
                    | (
                        (m.points.c.subject_id == data["subject_id"])
                        & (m.points.c.code == p["code"])
                    )
                )
            ).first():
                raise BusinessError("种子知识点ID或编码冲突，拒绝覆盖")
            for q in p["questions"]:
                if s.execute(
                    select(m.questions.c.id).where(m.questions.c.id == q["id"])
                ).first():
                    raise BusinessError("种子题目ID冲突")
        preview = {
            "already_imported": False,
            "points": len(data["points"]),
            "questions": sum(len(p["questions"]) for p in data["points"]),
            "sha256": sha,
            "validation": validation,
        }
        if not commit:
            return preview
        for p in data["points"]:
            s.execute(
                insert(m.points).values(
                    id=p["id"],
                    subject_id=data["subject_id"],
                    name=p["name"],
                    code=p["code"],
                    description=p["definition"],
                    parent_id=None,
                    active=1,
                    review_status="pending",
                    data_space="textbook",
                )
            )
            s.execute(
                insert(cm.profiles).values(
                    point_id=p["id"],
                    requirements=p["requirements"],
                    mastery=p["mastery"],
                    difficulty_min=min(q["difficulty"] for q in p["questions"]),
                    difficulty_max=max(q["difficulty"] for q in p["questions"]),
                    source=p["source"] + " 范围：" + p["standard_scope"],
                    version=1,
                )
            )

            def candidate(kind, identity, nid, p=p):
                s.execute(
                    insert(cm.candidates).values(
                        id=uuid5(
                            NAMESPACE_URL, data["seed_key"] + kind + identity + nid
                        ).hex,
                        seed_key=data["seed_key"],
                        point_id=identity if kind == "point" else None,
                        question_id=identity if kind == "question" else None,
                        node_id=nid,
                        confidence=0.9 if nid == p["node_ids"][0] else 0.7,
                        reason=(
                            "按课题含义细分教学能力，待教师核对教材正文"
                            if nid == p["node_ids"][0]
                            else "复习/附录复用相关能力，非新增实体；待教师确认"
                        ),
                        status="pending",
                    )
                )

            for nid in p["node_ids"]:
                candidate("point", p["id"], nid)
            for q in p["questions"]:
                stem = q["prompt"]
                if q.get("options"):
                    stem += "\n" + "\n".join(
                        f"{chr(65 + i)}. {t}" for i, t in enumerate(q["options"])
                    )
                lib.save_question_in_session(
                    s,
                    QuestionInput(
                        subject_id=data["subject_id"],
                        grade="初中",
                        question_type=q["type"],
                        difficulty=q["difficulty"],
                        stem=document(stem),
                        answer=document(q["answer"]),
                        explanation=document(q["explanation"]),
                        source=p["source"] + " 原创编号：" + q["code"],
                        knowledge_links=[
                            {"knowledge_point_id": p["id"], "is_primary": True}
                        ],
                        node_ids=[],
                    ),
                    create_identity=q["id"],
                    source_kind="textbook_seed",
                    check_similarity=False,
                    initial_status="pending",
                )
                for nid in p["node_ids"]:
                    candidate("question", q["id"], nid)
        s.execute(
            insert(m.batches).values(
                id=lib.uid(),
                kind="textbook_seed",
                scope_id=data["seed_key"],
                file_hash=sha,
                result=preview,
                created_at=now(),
            )
        )
        audit(s, "textbook.seed", "seed", data["seed_key"], None, preview)
        return preview


def scope_nodes(s, node_id):
    return (
        lib.node_scope(s, node_id, True)
        if node_id
        else set(s.scalars(select(m.nodes.c.id)))
    )


def listing(storage, node_id="", status="pending"):
    with transaction(storage) as s:
        return listing_session(s, node_id, status)


def listing_session(s, node_id, status):
    nodes = scope_nodes(s, node_id)
    links = [
        dict(x)
        for x in s.execute(
            select(cm.candidates).where(cm.candidates.c.node_id.in_(nodes))
        ).mappings()
    ]
    pids = {x["point_id"] for x in links if x["point_id"]}
    qids = {x["question_id"] for x in links if x["question_id"]}
    points = []
    questions = []
    for identity in sorted(pids):
        p = lib.point_view(s, lib.visible_point(s, identity))
        if not status or p["review_status"] == status:
            points.append(p)
    for identity in sorted(qids):
        q = lib.question_view(s, identity)
        if not status or q["status"] == status:
            questions.append(q)
    return {
        "points": points,
        "questions": questions,
        "candidates": links,
        "scope": lib.path_of(s, node_id) if node_id else "全部教材候选内容",
    }


def selected_state(s, point_ids, question_ids, node_id):
    if (
        len(set(point_ids)) != len(point_ids)
        or len(set(question_ids)) != len(question_ids)
        or not point_ids
        and not question_ids
    ):
        raise BusinessError("请选择不重复的审核项目")
    if len(point_ids) + len(question_ids) > 1000:
        raise BusinessError("单批最多1000项")
    nodes = scope_nodes(s, node_id)
    items = []
    for kind, ids in [("point", point_ids), ("question", question_ids)]:
        for identity in ids:
            value = (
                lib.point_view(s, lib.visible_point(s, identity))
                if kind == "point"
                else lib.question_view(s, lib.visible_question(s, identity)["id"])
            )
            if value["review_status" if kind == "point" else "status"] != "pending":
                raise BusinessError("只可审核待审核内容；请刷新")
            links = [
                x
                for x in candidates(s, kind, identity)
                if x["node_id"] in nodes and x["status"] != "rejected"
            ]
            if not links:
                raise BusinessError("所选项目不在当前候选审核范围")
            items.append(
                {
                    "kind": kind,
                    "id": identity,
                    "value": value,
                    "candidate_ids": [x["id"] for x in links],
                    "fingerprint": digest(value),
                }
            )
    return items


def preview(storage, point_ids, question_ids, node_id, action, note):
    if action == "reject" and not note.strip():
        raise BusinessError("退回必须填写原因")
    with transaction(storage) as s:
        items = selected_state(s, point_ids, question_ids, node_id)
        payload = {
            "point_ids": point_ids,
            "question_ids": question_ids,
            "node_id": node_id,
            "action": action,
            "note": note,
            "items": items,
        }
        identity = lib.uid()
        s.execute(
            insert(cm.batches).values(
                id=identity, payload=payload, consumed=0, created_at=now()
            )
        )
        return {
            "batch_id": identity,
            "scope": lib.path_of(s, node_id) if node_id else "全部教材",
            "action": action,
            "point_count": len(point_ids),
            "question_count": len(question_ids),
            "items": items,
        }


def commit(storage, batch_id, confirmation):
    if confirmation != "确认本批审核":
        raise BusinessError("请明确确认本批审核")
    with transaction(storage) as s:
        batch = lib.get(s, cm.batches, batch_id)
        if batch["consumed"]:
            raise BusinessError("本批已经处理，请勿重复提交")
        p = batch["payload"]
        fresh = selected_state(s, p["point_ids"], p["question_ids"], p["node_id"])
        if digest(fresh) != digest(p["items"]):
            raise BusinessError("预览后内容或关联已变化，请重新预览")
        if p["action"] == "approve":
            for item in fresh:
                if item["kind"] == "question":
                    for link in item["value"]["knowledge_links"]:
                        point = lib.visible_point(s, link["knowledge_point_id"])
                        if (
                            point["review_status"] != "approved"
                            and point["id"] not in p["point_ids"]
                        ):
                            raise BusinessError("请同时审核关联知识点，或先批准知识点")
        for item in fresh:
            identity = item["id"]
            kind = item["kind"]
            before = item["value"]
            if kind == "point":
                status = "approved" if p["action"] == "approve" else "rejected"
                s.execute(
                    update(m.points)
                    .where(m.points.c.id == identity)
                    .values(review_status=status)
                )
                s.execute(
                    update(cm.profiles)
                    .where(cm.profiles.c.point_id == identity)
                    .values(version=cm.profiles.c.version + 1)
                )
            else:
                lib.review_in_session(
                    s,
                    identity,
                    ReviewInput(
                        action=p["action"],
                        expected_version=before["version"],
                        note=p["note"],
                    ),
                )
            for cid in item["candidate_ids"]:
                link = lib.get(s, cm.candidates, cid)
                s.execute(
                    update(cm.candidates)
                    .where(cm.candidates.c.id == cid)
                    .values(
                        status="approved" if p["action"] == "approve" else "rejected"
                    )
                )
                if p["action"] == "approve":
                    table = m.mappings if kind == "point" else m.qnodes
                    field = "knowledge_point_id" if kind == "point" else "question_id"
                    vals = dict(node_id=link["node_id"], **{field: identity})
                    if not s.execute(
                        select(table).where(
                            table.c.node_id == link["node_id"],
                            table.c[field] == identity,
                        )
                    ).first():
                        s.execute(insert(table).values(**vals))
            after = (
                lib.point_view(s, lib.visible_point(s, identity))
                if kind == "point"
                else lib.question_view(s, identity)
            )
            s.execute(
                insert(cm.reviews).values(
                    id=lib.uid(),
                    entity_kind=kind,
                    entity_id=identity,
                    action=p["action"],
                    note=p["note"],
                    batch_id=batch_id,
                    before=before,
                    after=after,
                    created_at=now(),
                )
            )
            audit(s, "content.review", kind, identity, before, after)
        s.execute(
            update(cm.batches).where(cm.batches.c.id == batch_id).values(consumed=1)
        )
        return {"processed": len(fresh), "action": p["action"]}
