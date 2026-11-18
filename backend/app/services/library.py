import re
import unicodedata
from difflib import SequenceMatcher
from uuid import uuid4

from sqlalchemy import delete, func, insert, or_, select, update

from app.core import content_models as cm
from app.core import library_models as m
from app.core.library_schemas import QuestionInput
from app.core.models import now
from app.services.classes import BusinessError, audit, transaction
from app.services.rich_content import asset_ids, fingerprint, normalize, text_of

TABLES = {
    "subjects": m.subjects,
    "editions": m.editions,
    "books": m.books,
    "nodes": m.nodes,
}


def uid():
    return uuid4().hex


def get(s, table, identity):
    row = s.execute(select(table).where(table.c.id == identity)).mappings().first()
    if row is None:
        raise BusinessError("记录不存在或已经失效", 404)
    return dict(row)


def all_rows(s, table):
    return [dict(x) for x in s.execute(select(table)).mappings()]


def subject_of_node(s, node_id):
    node = get(s, m.nodes, node_id)
    book = get(s, m.books, node["book_id"])
    edition = get(s, m.editions, book["edition_id"])
    return edition["subject_id"]


def node_usable(s, identity):
    node = get(s, m.nodes, identity)
    book = get(s, m.books, node["book_id"])
    edition = get(s, m.editions, book["edition_id"])
    subject = get(s, m.subjects, edition["subject_id"])
    if not book["active"] or not edition["active"] or not subject["active"]:
        return False
    seen = set()
    while node:
        if not node["active"] or node["id"] in seen:
            return False
        seen.add(node["id"])
        node = get(s, m.nodes, node["parent_id"]) if node["parent_id"] else None
    return True


def ensure_subject(s, subject_id):
    subject = get(s, m.subjects, subject_id)
    if not subject["active"]:
        raise BusinessError("学科已停用")
    return subject


def parent_guard(s, table, parent_id, identity, scope_field, scope):
    seen = {identity}
    while parent_id:
        if parent_id in seen:
            raise BusinessError("父子关系不能形成循环")
        seen.add(parent_id)
        parent = get(s, table, parent_id)
        if parent[scope_field] != scope:
            raise BusinessError("父级必须属于相同学科或教材册别")
        parent_id = parent["parent_id"]
        if len(seen) > 30:
            raise BusinessError("目录层级过深")


def source_point_ids():
    from app.core.taxonomy_models import items

    return select(items.c.point_id).where(
        items.c.kind == "point", items.c.point_id.is_not(None)
    )


def source_question_ids():
    from app.core.taxonomy_models import items

    return select(items.c.question_id).where(
        items.c.kind == "question", items.c.question_id.is_not(None)
    )


def visible_point(s, identity):
    p = get(s, m.points, identity)
    if p.get("data_space") != "textbook" or identity in set(
        s.scalars(source_point_ids())
    ):
        raise BusinessError("来源知识点已移至独立化学空间", 410)
    return p


def visible_question(s, identity):
    q = get(s, m.questions, identity)
    from app.core.taxonomy_models import items

    if (
        q.get("data_space") != "textbook"
        or s.execute(select(items.c.id).where(items.c.question_id == identity)).first()
    ):
        raise BusinessError("来源题目已移至独立化学空间", 410)
    return q


def catalog(storage):
    with transaction(storage) as s:
        points = [
            dict(r)
            for r in s.execute(
                select(m.points).where(
                    m.points.c.data_space == "textbook",
                    m.points.c.id.not_in(source_point_ids()),
                )
            ).mappings()
        ]
        ids = {p["id"] for p in points}
        return {
            **{key: all_rows(s, table) for key, table in TABLES.items()},
            "points": [point_view(s, p) for p in points],
            "candidates": [
                dict(x)
                for x in s.execute(
                    select(cm.candidates).where(
                        cm.candidates.c.status.in_(["pending", "approved"])
                    )
                ).mappings()
            ],
            "relations": [
                r
                for r in all_rows(s, m.relations)
                if r["source_id"] in ids and r["target_id"] in ids
            ],
            "mappings": [
                r for r in all_rows(s, m.mappings) if r["knowledge_point_id"] in ids
            ],
        }


