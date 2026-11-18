import io
import json
import re
import hashlib
import unicodedata
from fractions import Fraction
from uuid import uuid4
from pathlib import Path
from PIL import Image
from app.services.classes import BusinessError
from app.services.chemistry_store import dumps, utc
from app.services import taxonomy
from app.services.rich_content import document, validate_document, text_of, asset_ids
from app.services.chemistry_transfer import transfer
from sqlalchemy import select
from app.core import taxonomy_models as tm


def row(c, table, identity):
    if table not in ("points", "questions", "edges", "sessions"):
        raise BusinessError("类型无效")
    r = c.execute(f"SELECT * FROM {table} WHERE id=?", (identity,)).fetchone()
    if not r:
        raise BusinessError("独立空间记录不存在", 404)
    return dict(r)


def log(c, action, identity, before, after):
    c.execute(
        "INSERT INTO audit VALUES (?,?,?,?,?,?)",
        (
            uuid4().hex,
            action,
            identity,
            dumps(before) if before is not None else None,
            dumps(after),
            utc(),
        ),
    )


def overview(store):
    with store.transaction() as c:
        points = []
        for r in c.execute("SELECT * FROM points ORDER BY external_id"):
            raw = json.loads(r["raw"])
            data = json.loads(r["data"])
            points.append(
                dict(
                    id=r["id"],
                    external_id=r["external_id"],
                    name=data["name"],
                    description=data.get("description", raw.get("description", "")),
                    mastery=raw.get("mastery_criteria", []),
                    status=r["status"],
                    question_count=c.execute(
                        "SELECT count(*) FROM questions WHERE point_id=?", (r["id"],)
                    ).fetchone()[0],
                    source=raw,
                )
            )
        edges = [
            dict(r)
            for r in c.execute(
                "SELECT id,topic_id,prerequisite_id,strength,reason,status FROM edges ORDER BY id"
            )
        ]
        return dict(
            points=points,
            edges=edges,
            question_total=c.execute("SELECT count(*) FROM questions").fetchone()[0],
            approved_questions=c.execute(
                "SELECT count(*) FROM questions WHERE status='approved'"
            ).fetchone()[0],
            approved_points=sum(p["status"] == "approved" for p in points),
            assets=c.execute("SELECT count(*) FROM question_assets").fetchone()[0],
        )


