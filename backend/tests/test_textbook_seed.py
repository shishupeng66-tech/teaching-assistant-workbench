import json
from pathlib import Path
import pytest
from sqlalchemy import update
from app.core import library_models as m
from app.services.textbook_seed import apply, load, identity
from app.services.classes import transaction, BusinessError
from app.services.library import catalog
from test_storage_api import settings, client, HEADERS
from test_question_library import question, subject, edition, book, node, svg_or_png

SEEDS = (
    Path(__file__).resolve().parents[2]
    / "data-seeds/textbooks/shanghai-junior-chemistry"
)


def test_seed_validation_and_exact_counts():
    payload, digest = load(SEEDS)
    assert len(digest) == 64
    expected = [
        dict(theme=4, topic=6, lesson=15, practice=6, review=6, appendix=1),
        dict(theme=2, topic=4, lesson=12, practice=4, review=4, appendix=1),
    ]
    for b, counts in zip(payload["books"], expected):
        assert {
            k: sum(n["node_type"] == k for n in b["nodes"]) for k in counts
        } == counts
        assert b["nodes"][-1]["node_type"] == "appendix"


def test_seed_rejects_wrong_parent(tmp_path):
    payload, _ = load(SEEDS)
    for name in ("sources", "grade8", "grade9"):
        (tmp_path / (name + ".json")).write_bytes(
            (SEEDS / (name + ".json")).read_bytes()
        )
    b = payload["books"][0]
    b["nodes"][2]["parent_key"] = b["nodes"][0]["key"]
    b["nodes"][2]["position"] = 90
    (tmp_path / "grade8.json").write_text(json.dumps(b))
    with pytest.raises(ValueError, match="层级"):
        load(tmp_path)


def test_seed_atomic_idempotent_preserves_and_restore(client, settings):
    s = subject(client, code="01")
    e = edition(client, s)
    b = book(client, e)
    n = node(client, b)
    q = question(client, s, node_ids=[n["id"]])
    image = client.post(
        "/api/library/assets",
        files={"file": ("test.png", svg_or_png(), "image/png")},
        headers=HEADERS,
    ).json()
    storage = client.app.state.storage
    before = catalog(storage)
    first = apply(storage, SEEDS)
    assert first["added"] == 69 and not first["already_imported"]
    second = apply(storage, SEEDS)
    assert second["added"] == 0 and second["already_imported"]
    after = catalog(storage)
    for k, rows in before.items():
        assert all(row in after[k] for row in rows)
    assert len(after["nodes"]) == 66
    target = identity("grade9-003")
    response = client.post(
        f"/api/library/nodes/{target}/questions",
        json={"question_id": q["id"]},
        headers=HEADERS,
    )
    assert response.status_code == 200, response.text
    assert (
        client.get(
            "/api/library/questions",
            params={"node_id": identity("grade9-001"), "descendants": True},
        ).json()["total"]
        == 1
    )
    snapshot = storage.backup()
    with transaction(storage) as session:
        session.execute(
            update(m.nodes).where(m.nodes.c.id == target).values(name="教师自定名称")
        )
    with pytest.raises(BusinessError, match="拒绝覆盖"):
        apply(storage, SEEDS)
    storage.restore(snapshot)
    assert catalog(storage) == after
    assert client.get("/api/library/assets/" + image["id"] + "/file").status_code == 200


def test_mid_import_failure_rolls_back(client):
    storage = client.app.state.storage
    with transaction(storage) as s:
        s.execute(m.subjects.insert().values(id="s", name="化学", code="01", active=1))
        s.execute(
            m.editions.insert().values(
                id=identity("grade9:edition"),
                subject_id="s",
                name="冲突版本",
                description="",
                active=1,
            )
        )
    before = catalog(storage)
    with pytest.raises(BusinessError):
        apply(storage, SEEDS)
    assert catalog(storage) == before