def save_catalog(storage, kind, body, identity=None):
    table = TABLES.get(kind)
    if table is None:
        raise BusinessError("目录类型无效", 422)
    with transaction(storage) as s:
        old = get(s, table, identity) if identity else None
        identity = identity or uid()
        d = body.model_dump()
        data = {"active": int(d["active"])}
        if kind == "subjects":
            if not d["name"] or not d["code"]:
                raise BusinessError("学科名称和编码必填", 422)
            data.update(name=d["name"], code=d["code"])
        elif kind == "editions":
            ensure_subject(s, d["subject_id"])
            if not d["name"]:
                raise BusinessError("教材版本名称必填", 422)
            data.update(
                subject_id=d["subject_id"], name=d["name"], description=d["description"]
            )
        elif kind == "books":
            edition = get(s, m.editions, d["edition_id"])
            if not edition["active"]:
                raise BusinessError("教材版本已停用")
            if not d["grade"] or not d["volume"]:
                raise BusinessError("年级与册别必填", 422)
            data.update(
                edition_id=d["edition_id"], grade=d["grade"], volume=d["volume"]
            )
        else:
            book = get(s, m.books, d["book_id"])
            if not book["active"]:
                raise BusinessError("教材册别已停用")
            if not d["name"]:
                raise BusinessError("目录名称必填", 422)
            if "/" in d["name"] or "|" in d["name"]:
                raise BusinessError(
                    "目录名称不能含路径分隔符 / 或 |，请使用其他标点", 422
                )
            parent_guard(s, m.nodes, d["parent_id"], identity, "book_id", d["book_id"])
            data.update(
                book_id=d["book_id"],
                parent_id=d["parent_id"],
                name=d["name"],
                kind=d["kind"],
                position=d["position"],
                description=d["description"],
            )
        for scope in ("subject_id", "edition_id", "book_id"):
            if old and scope in data and data[scope] != old[scope]:
                raise BusinessError(
                    "不能跨学科或册别移动实体，请新建并手动关联，原数据会保留"
                )
        if old:
            s.execute(update(table).where(table.c.id == identity).values(**data))
        else:
            s.execute(insert(table).values(id=identity, **data))
        result = get(s, table, identity)
        audit(s, "library." + kind + ".save", kind, identity, old, result)
        return result


def reorder_node(storage, identity, direction):
    if direction not in ("up", "down"):
        raise BusinessError("排序方向无效", 422)
    with transaction(storage) as s:
        node = get(s, m.nodes, identity)
        siblings = list(
            s.execute(
                select(m.nodes)
                .where(
                    m.nodes.c.book_id == node["book_id"],
                    m.nodes.c.parent_id == node["parent_id"],
                )
                .order_by(m.nodes.c.position, m.nodes.c.id)
            ).mappings()
        )
        ids = [n["id"] for n in siblings]
        index = ids.index(identity)
        target = index + (-1 if direction == "up" else 1)
        if 0 <= target < len(ids):
            ids[index], ids[target] = ids[target], ids[index]
        for index, node_id in enumerate(ids):
            s.execute(
                update(m.nodes)
                .where(m.nodes.c.id == node_id)
                .values(position=(index + 1) * 10)
            )
        audit(
            s,
            "curriculum.reorder",
            "node",
            identity,
            [dict(n) for n in siblings],
            {"ordered_ids": ids},
        )
        return {"ordered_ids": ids}