def initialize_source(store):
    store.ensure()
    with store.transaction() as c:
        if c.execute("SELECT count(*) FROM points").fetchone()[0]:
            return dict(already_imported=True, added=0)
    with store.main.lock:
        with store.main.engine.connect() as con:
            legacy = con.execute(
                select(tm.items.c.id).where(tm.items.c.kind == "point")
            ).first()
        if legacy:
            return transfer(store.main, store)
    # Fresh installation: import directly into this database, never via main-library tables.
    data, _ = taxonomy.load()
    backup = store.backup()
    created = []
    try:
        with store.transaction() as c:
            for p in data["topics"]:
                point = dict(
                    id=taxonomy.uid(p["id"]),
                    name=p["name"],
                    description=p["description"],
                )
                c.execute(
                    "INSERT INTO points VALUES (?,?,?,?,?,?)",
                    (point["id"], p["id"], dumps(point), dumps(p), "pending", 1),
                )
            for q in data["questions"]:
                aid = None
                if q.get("figure"):
                    path = taxonomy.DIRECTORY / "images" / (q["id"] + ".png")
                    content = path.read_bytes()
                    if (
                        path.is_symlink()
                        or hashlib.sha256(content).hexdigest()
                        != data["manifest"]["asset_hashes"][path.name]
                    ):
                        raise BusinessError("源图片校验失败")
                    with Image.open(io.BytesIO(content)) as image:
                        out = io.BytesIO()
                        image.convert("RGBA").save(out, format="PNG")
                        clean = out.getvalue()
                        w, h = image.size
                    aid = taxonomy.uid("asset:" + q["id"])
                    target = store.assets / (aid + ".png")
                    with target.open("xb") as f:
                        created.append(target)
                        f.write(clean)
                    target.chmod(0o600)
                    c.execute(
                        "INSERT INTO question_assets VALUES (?,?,?,?,?,?,?,?,?)",
                        (
                            aid,
                            target.name,
                            path.name,
                            "image/png",
                            len(clean),
                            hashlib.sha256(clean).hexdigest(),
                            w,
                            h,
                            utc(),
                        ),
                    )
                body = taxonomy.convert(q, "independent-chemistry", aid).model_dump()
                qid = taxonomy.uid(q["id"])
                body.update(id=qid, status="pending", version=1)
                c.execute(
                    "INSERT INTO questions VALUES (?,?,?,?,?,?,?)",
                    (
                        qid,
                        q["id"],
                        taxonomy.uid(q["topicId"]),
                        dumps(body),
                        dumps(q),
                        "pending",
                        1,
                    ),
                )
                c.execute(
                    "INSERT INTO history VALUES (?,?,?,?,?,?,?)",
                    (
                        uuid4().hex,
                        "question",
                        qid,
                        1,
                        dumps(body),
                        "独立空间来源导入，待教师审核",
                        utc(),
                    ),
                )
            for e in data["dependencies"]:
                eid = taxonomy.uid(
                    "dependency:" + e["prerequisiteId"] + "->" + e["topicId"]
                )
                c.execute(
                    "INSERT INTO edges VALUES (?,?,?,?,?,?,?)",
                    (
                        eid,
                        taxonomy.uid(e["topicId"]),
                        taxonomy.uid(e["prerequisiteId"]),
                        e["strength"],
                        e["reason"],
                        "pending",
                        dumps(e),
                    ),
                )
            c.execute(
                "INSERT INTO sources VALUES (?,?)",
                (taxonomy.uid("source"), dumps(data["manifest"])),
            )
            manifest = dict(
                points=len(data["topics"]),
                questions=len(data["questions"]),
                edges=len(data["dependencies"]),
                backup=backup,
                commit=taxonomy.COMMIT,
            )
            c.execute(
                "INSERT INTO imports VALUES (?,?,?)",
                ("source-" + taxonomy.COMMIT, dumps(manifest), utc()),
            )
            log(c, "source.import", "source", None, manifest)
        return dict(already_imported=False, added=305, manifest=manifest)
    except Exception:
        for path in created:
            path.unlink(missing_ok=True)
        raise


def question(store, identity):
    with store.transaction() as c:
        r = row(c, "questions", identity)
        data = json.loads(r["data"])
        data.update(
            id=r["id"],
            external_id=r["external_id"],
            point_id=r["point_id"],
            status=r["status"],
            version=r["version"],
            raw=json.loads(r["raw"]),
            history=[
                dict(x) | {"snapshot": json.loads(x["snapshot"])}
                for x in c.execute(
                    "SELECT * FROM history WHERE entity_id=? ORDER BY version",
                    (identity,),
                )
            ],
        )
        return data


def questions(
    store, point_id="", difficulty=None, status="", q="", page=1, page_size=20
):
    with store.transaction() as c:
        all_items = []
        for r in c.execute("SELECT * FROM questions ORDER BY external_id"):
            data = json.loads(r["data"])
            if point_id and r["point_id"] != point_id:
                continue
            if difficulty and data["difficulty"] != difficulty:
                continue
            if status and r["status"] != status:
                continue
            summary = text_of(data["stem"])
            if q and q.casefold() not in (summary + r["external_id"]).casefold():
                continue
            all_items.append(
                dict(
                    id=r["id"],
                    external_id=r["external_id"],
                    point_id=r["point_id"],
                    status=r["status"],
                    version=r["version"],
                    difficulty=data["difficulty"],
                    summary=summary[:220],
                )
            )
        return dict(
            total=len(all_items),
            page=page,
            page_size=page_size,
            items=all_items[(page - 1) * page_size : page * page_size],
        )


