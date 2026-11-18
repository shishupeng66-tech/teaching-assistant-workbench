import json
import pytest
from app.services import chemistry as svc
from app.services.chemistry_store import ChemistryStore
from app.services.chemistry_transfer import transfer, collect
from app.services import taxonomy
from app.services.classes import BusinessError
from app.services.library import catalog, list_questions, statistics
from test_storage_api import client, settings, HEADERS
from test_taxonomy import prepare


def test_new_space_direct_seed_isolated_practice_backup(client):
    graph = client.app.state.chemistry
    result = svc.initialize_source(graph)
    o = svc.overview(graph)
    assert (len(o["points"]), len(o["edges"]), o["question_total"], o["assets"]) == (
        45,
        80,
        180,
        48,
    )
    assert (
        catalog(graph.main)["points"] == [] and statistics(graph.main, {})["total"] == 0
    )
    assert svc.initialize_source(graph)["added"] == 0
    p = o["points"][0]
    session = svc.create_session(graph, p["id"], 6, True)
    current = session["current"]
    with graph.transaction() as c:
        stored = json.loads(
            c.execute(
                "select data from sessions where id=?", (session["id"],)
            ).fetchone()[0]
        )
        correct = stored["current"]["raw"]["answer"]
    session = svc.answer_session(graph, session["id"], correct, 0)
    assert session["answers"][0]["correct"] and len(session["answers"]) == 1
    with pytest.raises(BusinessError):
        svc.answer_session(graph, session["id"], correct, 0)
    backup = graph.backup()
    svc.save_view(
        graph,
        {
            "positions": {p["id"]: {"x": 100, "y": 50}},
            "selected": p["id"],
            "mode": "local",
        },
    )
    graph.restore(backup)
    assert svc.view(graph) == {}
    assert svc.get_session(graph, session["id"])["answers"][0]["correct"]
    assert graph.read_asset(taxonomy.uid("asset:cnk_j004_q1"))[1].startswith(b"\x89PNG")


def test_transfer_hashes_archive_and_main_namespace(client):
    main, _ = prepare(client)
    taxonomy.import_data(main)
    before = collect(main)
    g = client.app.state.chemistry
    result = transfer(main, g)
    assert result["manifest"]["counts"] == dict(
        points=45, questions=180, edges=80, assets=48
    )
    assert not catalog(main)["points"] and list_questions(main, {})["total"] == 0
    assert statistics(main, {})["knowledge_total"] == 0
    assert svc.overview(g)["question_total"] == 180
    with g.transaction() as c:
        for table, meta in before["manifest"].items():
            assert (
                c.execute(
                    "select count(*) from archive where table_name=?", (table,)
                ).fetchone()[0]
                == meta["count"]
            )
    assert transfer(main, g)["already_transferred"]
    main_subject = catalog(main)["subjects"][0]["id"]
    attempted = client.post(
        "/api/library/knowledge-points",
        headers=HEADERS,
        json={
            "subject_id": main_subject,
            "name": "不能跨空间挂接",
            "code": "CROSS-BLOCK",
            "parent_id": taxonomy.uid("cnk_j001"),
        },
    )
    assert attempted.status_code == 410

    assert (
        client.get("/api/library/questions/" + taxonomy.uid("cnk_j001_q1")).status_code
        == 410
    )


def test_manual_association_blocks_auto_isolation(client):
    main, _ = prepare(client)
    taxonomy.import_data(main)
    from app.services.classes import transaction
    from app.core import library_models as m
    from app.services.textbook_seed import identity

    with transaction(main) as s:
        s.execute(
            m.mappings.insert().values(
                node_id=identity("grade8-003"),
                knowledge_point_id=taxonomy.uid("cnk_j001"),
            )
        )
    with pytest.raises(BusinessError, match="人工"):
        transfer(main, client.app.state.chemistry)
    with transaction(main) as s:
        assert s.execute(m.mappings.select()).first()