def point_view(s, point):
    identity = point["id"]
    rels = all_rows(s, m.relations)
    from app.services.textbook_content import candidates, profile

    extra = profile(s, identity)
    return {
        "teaching_requirements": extra.get("requirements", ""),
        "mastery_criteria": extra.get("mastery", []),
        "difficulty_min": extra.get("difficulty_min", 1),
        "difficulty_max": extra.get("difficulty_max", 5),
        "content_source": extra.get("source", ""),
        "profile_version": extra.get("version"),
        "candidates": candidates(s, "point", identity),
        "content_reviews": [
            dict(x)
            for x in s.execute(
                select(cm.reviews).where(
                    cm.reviews.c.entity_kind == "point",
                    cm.reviews.c.entity_id == identity,
                )
            ).mappings()
        ],
        **point,
        "prerequisite_ids": [
            x["target_id"]
            for x in rels
            if x["source_id"] == identity and x["kind"] == "prerequisite"
        ],
        "related_ids": [
            x["target_id"] if x["source_id"] == identity else x["source_id"]
            for x in rels
            if x["kind"] == "related" and identity in (x["source_id"], x["target_id"])
        ],
        "node_ids": list(
            s.scalars(
                select(m.mappings.c.node_id).where(
                    m.mappings.c.knowledge_point_id == identity
                )
            )
        ),
    }


def save_point(storage, body, identity=None):
    with transaction(storage) as s:
        ensure_subject(s, body.subject_id)
        old = visible_point(s, identity) if identity else None
        identity = identity or uid()
        if old and old["subject_id"] != body.subject_id:
            raise BusinessError("知识点不能跨学科移动，永久 ID 与已有题目关联保持")
        before = point_view(s, old) if old else None
        if body.parent_id:
            visible_point(s, body.parent_id)
        parent_guard(
            s, m.points, body.parent_id, identity, "subject_id", body.subject_id
        )
        extras = {
            "teaching_requirements",
            "mastery_criteria",
            "difficulty_min",
            "difficulty_max",
            "content_source",
            "expected_version",
        }
        data = body.model_dump(
            exclude={"prerequisite_ids", "related_ids", "node_ids"} | extras
        )
        from app.services.textbook_content import profile

        old_profile = profile(s, identity)
        if old_profile and body.expected_version != old_profile["version"]:
            raise BusinessError("知识点版本已变化，请刷新")
        if body.difficulty_min > body.difficulty_max:
            raise BusinessError("难度范围无效")
        if old_profile:
            data["review_status"] = "pending"

        data["active"] = int(data["active"])
        if old:
            s.execute(update(m.points).where(m.points.c.id == identity).values(**data))
        else:
            s.execute(insert(m.points).values(id=identity, **data))
        for key in ("prerequisite_ids", "related_ids", "node_ids"):
            ids = getattr(body, key)
            if len(ids) != len(set(ids)):
                raise BusinessError("关联不能重复")
        s.execute(
            delete(m.relations).where(
                or_(
                    m.relations.c.source_id == identity,
                    (m.relations.c.target_id == identity)
                    & (m.relations.c.kind == "related"),
                )
            )
        )
        for kind, ids in (
            ("prerequisite", body.prerequisite_ids),
            ("related", body.related_ids),
        ):
            for other_id in ids:
                other = visible_point(s, other_id)
                if identity == other_id or other["subject_id"] != body.subject_id:
                    raise BusinessError("知识点不能关联自身或其他学科")
                source, target = (
                    sorted([identity, other_id])
                    if kind == "related"
                    else (identity, other_id)
                )
                if kind == "prerequisite":
                    edges = all_rows(s, m.relations)
                    pending = [other_id]
                    seen = set()
                    while pending:
                        current = pending.pop()
                        if current == identity:
                            raise BusinessError("前置知识点不能形成循环")
                        if current in seen:
                            continue
                        seen.add(current)
                        pending.extend(
                            x["target_id"]
                            for x in edges
                            if x["source_id"] == current and x["kind"] == "prerequisite"
                        )
                s.execute(
                    insert(m.relations).values(
                        id=uid(), source_id=source, target_id=target, kind=kind
                    )
                )
        s.execute(delete(m.mappings).where(m.mappings.c.knowledge_point_id == identity))
        for node_id in body.node_ids:
            if subject_of_node(s, node_id) != body.subject_id:
                raise BusinessError("教材映射必须属于同一学科")
            if not node_usable(s, node_id) and node_id not in (
                before["node_ids"] if before else []
            ):
                raise BusinessError("目录或其上级已停用，不能新增映射")
            s.execute(
                insert(m.mappings).values(node_id=node_id, knowledge_point_id=identity)
            )
        if old_profile or body.teaching_requirements or body.mastery_criteria:
            values = {
                "requirements": body.teaching_requirements,
                "mastery": body.mastery_criteria,
                "difficulty_min": body.difficulty_min,
                "difficulty_max": body.difficulty_max,
                "source": body.content_source,
                "version": old_profile.get("version", 0) + 1,
            }
            if old_profile:
                s.execute(
                    update(cm.profiles)
                    .where(cm.profiles.c.point_id == identity)
                    .values(**values)
                )
            else:
                s.execute(insert(cm.profiles).values(point_id=identity, **values))
            if old_profile:
                s.execute(
                    update(cm.candidates)
                    .where(cm.candidates.c.point_id == identity)
                    .values(status="pending")
                )
        result = point_view(s, get(s, m.points, identity))
        audit(s, "knowledge.save", "knowledge_point", identity, before, result)
        return result