def edit_question(store, identity, body):
    with store.transaction() as c:
        r = row(c, "questions", identity)
        if body.expected_version != r["version"]:
            raise BusinessError("题目已变化，请刷新后重试")
        data = json.loads(r["data"])
        before = dict(data)
        for field in ["stem", "answer", "explanation"]:
            value = validate_document(getattr(body, field))
            if not asset_ids(value).issubset(
                {a[0] for a in c.execute("SELECT id FROM question_assets")}
            ):
                raise BusinessError("题图不属于独立空间")
            data[field] = value
        if not text_of(data["stem"]).strip() or not text_of(data["answer"]).strip():
            raise BusinessError("题干及参考答案不能为空")
        data.update(
            difficulty=body.difficulty,
            status="pending",
            version=r["version"] + 1,
            grading_manual=True,
        )
        c.execute(
            "UPDATE questions SET data=?,status=?,version=? WHERE id=?",
            (dumps(data), "pending", data["version"], identity),
        )
        c.execute(
            "INSERT INTO history VALUES (?,?,?,?,?,?,?)",
            (
                uuid4().hex,
                "question",
                identity,
                data["version"],
                dumps(data),
                "教师编辑后重新待审核；练习改用教师自评",
                utc(),
            ),
        )
        log(c, "question.edit", identity, before, data)
    return question(store, identity)


def review(store, kind, identity, status, expected_version=None):
    if kind not in ("points", "questions", "edges") or status not in (
        "approved",
        "rejected",
    ):
        raise BusinessError("审核参数无效")
    with store.transaction() as c:
        old = row(c, kind, identity)
        if kind == "questions" and expected_version != old["version"]:
            raise BusinessError("题目已变化，请刷新后审核")
        if old["status"] != "pending":
            raise BusinessError("仅待审核记录可确认或拒绝")
        if kind == "questions":
            data = json.loads(old["data"])
            data.update(status=status, version=old["version"] + 1)
            c.execute(
                "UPDATE questions SET status=?,version=?,data=? WHERE id=?",
                (status, data["version"], dumps(data), identity),
            )
            c.execute(
                "INSERT INTO history VALUES (?,?,?,?,?,?,?)",
                (
                    uuid4().hex,
                    "question",
                    identity,
                    data["version"],
                    dumps(data),
                    "教师审核：" + status,
                    utc(),
                ),
            )
        else:
            c.execute(f"UPDATE {kind} SET status=? WHERE id=?", (status, identity))
        log(c, "review." + kind, identity, old, dict(status=status))
    return dict(status=status)


def data_management(store):
    with store.transaction() as c:
        return dict(
            database=str(store.db),
            assets=str(store.assets),
            backup_dir=str(store.backups),
            migration="cg0001",
            sources=[json.loads(r[0]) for r in c.execute("SELECT data FROM sources")],
            imports=[
                dict(r) | {"manifest": json.loads(r["manifest"])}
                for r in c.execute("SELECT * FROM imports")
            ],
            archive_count=c.execute("SELECT count(*) FROM archive").fetchone()[0],
            audit_count=c.execute("SELECT count(*) FROM audit").fetchone()[0],
            backups=store.list_backups(),
            scope="仅初中化学知识图谱，不包含班级、学生或教材题库",
        )


def save_view(store, value):
    with store.transaction() as c:
        valid = {p[0] for p in c.execute("SELECT id FROM points")}
        if value.get("selected") and value["selected"] not in valid:
            raise BusinessError("选择的浏览节点不存在")
        if any(k not in valid for k in value.get("positions", {})):
            raise BusinessError("浏览状态含未知节点")
        c.execute(
            "INSERT INTO view_state VALUES ('default',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data",
            (dumps(value),),
        )
    return dict(saved=True)


def view(store):
    with store.transaction() as c:
        r = c.execute("SELECT data FROM view_state WHERE key='default'").fetchone()
        return json.loads(r[0]) if r else {}


