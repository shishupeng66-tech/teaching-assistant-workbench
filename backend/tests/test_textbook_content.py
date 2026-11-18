import copy
import json

import pytest
from app.core import content_models as cm
from app.core import library_models as m
from app.core.library_schemas import PointInput, ReviewInput
from app.services import library as lib
from app.services import textbook_content as tc
from app.services.classes import BusinessError, transaction
from app.services.storage import Storage
from app.services.textbook_validation import validate
from sqlalchemy import insert, select
from test_storage_api import HEADERS, client as client, settings as settings

DATA = json.loads(tc.SEED.read_text())
SNAPSHOT = json.loads((tc.SEED.parent / "catalog-snapshot.json").read_text())


def setup_catalog(storage):
    with transaction(storage) as s:
        for key in ["subjects", "editions", "books"]:
            for row in SNAPSHOT[key]:
                s.execute(insert(lib.TABLES[key]).values(**row))
        remaining = SNAPSHOT["nodes"].copy()
        seen = set()
        while remaining:
            for row in remaining.copy():
                if not row["parent_id"] or row["parent_id"] in seen:
                    s.execute(insert(m.nodes).values(**row))
                    seen.add(row["id"])
                    remaining.remove(row)
    return DATA["points"][0]


def test_scientific_validation_and_exact_coverage():
    result = validate(DATA)
    assert result == {
        "points": 64,
        "questions": 192,
        "controlled_checks": 37,
        "balanced_equations": 10,
        "teacher_review": "pending",
    }
    assert (
        len({n for p in DATA["points"] for n in p["node_ids"]}) == 49
    )  # 27课题+10实践+10复习+2附录
    assert len({p["theme_id"] for p in DATA["points"]}) == 6
    broken = copy.deepcopy(DATA)
    broken["points"][2]["questions"][1]["answer"] = "9"
    with pytest.raises(AssertionError):
        validate(broken)
    wrong = copy.deepcopy(DATA)
    wrong["points"][28]["questions"][0]["answer"] = "3H₂＋O₂→2H₂O。"
    with pytest.raises(AssertionError):
        validate(wrong)


def test_seed_visible_every_lesson_and_idempotent(client, settings):
    st = client.app.state.storage
    setup_catalog(st)
    original = lib.catalog(st)["nodes"]
    assert not tc.seed(st)["already_imported"]
    saved = tc.seed(st, True)
    assert saved["points"] == 64 and saved["questions"] == 192
    assert tc.seed(st, True)["already_imported"]
    c = lib.catalog(st)
    assert c["nodes"] == original and len(c["points"]) == 64 and not c["mappings"]
    for p in DATA["points"]:
        rows = lib.list_questions(st, {"node_id": p["node_ids"][0]})
        assert rows["total"] >= 3 and all(
            x["status"] == "pending" for x in rows["items"]
        )
        assert all(
            x["answer"]["content"] and x["explanation"]["content"]
            for x in rows["items"]
        )
        assert lib.statistics(st, {"node_id": p["node_ids"][0]})["knowledge_total"] >= 1
    stats = lib.statistics(st, {})
    assert (stats["total"], stats["approved"], stats["knowledge_pending"]) == (
        192,
        0,
        64,
    )
    assert len(c["candidates"]) == 536
    backup = st.backup()
    st._validate(st.backup_path(backup))
    p = DATA["points"][0]
    point = lib.get_point(st, p["id"])
    point["name"] = "模拟教师修改名称"
    body = {k: v for k, v in point.items() if k in PointInput.model_fields}
    body["expected_version"] = point["profile_version"]
    lib.save_point(st, PointInput(**body), p["id"])
    assert (
        tc.seed(st, True)["already_imported"]
        and lib.get_point(st, p["id"])["name"] == "模拟教师修改名称"
    )
    st.restore(backup)
    assert lib.get_point(st, p["id"])["name"] == p["name"]
    # Close/reopen isolated storage; no正式实例。
    st.close()
    other = Storage(settings)
    other.initialize()
    assert lib.statistics(other, {})["total"] == 192
    other.close()


def test_review_scope_atomic_stale_and_duplicate(client):
    st = client.app.state.storage
    p = setup_catalog(st)
    tc.seed(st, True)
    nid = p["node_ids"][0]
    qid = p["questions"][0]["id"]
    onlyq = tc.preview(st, [], [qid], nid, "approve", "模拟审核")
    with pytest.raises(BusinessError, match="知识点"):
        tc.commit(st, onlyq["batch_id"], "确认本批审核")
    assert lib.detail(st, qid)["status"] == "pending"
    preview = tc.preview(
        st, [p["id"]], [qid], nid, "approve", "模拟审核，不是项目所有者验收"
    )
    assert preview["point_count"] == preview["question_count"] == 1
    tc.commit(st, preview["batch_id"], "确认本批审核")
    assert (
        lib.get_point(st, p["id"])["review_status"] == "approved"
        and lib.detail(st, qid)["status"] == "approved"
    )
    assert lib.get_point(st, p["id"])["node_ids"] == [nid]
    assert lib.detail(st, qid)["node_ids"] == [nid]
    # 范围外专题复习依旧待确认，不越范围审批。
    assert any(
        x["status"] == "pending" for x in lib.get_point(st, p["id"])["candidates"]
    )
    with pytest.raises(BusinessError, match="已经"):
        tc.commit(st, preview["batch_id"], "确认本批审核")
    q2 = p["questions"][1]["id"]
    stale = tc.preview(st, [], [q2], nid, "approve", "")
    lib.review(
        st, q2, ReviewInput(action="reject", expected_version=1, note="模拟退回")
    )
    with pytest.raises(BusinessError):
        tc.commit(st, stale["batch_id"], "确认本批审核")
    lib.review(st, q2, ReviewInput(action="submit", expected_version=2))
    r = tc.preview(st, [], [q2], nid, "reject", "需要补充题设")
    tc.commit(st, r["batch_id"], "确认本批审核")
    assert (
        lib.detail(st, q2)["status"] == "draft"
        and lib.detail(st, p["questions"][2]["id"])["status"] == "pending"
    )
    with transaction(st) as s:
        assert (
            s.scalar(select(cm.reviews.c.note).where(cm.reviews.c.entity_id == q2))
            == "需要补充题设"
        )


def test_review_api_and_legacy_isolation(client):
    st = client.app.state.storage
    p = setup_catalog(st)
    tc.seed(st, True)
    r = client.get("/api/library/content-review", params={"node_id": p["node_ids"][0]})
    assert len(r.json()["points"]) == 2 and len(r.json()["questions"]) == 6
    a = client.post(
        "/api/library/content-review/preview",
        json={
            "point_ids": [p["id"]],
            "question_ids": [],
            "node_id": p["node_ids"][0],
            "action": "reject",
            "note": "模拟退回",
        },
        headers=HEADERS,
    )
    assert a.status_code == 200
    bad = client.post(
        "/api/library/content-review/commit",
        json={"batch_id": a.json()["batch_id"], "confirmation": ""},
        headers=HEADERS,
    )
    assert bad.status_code == 409
    good = client.post(
        "/api/library/content-review/commit",
        json={"batch_id": a.json()["batch_id"], "confirmation": "确认本批审核"},
        headers=HEADERS,
    )
    assert good.status_code == 200
    assert lib.get_point(st, p["id"])["review_status"] == "rejected"