def test_edits_review_images_and_backup_scope_are_independent(client):
    from app.api.chemistry import QuestionEdit
    from app.services.rich_content import document

    graph = client.app.state.chemistry
    svc.initialize_source(graph)
    qid = taxonomy.uid("cnk_j004_q1")
    q = svc.question(graph, qid)
    edit = QuestionEdit(
        stem=q["stem"],
        answer=document("教师修订参考答案"),
        explanation=q["explanation"],
        difficulty=3,
        expected_version=q["version"],
    )
    changed = svc.edit_question(graph, qid, edit)
    assert (
        changed["version"] == 2
        and changed["status"] == "pending"
        and changed["grading_manual"]
    )
    with pytest.raises(BusinessError):
        svc.edit_question(graph, qid, edit)
    svc.review(graph, "questions", qid, "approved", 2)
    assert svc.question(graph, qid)["version"] == 3
    assert len(svc.question(graph, qid)["history"]) == 3
    assert client.get("/api/library/questions/" + qid).status_code == 404
    before = graph.main.backup()
    with pytest.raises(Exception):
        graph.restore(before)
    good = graph.backup()
    svc.save_view(graph, {"positions": {}, "selected": "", "mode": "local"})
    graph.restore(good)
    assert svc.view(graph) == {}


def test_practice_wrong_twice_traces_prerequisite_and_no_inference(client):
    graph = client.app.state.chemistry
    svc.initialize_source(graph)
    target = taxonomy.uid("cnk_j002")
    session = svc.create_session(graph, target, 6, True)
    for step in range(2):
        with graph.transaction() as c:
            current = json.loads(
                c.execute(
                    "select data from sessions where id=?", (session["id"],)
                ).fetchone()[0]
            )["current"]
            raw = current["raw"]
            wrong = next(x["key"] for x in raw["choices"] if x["key"] != raw["answer"])
        session = svc.answer_session(graph, session["id"], wrong, step)
    assert session["outcomes"][target] == "possible_weakness"
    assert session["current"]["point_id"] == taxonomy.uid("cnk_j001")
    assert taxonomy.uid("cnk_j001") not in session["outcomes"]
    # Resume persists the current snapshot; no state is written to student tables.
    assert (
        svc.get_session(graph, session["id"])["current"]["question_id"]
        == session["current"]["question_id"]
    )
    from sqlalchemy import text

    with graph.main.engine.connect() as c:
        assert c.execute(text("select count(*) from students")).scalar() == 0


def test_verified_copy_resume_after_publish_failure(client, monkeypatch):
    from app.services import chemistry_transfer as module

    main, _ = prepare(client)
    taxonomy.import_data(main)
    graph = client.app.state.chemistry
    original = module.publish

    def fail(*args):
        raise RuntimeError("模拟主库发布失败")

    monkeypatch.setattr(module, "publish", fail)
    with pytest.raises(RuntimeError):
        module.transfer(main, graph)
    assert svc.overview(graph)["question_total"] == 180
    monkeypatch.setattr(module, "publish", original)
    assert module.transfer(main, graph)["already_transferred"]
    from sqlalchemy import text

    with main.engine.connect() as c:
        assert (
            c.execute(
                text(
                    "select count(*) from questions where data_space='chemgraph_legacy'"
                )
            ).scalar()
            == 180
        )


def test_all_48_assets_and_restore_image_integrity(client):
    graph = client.app.state.chemistry
    svc.initialize_source(graph)
    with graph.transaction() as c:
        images = [dict(r) for r in c.execute("select * from question_assets")]
    assert len(images) == 48
    import hashlib

    for a in images:
        assert hashlib.sha256(graph.read_asset(a["id"])[1]).hexdigest() == a["sha256"]
    snapshot = graph.backup()
    first = images[0]
    (graph.assets / first["storage_name"]).write_bytes(b"broken")
    # A missing/corrupt live image blocks the mandatory safety snapshot rather than unsafe restore.
    with pytest.raises(Exception):
        graph.restore(snapshot)
    from app.services.asset_snapshots import read_checked

    path = graph.backups / (snapshot + ".assets")
    (graph.assets / first["storage_name"]).write_bytes(read_checked(path, first))
    graph.restore(snapshot)
    assert graph.read_asset(first["id"])[1].startswith(b"\x89PNG")