# Conservative reimplementation of the upstream two-attempt prerequisite tracing rule.
# No upstream JS or verify strings are evaluated. No inference that ancestors are mastered.
def prepare_current(c, session):
    if len(session["answers"]) >= session["limit"] or not session["queue"]:
        session["current"] = None
        session["finished"] = True
        return
    pid = session["queue"][0]
    attempts = [a for a in session["answers"] if a["point_id"] == pid]
    rows = [
        dict(r)
        for r in c.execute(
            "SELECT * FROM questions WHERE point_id=? AND status!='rejected' ORDER BY external_id",
            (pid,),
        )
    ]
    used = {a["question_id"] for a in session["answers"]}
    desired = (
        "standard"
        if not attempts
        else ("challenge" if attempts[0]["correct"] else "basic")
    )
    candidate = next(
        (
            r
            for r in rows
            if r["id"] not in used and json.loads(r["raw"]).get("difficulty") == desired
        ),
        None,
    ) or next((r for r in rows if r["id"] not in used), None)
    if not candidate:
        session["queue"].pop(0)
        session["outcomes"][pid] = "untested"
        return prepare_current(c, session)
    session["current"] = dict(
        question_id=candidate["id"],
        external_id=candidate["external_id"],
        point_id=pid,
        version=candidate["version"],
        data=json.loads(candidate["data"]),
        raw=json.loads(candidate["raw"]),
    )


def session_public(session):
    result = json.loads(dumps(session))
    current = result.get("current")
    if current:
        current["stem"] = current["data"]["stem"]
        current["type"] = current["raw"].get("type")
        current["choices"] = (
            current["raw"].get("choices", [])
            if not current["data"].get("grading_manual")
            else []
        )
        current["manual_only"] = bool(current["data"].get("grading_manual"))
        if current["manual_only"]:
            current["reference"] = current["data"]["answer"]
            current["explanation"] = current["data"]["explanation"]
        current.pop("data")
        current.pop("raw")
    return result


def create_session(store, target, limit, acknowledged):
    if not acknowledged:
        raise BusinessError("请确认了解来源题目及自动判分局限")
    with store.transaction() as c:
        if row(c, "points", target)["status"] == "rejected":
            raise BusinessError("已拒绝的知识点不能开始诊断练习")
        session = dict(
            id=uuid4().hex,
            target=target,
            limit=limit,
            queue=[target],
            answers=[],
            outcomes={},
            current=None,
            finished=False,
            created_at=utc(),
            notice="仅教师试做；参考答案未经全面教学审核；不代表学生正式掌握度，不写学生画像。",
        )
        prepare_current(c, session)
        c.execute(
            "INSERT INTO sessions VALUES (?,?,?)",
            (session["id"], dumps(session), utc()),
        )
    return session_public(session)


def get_session(store, identity):
    with store.transaction() as c:
        return session_public(json.loads(row(c, "sessions", identity)["data"]))


def sessions(store):
    with store.transaction() as c:
        return [
            dict(
                id=r["id"],
                updated_at=r["updated_at"],
                target=json.loads(r["data"])["target"],
                finished=json.loads(r["data"])["finished"],
                answer_count=len(json.loads(r["data"])["answers"]),
            )
            for r in c.execute(
                "SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 100"
            )
        ]


