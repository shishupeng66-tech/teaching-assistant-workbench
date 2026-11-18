import copy
import json
from fractions import Fraction
from pathlib import Path
import pytest
from sqlalchemy import select, func
from app.core import library_models as m, taxonomy_models as t
from app.services import taxonomy
from app.services.taxonomy import (
    load,
    preview,
    import_data,
    graph,
    decide,
    uid,
    convert,
    DIRECTORY,
)
from app.services.textbook_seed import apply, identity
from app.services.consolidate_chemistry import consolidate
from app.services.classes import transaction, BusinessError
from app.services.library import catalog
from test_storage_api import client, settings, HEADERS
from test_question_library import subject, question
from test_textbook_seed import SEEDS


def prepare(client):
    s = subject(client)
    st = client.app.state.storage
    apply(st, SEEDS)
    consolidate(st, SEEDS)
    return st, s


def test_preview_scope_counts_and_no_writes(client):
    st, s = prepare(client)
    before = catalog(st)
    r = preview(st)
    assert (
        r["topics"],
        r["questions"],
        r["dependencies"],
        r["images"],
        r["hard"],
        r["soft"],
    ) == (45, 180, 80, 48, 57, 23)
    assert r["ready"] == 180 and not r["unsupported"]
    assert len(r["suggested_mappings"]) == 50 and all(
        x["available"] for x in r["suggested_mappings"]
    )
    assert r["unmapped"] == ["cnk_j022"]
    assert catalog(st) == before


def test_import_all_ids_answers_associations_pending_idempotent_restore(client):
    st, s = prepare(client)
    old = question(client, s, "保留的独立教师题目")
    before = catalog(st)
    result = import_data(st)
    assert (
        result["points"] == 45
        and result["questions"] == 180
        and result["dependencies"] == 80
    )
    g = graph(st)
    assert (
        len(g["points"]) == 45
        and len(g["edges"]) == 80
        and len(g["questions"]) == 180
        and len(g["mappings"]) == 50
    )
    assert catalog(st)["nodes"] == before["nodes"]
    data, _ = load()
    with transaction(st) as session:
        assert session.scalar(select(func.count()).select_from(m.mappings)) == 0
        assert session.scalar(select(func.count()).select_from(m.relations)) == 0
        for q in data["questions"]:
            stored = (
                session.execute(
                    select(m.questions).where(m.questions.c.id == uid(q["id"]))
                )
                .mappings()
                .one()
            )
            assert stored["status"] == "pending"
            links = list(
                session.execute(
                    select(m.qkp.c.knowledge_point_id).where(
                        m.qkp.c.question_id == stored["id"]
                    )
                ).scalars()
            )
            assert links == [uid(q["topicId"])]
            converted = convert(
                q, s["id"], uid("asset:" + q["id"]) if q.get("figure") else None
            )
            assert (
                stored["stem"] == converted.stem
                and stored["answer"] == converted.answer
            )
        assert all(x["point"]["review_status"] == "pending" for x in g["points"])
        assert session.scalar(select(func.count()).select_from(m.assets)) == 48
    second = import_data(st)
    assert second["already_imported"] and second["added"] == 0
    st.restore(result["backup"])
    assert catalog(st) == before and not graph(st)["sources"]
    assert client.get("/api/library/questions/" + old["id"]).status_code == 200


def test_teacher_confirmation_direction_and_mapping(client):
    st, _ = prepare(client)
    import_data(st)
    g = graph(st)
    e = next(
        e
        for e in g["edges"]
        if e["payload"]["topicId"] == "cnk_j002"
        and e["payload"]["prerequisiteId"] == "cnk_j001"
    )
    assert e["point_id"] == uid("cnk_j002") and e["prerequisite_id"] == uid("cnk_j001")
    with pytest.raises(BusinessError, match="两端"):
        decide(st, "dependency", e["id"], "approve")
    for p in ["cnk_j001", "cnk_j002"]:
        decide(st, "point", uid("point:" + p), "approve")
    decide(st, "dependency", e["id"], "approve")
    mapping = next(x for x in g["mappings"] if x["item_id"] == uid("point:cnk_j001"))
    decide(st, "mapping", mapping["id"], "approve")
    with transaction(st) as session:
        r = session.execute(select(m.relations)).mappings().one()
        assert r["source_id"] == uid("cnk_j002") and r["target_id"] == uid("cnk_j001")
        assert (
            session.execute(select(m.mappings)).mappings().one()["node_id"]
            == mapping["node_id"]
        )
    with pytest.raises(BusinessError):
        decide(st, "mapping", mapping["id"], "approve")


