from sqlalchemy import select
import pytest
from app.core import library_models as m
from app.services.textbook_seed import apply, identity, load
from app.services.consolidate_chemistry import consolidate
from app.services.library import catalog
from app.services.classes import BusinessError
from test_storage_api import client, settings, HEADERS
from test_question_library import subject, edition, book, node, question, point
from test_textbook_seed import SEEDS


def test_consolidation_preserves_ids_links_and_backup(client, settings):
    s = subject(client)
    old = edition(client, s, "九年级")
    oldbook = book(client, old)
    storage = client.app.state.storage
    apply(storage, SEEDS)
    n = identity("grade9-003")
    q = question(client, s, node_ids=[n])
    p = point(client, s, node_ids=[n])
    before = catalog(storage)
    result = consolidate(storage, SEEDS, old["id"], oldbook["id"])
    after = catalog(storage)
    assert [x["name"] for x in after["editions"]] == ["初中化学"]
    assert len(after["books"]) == 1 and len(after["nodes"]) == 65
    assert {x["id"] for x in after["nodes"]} == {x["id"] for x in before["nodes"]}
    roots = sorted(
        [x for x in after["nodes"] if not x["parent_id"]], key=lambda x: x["position"]
    )
    assert [x["name"] for x in roots[:6]] == [
        n["original_name"]
        for b in load(SEEDS)[0]["books"]
        for n in b["nodes"]
        if n["node_type"] == "theme"
    ]
    assert (
        client.get("/api/library/questions", params={"node_id": n}).json()["total"] == 1
    )
    assert after["mappings"] == before["mappings"]
    assert consolidate(storage, SEEDS, old["id"], oldbook["id"])["already_done"]
    storage.restore(result["backup"])
    assert catalog(storage) == before


def test_nonempty_old_book_refuses_delete(client):
    s = subject(client)
    old = edition(client, s, "九年级")
    b = book(client, old)
    node(client, b)
    storage = client.app.state.storage
    apply(storage, SEEDS)
    before = catalog(storage)
    with pytest.raises(BusinessError, match="拒绝自动删除"):
        consolidate(storage, SEEDS, old["id"], b["id"])
    assert catalog(storage) == before