def answer_session(store, identity, answer, step, manual_verdict=None):
    with store.transaction() as c:
        session = json.loads(row(c, "sessions", identity)["data"])
        current = session["current"]
        if session["finished"] or current is None:
            raise BusinessError("练习已结束")
        if step != len(session["answers"]):
            raise BusinessError("作答进度已变化，请刷新，重复提交未计分")
        data = current["data"]
        raw = current["raw"]
        manual = bool(data.get("grading_manual"))
        correct = None
        if manual:
            if manual_verdict not in ("correct", "wrong"):
                raise BusinessError("编辑后的题目请由教师核对当前参考答案并自评")
            correct = manual_verdict == "correct"
        elif raw["type"] == "choice":
            normalized = unicodedata.normalize("NFKC", answer).strip().upper()
            if normalized not in [x["key"] for x in raw.get("choices", [])]:
                raise BusinessError("请选择合法选项字母")
            correct = normalized == raw["answer"]
        elif raw["type"] == "numeric":
            normalized = unicodedata.normalize("NFKC", answer).strip()
            if (
                not re.fullmatch(r"-?\d+(?:\.\d+)?(?:/\d+)?", normalized)
                or len(normalized) > 80
            ):
                raise BusinessError(
                    "此数值题请仅填整数、小数或分数，单位按题干；不执行表达式"
                )
            try:
                correct = Fraction(normalized) == Fraction(raw["answer"])
            except (ValueError, ZeroDivisionError):
                raise BusinessError("数值格式无效")
        else:
            raise BusinessError("此题型暂不支持练习判分")
        pid = current["point_id"]
        entry = dict(
            point_id=pid,
            question_id=current["question_id"],
            external_id=current["external_id"],
            question_version=current["version"],
            stem=data["stem"],
            reference=data["answer"],
            explanation=data["explanation"],
            text=answer,
            correct=correct,
            mode="teacher_self_assessment" if manual else "reference_comparison",
        )
        session["answers"].append(entry)
        attempts = [a for a in session["answers"] if a["point_id"] == pid]
        if len(attempts) >= 2:
            outcome = (
                "passed_this_practice"
                if all(a["correct"] for a in attempts)
                else (
                    "possible_weakness"
                    if not any(a["correct"] for a in attempts)
                    else "unstable"
                )
            )
            session["outcomes"][pid] = outcome
            session["queue"].pop(0)
            if outcome == "possible_weakness":
                pre = [
                    r[0]
                    for r in c.execute(
                        "SELECT prerequisite_id FROM edges WHERE topic_id=? AND status!='rejected' ORDER BY CASE strength WHEN 'hard' THEN 0 ELSE 1 END,prerequisite_id",
                        (pid,),
                    )
                ]
                for p in pre[:2]:
                    if p not in session["outcomes"] and p not in session["queue"]:
                        session["queue"].append(p)
        prepare_current(c, session)
        c.execute(
            "UPDATE sessions SET data=?,updated_at=? WHERE id=?",
            (dumps(session), utc(), identity),
        )
        log(
            c,
            "practice.answer",
            identity,
            None,
            dict(step=step, question=current["question_id"], correct=correct),
        )
    return session_public(session)


def upload_asset(store, content, filename):
    if (
        not 0 < len(content) <= 5 * 1024 * 1024
        or not filename
        or "/" in filename
        or "\\" in filename
    ):
        raise BusinessError("图片文件名或大小无效")
    expected = {".png": "PNG", ".jpg": "JPEG", ".jpeg": "JPEG", ".webp": "WEBP"}.get(
        Path(filename).suffix.lower()
    )
    if not expected:
        raise BusinessError("只接受PNG/JPEG/WebP，不接受SVG")
    try:
        with Image.open(io.BytesIO(content)) as image:
            if (
                image.format != expected
                or image.width * image.height > 20_000_000
                or getattr(image, "n_frames", 1) != 1
            ):
                raise ValueError()
            image.load()
            out = io.BytesIO()
            image.convert("RGB" if expected == "JPEG" else "RGBA").save(
                out, format=expected
            )
            clean = out.getvalue()
            w, h = image.size
    except Exception as e:
        raise BusinessError("图片无效") from e
    extension = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}[expected]
    identity = uuid4().hex
    store.ensure()
    path = store.assets / (identity + "." + extension)
    created = False
    try:
        with store.transaction() as c:
            with path.open("xb") as f:
                created = True
                f.write(clean)
            path.chmod(0o600)
            c.execute(
                "INSERT INTO question_assets VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    identity,
                    path.name,
                    filename,
                    "image/" + ("jpeg" if extension == "jpg" else extension),
                    len(clean),
                    hashlib.sha256(clean).hexdigest(),
                    w,
                    h,
                    utc(),
                ),
            )
        return dict(id=identity)
    except Exception:
        if created:
            path.unlink(missing_ok=True)
        raise