def test_failure_rolls_back_assets_and_all_rows(client, monkeypatch):
    st, _ = prepare(client)
    before = catalog(st)
    original = taxonomy.save_question_in_session
    count = 0

    def fail(*args, **kwargs):
        nonlocal count
        count += 1
        if count == 25:
            raise RuntimeError("模拟题目转换后的写入失败")
        return original(*args, **kwargs)

    monkeypatch.setattr(taxonomy, "save_question_in_session", fail)
    with pytest.raises(RuntimeError):
        import_data(st)
    assert catalog(st) == before and not graph(st)["sources"]
    assert not list((st.settings.data_dir / "assets").glob("*.png"))


def test_source_scope_cycle_and_duplicate_rejection(tmp_path):
    data, _ = load()

    def check():
        (tmp_path / "source.json").write_text(json.dumps(data))
        (tmp_path / "mapping-rules.json").write_text("[]")
        return load(tmp_path)

    data["dependencies"].append(
        {
            "topicId": "cnk_j001",
            "prerequisiteId": "cnk_j002",
            "strength": "soft",
            "reason": "cycle",
        }
    )
    with pytest.raises(BusinessError, match="循环"):
        check()
    data["dependencies"].pop()
    data["topics"][0]["id"] = "cnk_h001"
    with pytest.raises(BusinessError, match="范围"):
        check()


def test_numeric_controlled_reference_and_no_verify_execution():
    data, _ = load()
    expected = {
        "cnk_j005_q4": Fraction(100) * Fraction(21, 100),
        "cnk_j013_q4": Fraction(16) * 2,
        "cnk_j015_q3": 2 + 16,
        "cnk_j015_q4": Fraction(36) * 2 / 18,
        "cnk_j017_q4": 12 + 32,
        "cnk_j019_q3": Fraction(36) * 32 / 36,
        "cnk_j019_q4": Fraction(100) * 44 / 100,
        "cnk_j034_q3": Fraction(50) * 36 / 100,
        "cnk_j035_q3": Fraction(100) * 10 / 100,
        "cnk_j035_q4": Fraction(150) * 4 / 100,
        "cnk_j036_q4": Fraction(90) / 1,
    }
    for q in data["questions"]:
        q = copy.deepcopy(q)
        q["verify"] = "__import__('os').system('not-allowed')"
        convert(q, "test", uid("asset:" + q["id"]) if q.get("figure") else None)
        if q["type"] == "numeric":
            assert Fraction(q["answer"]) == expected[q["id"]]


def test_unsupported_preserves_raw_payload(client, tmp_path):
    st, _ = prepare(client)
    data, _ = load()
    data["questions"] = data["questions"][:1]
    data["questions"][0]["type"] = "future"
    data["dependencies"] = []
    (tmp_path / "source.json").write_text(json.dumps(data))
    (tmp_path / "mapping-rules.json").write_text("[]")
    result = import_data(st, tmp_path)
    assert result["questions"] == 0 and len(result["unsupported"]) == 1
    with transaction(st) as s:
        r = (
            s.execute(select(t.items).where(t.items.c.kind == "question"))
            .mappings()
            .one()
        )
        assert (
            r["payload"] == data["questions"][0]
            and r["processing_status"] == "unsupported"
        )


def test_import_api_confirmation_and_preview(client):
    prepare(client)
    assert client.get("/api/library/taxonomy/preview").json()["ready"] == 180
    assert (
        client.post(
            "/api/library/taxonomy/import",
            json={"confirmation": "错误"},
            headers=HEADERS,
        ).status_code
        == 422
    )
    assert client.get("/api/library/taxonomy/graph").json()["points"] == []


def test_manual_mapping_reflected_in_graph_and_unmapped_list(client):
    st, _ = prepare(client)
    import_data(st)
    assert "cnk_j022" in preview(st)["unmapped"]
    with transaction(st) as s:
        s.execute(
            m.mappings.insert().values(
                node_id=identity("grade8-003"), knowledge_point_id=uid("cnk_j022")
            )
        )
    assert "cnk_j022" not in preview(st)["unmapped"]
    assert any(
        r["item_id"] == uid("point:cnk_j022") and r["status"] == "approved"
        for r in graph(st)["mappings"]
    )