def get_point(storage, identity):
    with transaction(storage) as s:
        return point_view(s, visible_point(s, identity))


def map_node(storage, node_id, point_ids):
    with transaction(storage) as s:
        get(s, m.nodes, node_id)
        subject = subject_of_node(s, node_id)
        if not node_usable(s, node_id):
            current = set(
                s.scalars(
                    select(m.mappings.c.knowledge_point_id).where(
                        m.mappings.c.node_id == node_id
                    )
                )
            )
            if set(point_ids) - current:
                raise BusinessError("目录或其上级已停用，不能新增关联")
        if len(point_ids) != len(set(point_ids)):
            raise BusinessError("知识点关联重复")
        before = list(
            s.scalars(
                select(m.mappings.c.knowledge_point_id).where(
                    m.mappings.c.node_id == node_id
                )
            )
        )
        for point_id in point_ids:
            point = visible_point(s, point_id)
            if point["subject_id"] != subject:
                raise BusinessError("不能关联其他学科知识点")
            if not point["active"] and point_id not in before:
                raise BusinessError("不能新增已停用知识点关联")
        s.execute(delete(m.mappings).where(m.mappings.c.node_id == node_id))
        for point_id in point_ids:
            s.execute(
                insert(m.mappings).values(node_id=node_id, knowledge_point_id=point_id)
            )
        audit(s, "curriculum.knowledge_mapping", "node", node_id, before, point_ids)
        return {"knowledge_point_ids": point_ids}


def node_scope(s, node_id, descendants=False):
    node = get(s, m.nodes, node_id)
    ids = {node_id}
    if descendants:
        nodes = list(
            s.execute(
                select(m.nodes.c.id, m.nodes.c.parent_id).where(
                    m.nodes.c.book_id == node["book_id"]
                )
            ).mappings()
        )
        changed = True
        while changed:
            extra = {n["id"] for n in nodes if n["parent_id"] in ids} - ids
            changed = bool(extra)
            ids.update(extra)
    return ids


def path_of(s, node_id):
    names = []
    seen = set()
    while node_id:
        if node_id in seen:
            raise BusinessError("目录包含循环")
        seen.add(node_id)
        node = get(s, m.nodes, node_id)
        names.append(node["name"])
        node_id = node["parent_id"]
    return "/".join(reversed(names))


def text_similarity(left, right):
    if not left or not right:
        return 0.0
    if min(len(left), len(right)) < 3:
        return SequenceMatcher(None, left, right).ratio()
    a = {left[i : i + 3] for i in range(len(left) - 2)}
    b = {right[i : i + 3] for i in range(len(right) - 2)}
    return 2 * len(a & b) / (len(a) + len(b))


