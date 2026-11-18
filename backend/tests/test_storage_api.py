import sqlite3
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.core.config import Settings
from app.services.storage import Storage, StorageError

HEADERS = {"X-Workbench-Request": "1", "Origin": "http://127.0.0.1:5188"}


@pytest.fixture
def settings(tmp_path):
    return Settings(data_dir=tmp_path / "data", backup_dir=tmp_path / "backups")


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


def test_health_migration_and_settings(client, settings):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["database"] == {
        "connected": True,
        "migration": "0006",
    }
    assert client.get("/api/settings").json()["data_dir"] == str(settings.data_dir)
    with sqlite3.connect(settings.data_dir / "workbench.sqlite3") as con:
        assert set(
            x[0]
            for x in con.execute("SELECT name FROM sqlite_master WHERE type='table'")
        ) == {
            "knowledge_point_profiles", "content_candidates", "content_reviews", "content_review_batches",
            "app_metadata",
            "alembic_version",
            "classrooms",
            "students",
            "enrollments",
            "classroom_layouts",
            "seat_assignments",
            "audit_logs",
            "import_batches",
            "subjects",
            "textbook_editions",
            "textbook_books",
            "curriculum_nodes",
            "knowledge_points",
            "knowledge_point_relations",
            "curriculum_mappings",
            "questions",
            "question_knowledge_points",
            "question_curriculum_nodes",
            "question_assets",
            "question_asset_links",
            "question_revisions",
            "question_reviews",
            "library_import_batches",
            "taxonomy_sources",
            "taxonomy_items",
            "taxonomy_mappings",
            "graph_transfer_receipts",
        }


def test_backup_restore_round_trip(client, settings):
    db = settings.data_dir / "workbench.sqlite3"
    with sqlite3.connect(db) as con:
        con.execute(
            "INSERT INTO app_metadata VALUES ('test_fixture','original-demo-value')"
        )
    r = client.post("/api/backups", json={}, headers=HEADERS)
    assert r.status_code == 201 and r.json()["verified"]
    name = r.json()["name"]
    with sqlite3.connect(db) as con:
        con.execute(
            "UPDATE app_metadata SET value='changed-demo-value' WHERE key='test_fixture'"
        )
    restore = client.post(
        "/api/backups/restore",
        json={"name": name, "confirmation": "恢复当前工作台"},
        headers=HEADERS,
    )
    assert restore.status_code == 200 and restore.json()["restored"]
    with sqlite3.connect(db) as con:
        assert (
            con.execute(
                "SELECT value FROM app_metadata WHERE key='test_fixture'"
            ).fetchone()[0]
            == "original-demo-value"
        )
    with sqlite3.connect(settings.backup_dir / restore.json()["safety_backup"]) as con:
        assert (
            con.execute(
                "SELECT value FROM app_metadata WHERE key='test_fixture'"
            ).fetchone()[0]
            == "changed-demo-value"
        )
    items = client.get("/api/backups").json()["items"]
    assert len(items) == 2 and all(x["valid"] for x in items)


@pytest.mark.parametrize(
    "body", [{"name": "x", "confirmation": "yes"}, {"name": "x"}, {}]
)
def test_requires_explicit_confirmation(client, body):
    r = client.post("/api/backups/restore", json=body, headers=HEADERS)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize(
    "name", ["../workbench.sqlite3", "/tmp/example.sqlite3", "not-a-backup"]
)
def test_rejects_traversal(client, name):
    r = client.post(
        "/api/backups/restore",
        json={"name": name, "confirmation": "恢复当前工作台"},
        headers=HEADERS,
    )
    assert r.status_code == 409


def test_corrupt_and_foreign_backup(client, settings, tmp_path):
    name = client.post("/api/backups", json={}, headers=HEADERS).json()["name"]
    backup = settings.backup_dir / name
    backup.write_bytes(b"not sqlite")
    assert not client.get("/api/backups").json()["items"][0]["valid"]
    r = client.post(
        "/api/backups/restore",
        json={"name": name, "confirmation": "恢复当前工作台"},
        headers=HEADERS,
    )
    assert r.status_code == 409
    foreign = Storage(
        Settings(
            data_dir=tmp_path / "foreign-data", backup_dir=tmp_path / "foreign-backups"
        )
    )
    foreign.initialize()
    backup.write_bytes(foreign.db.read_bytes())
    assert (
        client.post(
            "/api/backups/restore",
            json={"name": name, "confirmation": "恢复当前工作台"},
            headers=HEADERS,
        ).status_code
        == 409
    )
    assert client.get("/api/health").json()["status"] == "ok"
    foreign.close()


def test_rejects_unknown_directory(settings):
    settings.data_dir.mkdir()
    unknown = settings.data_dir / "old.sqlite3"
    unknown.write_bytes(b"unknown-old-data")
    with pytest.raises(StorageError, match="非空"):
        Storage(settings).initialize()
    assert unknown.read_bytes() == b"unknown-old-data"


def test_rejects_unknown_db_even_with_owner(client, settings):
    storage = client.app.state.storage
    original = storage.db.read_bytes()
    storage.db.write_bytes(b"unknown")
    with pytest.raises(StorageError):
        storage.initialize()
    assert storage.db.read_bytes() == b"unknown"
    storage.db.write_bytes(original)


def test_symlink_backup(client, settings, tmp_path):
    name = client.post("/api/backups", json={}, headers=HEADERS).json()["name"]
    path = settings.backup_dir / name
    target = tmp_path / "untouched.sqlite3"
    path.rename(target)
    path.symlink_to(target)
    assert (
        client.post(
            "/api/backups/restore",
            json={"name": name, "confirmation": "恢复当前工作台"},
            headers=HEADERS,
        ).status_code
        == 409
    )
    assert target.is_file()


def test_write_guard_and_error_format(client):
    assert client.post("/api/backups", json={}).status_code == 403
    assert (
        client.post(
            "/api/backups",
            json={},
            headers={**HEADERS, "Origin": "https://example.com"},
        ).status_code
        == 403
    )
    assert client.get("/api/missing").json()["error"]["code"] == "HTTP_ERROR"


def test_restart_is_idempotent(settings):
    first = Storage(settings)
    first.initialize()
    identity = first.instance
    first.close()
    second = Storage(settings)
    second.initialize()
    assert second.instance == identity
    assert second.status()["connected"]
    second.close()


def test_single_backend_owner(client, settings):
    other = Storage(settings)
    with pytest.raises(StorageError, match="另一个"):
        other.initialize()
    other.close()


@pytest.mark.parametrize(
    "data,backups",
    [
        ("relative/data", "/tmp/test-backups"),
        ("/tmp/same", "/tmp/same"),
        ("/tmp/same", "/tmp/same/backups"),
    ],
)
def test_unsafe_paths_rejected(data, backups):
    with pytest.raises(ValueError):
        Settings(data_dir=data, backup_dir=backups).checked()