def duplicate_candidates(s, subject_id, stem, exclude_id=None):
    normalized = normalize(stem)
    if not normalized:
        return []
    candidates = []
    query = select(
        m.questions.c.id,
        m.questions.c.normalized_text,
        m.questions.c.question_type,
        m.questions.c.status,
    ).where(
        m.questions.c.subject_id == subject_id,
        m.questions.c.data_space == "textbook",
        m.questions.c.id.not_in(source_question_ids()),
    )
    if exclude_id:
        query = query.where(m.questions.c.id != exclude_id)
    for row in s.execute(query).mappings():
        # Bound worst-case pair cost; long stems also get exact normalized comparison.
        existing = row["normalized_text"]
        ratio = 1.0 if normalized == existing else text_similarity(normalized, existing)
        if ratio >= 0.75:
            candidates.append(
                {
                    "id": row["id"],
                    "similarity": round(ratio, 3),
                    "summary": existing[:110],
                    "question_type": row["question_type"],
                    "status": row["status"],
                }
            )
    return sorted(candidates, key=lambda x: (-x["similarity"], x["id"]))[:8]


def duplicates(storage, subject_id, stem, exclude_id=None):
    with transaction(storage) as s:
        get(s, m.subjects, subject_id)
        return {"items": duplicate_candidates(s, subject_id, stem, exclude_id)}


def question_view(s, identity, history=False):
    q = get(s, m.questions, identity)
    from app.services.textbook_content import candidates

    q["candidates"] = candidates(s, "question", identity)
    q["knowledge_links"] = [
        dict(x)
        for x in s.execute(
            select(m.qkp).where(m.qkp.c.question_id == identity)
        ).mappings()
    ]
    q["node_ids"] = list(
        s.scalars(select(m.qnodes.c.node_id).where(m.qnodes.c.question_id == identity))
    )
    q["asset_ids"] = list(
        s.scalars(select(m.alinks.c.asset_id).where(m.alinks.c.question_id == identity))
    )
    if history:
        q["revisions"] = [
            dict(x)
            for x in s.execute(
                select(m.revisions)
                .where(m.revisions.c.question_id == identity)
                .order_by(m.revisions.c.version.desc())
            ).mappings()
        ]
        q["reviews"] = [
            dict(x)
            for x in s.execute(
                select(m.reviews)
                .where(m.reviews.c.question_id == identity)
                .order_by(m.reviews.c.created_at.desc())
            ).mappings()
        ]
        q["chapter_references"] = [
            {
                "id": nid,
                "path": path_of(s, nid),
                "book_id": get(s, m.nodes, nid)["book_id"],
            }
            for nid in q["node_ids"]
        ]
    return q


def save_question_in_session(
    s,
    body,
    identity=None,
    source_kind="manual",
    check_similarity=True,
    initial_status="draft",
    create_identity=None,
):
    ensure_subject(s, body.subject_id)
    old = question_view(s, identity) if identity else None
    identity = identity or create_identity or uid()
    if (
        create_identity
        and s.execute(
            select(m.questions.c.id).where(m.questions.c.id == create_identity)
        ).first()
    ):
        raise BusinessError("导入题目ID已存在，拒绝覆盖")
    if initial_status not in ("draft", "pending"):
        raise BusinessError("新题目只能为草稿或待审核")
    if old:
        if old["status"] == "archived":
            raise BusinessError("归档题目只读")
        if old["subject_id"] != body.subject_id:
            raise BusinessError("不能修改题目所属学科，避免破坏已有版本关联")
        if body.expected_version != old["version"]:
            raise BusinessError("题目已被其他操作修改，请重新载入")
    if not normalize(body.stem):
        raise BusinessError("题干不能为空", 422)
    if check_similarity:
        similar = duplicate_candidates(
            s, body.subject_id, body.stem, identity if old else None
        )
        if similar and not body.confirm_similarity:
            raise BusinessError(
                "检测到相似题，请核对后明确确认保存独立题目",
                409,
                {"similar_questions": similar},
            )
    else:
        similar = []
    links = body.knowledge_links
    point_ids = [x.knowledge_point_id for x in links]
    if len(point_ids) != len(set(point_ids)) or sum(x.is_primary for x in links) > 1:
        raise BusinessError("知识点重复，或设置了多个主要知识点")
    if len(body.node_ids) != len(set(body.node_ids)):
        raise BusinessError("章节关联重复")
    part_refs = [p.ref for p in body.parts]
    if len(part_refs) != len(set(part_refs)):
        raise BusinessError("小问引用编码不能重复")
    previous_points = (
        {x["knowledge_point_id"] for x in old["knowledge_links"]} if old else set()
    )
    for link in links:
        point = (
            get(s, m.points, link.knowledge_point_id)
            if source_kind == "cn-math-taxonomy"
            else visible_point(s, link.knowledge_point_id)
        )
        if point["subject_id"] != body.subject_id:
            raise BusinessError("题目知识点必须属于相同学科")
        if not point["active"] and point["id"] not in previous_points:
            raise BusinessError("不能新增已停用知识点")
        if any(ref not in part_refs for ref in link.part_refs):
            raise BusinessError("知识点引用了不存在的小问编码")
    for node_id in body.node_ids:
        get(s, m.nodes, node_id)
        if subject_of_node(s, node_id) != body.subject_id:
            raise BusinessError("题目与章节学科不一致")
        if not node_usable(s, node_id) and node_id not in (
            old["node_ids"] if old else []
        ):
            raise BusinessError("不能新增已停用章节关联")
    assets = asset_ids(body.stem) | asset_ids(body.answer) | asset_ids(body.explanation)
    for part in body.parts:
        assets.update(asset_ids(part.rubric))
    for asset_id in assets:
        get(s, m.assets, asset_id)
    stamp = now()
    version = (old["version"] + 1) if old else 1
    data = {
        key: getattr(body, key)
        for key in (
            "subject_id",
            "grade",
            "question_type",
            "difficulty",
            "stem",
            "answer",
            "explanation",
            "source",
        )
    }
    data.update(
        parts=[p.model_dump() for p in body.parts],
        source_kind=old["source_kind"] if old else source_kind,
        status="draft" if old else initial_status,
        version=version,
        normalized_text=normalize(body.stem),
        fingerprint=fingerprint(body.stem),
        updated_at=stamp,
    )
    if old:
        s.execute(
            update(m.questions).where(m.questions.c.id == identity).values(**data)
        )
        s.execute(
            update(cm.candidates)
            .where(cm.candidates.c.question_id == identity)
            .values(status="pending")
        )
    else:
        s.execute(insert(m.questions).values(id=identity, created_at=stamp, **data))
    for table in (m.qkp, m.qnodes, m.alinks):
        s.execute(delete(table).where(table.c.question_id == identity))
    for index, link in enumerate(links):
        row = link.model_dump()
        row["is_primary"] = int(
            link.is_primary or (index == 0 and not any(x.is_primary for x in links))
        )
        s.execute(insert(m.qkp).values(question_id=identity, **row))
    for nid in body.node_ids:
        s.execute(insert(m.qnodes).values(question_id=identity, node_id=nid))
    for aid in assets:
        s.execute(insert(m.alinks).values(question_id=identity, asset_id=aid))
    result = question_view(s, identity)
    reason = (
        "编辑后退回草稿"
        if old
        else ("教师录入" if source_kind == "manual" else "批量导入草稿")
    )
    snapshot = {
        **result,
        "similarity_confirmed": bool(similar and body.confirm_similarity),
    }
    s.execute(
        insert(m.revisions).values(
            id=uid(),
            question_id=identity,
            version=version,
            snapshot=snapshot,
            reason=reason,
            created_at=stamp,
        )
    )
    audit(s, "question.save", "question", identity, old, result)
    return result


def save_question(storage, body, identity=None):
    with transaction(storage) as s:
        if identity:
            visible_question(s, identity)
        return save_question_in_session(s, body, identity)


def detail(storage, identity):
    with transaction(storage) as s:
        visible_question(s, identity)
        return question_view(s, identity, True)


def review(storage, identity, body):
    with transaction(storage) as s:
        return review_in_session(s, identity, body)


def review_in_session(s, identity, body):
    visible_question(s, identity)
    old = question_view(s, identity)
    if old["version"] != body.expected_version:
        raise BusinessError("题目版本已变化，请刷新后再审核")
    if old["status"] == "archived":
        raise BusinessError("归档题目只读")
    target = {
        "submit": "pending",
        "approve": "approved",
        "reject": "draft",
        "archive": "archived",
        "draft": "draft",
    }[body.action]
    if body.action in ("approve", "reject") and old["status"] != "pending":
        raise BusinessError("仅待审核题目可执行通过或退回")
    if body.action == "submit" and old["status"] != "draft":
        raise BusinessError("仅草稿可提交审核")
    if body.action in ("submit", "approve") and not normalize(old["answer"]):
        raise BusinessError("提交或通过审核前请填写标准答案")
    if body.action == "reject" and not body.note.strip():
        raise BusinessError("退回审核须说明原因", 422)
    if body.action == "approve":
        for link in old["knowledge_links"]:
            if (
                visible_point(s, link["knowledge_point_id"])["review_status"]
                != "approved"
            ):
                raise BusinessError("关联知识点仍待审核，请先审核知识点")
    if body.action == "submit":
        s.execute(
            update(cm.candidates)
            .where(cm.candidates.c.question_id == identity)
            .values(status="pending")
        )
    version = old["version"] + 1
    stamp = now()
    s.execute(
        update(m.questions)
        .where(m.questions.c.id == identity)
        .values(status=target, version=version, updated_at=stamp)
    )
    result = question_view(s, identity)
    s.execute(
        insert(m.revisions).values(
            id=uid(),
            question_id=identity,
            version=version,
            snapshot=result,
            reason="审核操作：" + body.action,
            created_at=stamp,
        )
    )
    s.execute(
        insert(m.reviews).values(
            id=uid(),
            question_id=identity,
            version=version,
            action=body.action,
            before_status=old["status"],
            after_status=target,
            note=body.note,
            created_at=stamp,
        )
    )
    audit(s, "question.review", "question", identity, old, result)
    return result


def filtered_query(s, filters):
    q = select(m.questions.c.id).where(
        m.questions.c.data_space == "textbook",
        m.questions.c.id.not_in(source_question_ids()),
    )
    for key in ("subject_id", "grade", "question_type", "difficulty", "status"):
        if filters.get(key) not in (None, ""):
            q = q.where(m.questions.c[key] == filters[key])
    if filters.get("q"):
        q = q.where(
            m.questions.c.normalized_text.contains(
                re.sub(
                    r"[\W_]+",
                    "",
                    unicodedata.normalize("NFKC", filters["q"]).casefold(),
                ),
                autoescape=True,
            )
        )
    if filters.get("knowledge_point_id"):
        q = q.where(
            m.questions.c.id.in_(
                select(m.qkp.c.question_id).where(
                    m.qkp.c.knowledge_point_id == filters["knowledge_point_id"]
                )
            )
        )
    if filters.get("node_id"):
        ids = node_scope(s, filters["node_id"], filters.get("descendants", False))
        q = q.where(
            m.questions.c.id.in_(
                select(m.qnodes.c.question_id)
                .where(m.qnodes.c.node_id.in_(ids))
                .union(
                    select(cm.candidates.c.question_id).where(
                        cm.candidates.c.node_id.in_(ids),
                        cm.candidates.c.question_id.is_not(None),
                        cm.candidates.c.status.in_(["pending", "approved"]),
                    )
                )
            )
        )
    return q


def list_questions(storage, filters, page=1, page_size=20):
    with transaction(storage) as s:
        query = filtered_query(s, filters)
        total = s.scalar(select(func.count()).select_from(query.subquery()))
        # Only the requested page includes content. Full revisions are loaded on detail only.
        rows = list(
            s.execute(
                select(m.questions)
                .where(m.questions.c.id.in_(query))
                .order_by(m.questions.c.updated_at.desc(), m.questions.c.id)
                .offset((page - 1) * page_size)
                .limit(page_size)
            ).mappings()
        )
        items = []
        for row in rows:
            items.append(
                {
                    "id": row["id"],
                    "subject_id": row["subject_id"],
                    "grade": row["grade"],
                    "question_type": row["question_type"],
                    "difficulty": row["difficulty"],
                    "status": row["status"],
                    "version": row["version"],
                    "summary": text_of(row["stem"])[:240],
                    "stem": row["stem"],
                    "answer": row["answer"],
                    "explanation": row["explanation"],
                    "updated_at": row["updated_at"],
                    "knowledge_links": [
                        dict(x)
                        for x in s.execute(
                            select(m.qkp).where(m.qkp.c.question_id == row["id"])
                        ).mappings()
                    ],
                }
            )
        return {"items": items, "total": total, "page": page, "page_size": page_size}


def statistics(storage, filters):
    with transaction(storage) as s:
        ids = filtered_query(s, filters)

        def grouped(column):
            return {
                str(k): v
                for k, v in s.execute(
                    select(column, func.count())
                    .where(m.questions.c.id.in_(ids))
                    .group_by(column)
                )
            }

        counts = grouped(m.questions.c.status)
        point_query = select(m.points.c.id).where(
            m.points.c.active == 1,
            m.points.c.data_space == "textbook",
            m.points.c.id.not_in(source_point_ids()),
        )
        if filters.get("subject_id"):
            point_query = point_query.where(
                m.points.c.subject_id == filters["subject_id"]
            )
        if filters.get("node_id"):
            nodes = node_scope(s, filters["node_id"], filters.get("descendants", False))
            point_query = point_query.where(
                m.points.c.id.in_(
                    select(m.mappings.c.knowledge_point_id)
                    .where(m.mappings.c.node_id.in_(nodes))
                    .union(
                        select(cm.candidates.c.point_id).where(
                            cm.candidates.c.node_id.in_(nodes),
                            cm.candidates.c.point_id.is_not(None),
                            cm.candidates.c.status.in_(["pending", "approved"]),
                        )
                    )
                )
            )
        point_ids = set(s.scalars(point_query))
        covered = set(
            s.scalars(
                select(m.qkp.c.knowledge_point_id).where(m.qkp.c.question_id.in_(ids))
            )
        )
        return {
            "total": sum(counts.values()),
            "approved": counts.get("approved", 0),
            "statuses": counts,
            "types": grouped(m.questions.c.question_type),
            "difficulties": grouped(m.questions.c.difficulty),
            "subjects": grouped(m.questions.c.subject_id),
            "knowledge_total": len(point_ids),
            "knowledge_approved": s.scalar(
                select(func.count())
                .select_from(m.points)
                .where(
                    m.points.c.id.in_(point_ids), m.points.c.review_status == "approved"
                )
            ),
            "knowledge_pending": s.scalar(
                select(func.count())
                .select_from(m.points)
                .where(
                    m.points.c.id.in_(point_ids), m.points.c.review_status == "pending"
                )
            ),
            "knowledge_covered": len(point_ids & covered),
            "unmapped_questions": s.scalar(
                select(func.count())
                .select_from(m.questions)
                .where(
                    m.questions.c.id.in_(ids),
                    ~m.questions.c.id.in_(select(m.qkp.c.question_id)),
                )
            ),
        }


def link_existing(storage, node_id, question_id):
    with transaction(storage) as s:
        get(s, m.nodes, node_id)
        visible_question(s, question_id)
        q = question_view(s, question_id)
        if not node_usable(s, node_id) or q["status"] == "archived":
            raise BusinessError("停用目录或归档题目不能新增关联")
        if subject_of_node(s, node_id) != q["subject_id"]:
            raise BusinessError("章节与题目学科不一致")
        if node_id in q["node_ids"]:
            return {"linked": True, "already_linked": True}
        body = QuestionInput(
            **{
                key: q[key]
                for key in (
                    "subject_id",
                    "grade",
                    "question_type",
                    "difficulty",
                    "stem",
                    "answer",
                    "explanation",
                    "source",
                    "parts",
                )
            },
            knowledge_links=[
                {k: v for k, v in link.items() if k != "question_id"}
                for link in q["knowledge_links"]
            ],
            node_ids=q["node_ids"] + [node_id],
            expected_version=q["version"],
            confirm_similarity=True,
        )
        # Chapter organization change is versioned and requires re-review like other edits.
        save_question_in_session(s, body, question_id)
        return {"linked": True, "already_linked": False}
