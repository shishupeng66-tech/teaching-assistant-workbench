import io
import json
import sqlite3
import hashlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from fastapi.testclient import TestClient
from alembic import command
from alembic.config import Config
from openpyxl import Workbook
from app.main import create_app
from app.services.storage import Storage
from test_storage_api import client, settings, HEADERS


def post(client, path, data, expected=200):
    response = client.post("/api" + path, json=data, headers=HEADERS)
    assert response.status_code == expected, response.text
    return response.json()


def group(client, name="测试一班"):
    return post(
        client,
        "/classes",
        {
            "name": name,
            "school_year": "2026-2027",
            "grade": "七年级",
            "class_number": "1",
        },
        201,
    )


def pupil(client, g, name="模拟甲", number=None):
    return post(
        client,
        "/students",
        {"name": name, "class_id": g["id"], "student_no": number},
        201,
    )


def room(client, g):
    return client.get(f"/api/classes/{g['id']}/layout").json()


def seat(client, g, assignments, version=None, rows=4, columns=6, expected=200):
    return post(
        client,
        f"/classes/{g['id']}/layout",
        {
            "rows": rows,
            "columns": columns,
            "expected_version": version or room(client, g)["version"],
            "assignments": assignments,
        },
        expected,
    )


def a(s, row=1, column=1):
    return {"student_id": s["id"], "row": row, "column": column}


def test_class_create_edit_archive_and_history(client):
    first = group(client)
    second = group(client)
    assert first["id"] != second["id"]
    s = pupil(client, first)
    post(
        client,
        f"/classes/{first['id']}/update",
        {
            "name": "改名班",
            "school_year": "2027-2028",
            "grade": "八年级",
            "class_number": "2",
        },
    )
    history = client.get("/api/students/" + s["id"]).json()["history"]
    assert (
        history[1]["class_name"] == "测试一班"
        and history[1]["school_year"] == "2026-2027"
    )
    assert (
        history[0]["school_year"] == "2027-2028"
        and history[1]["end_reason"] == "班级学年信息调整"
    )
    post(client, f"/classes/{first['id']}/archive", {"confirmation": "确认归档"})
    assert len(client.get("/api/classes").json()["items"]) == 1
    assert (
        client.get("/api/classes?archived=true").json()["items"][0]["student_count"]
        == 1
    )
    assert (
        client.get("/api/students/" + s["id"]).json()["current_class"]["archived"] == 1
    )
    post(client, "/students", {"name": "不能新增", "class_id": first["id"]}, 409)
    post(
        client,
        f"/classes/{first['id']}/update",
        {"name": "禁止", "school_year": "2028"},
        409,
    )
    post(client, f"/students/{s['id']}/transfer", {"class_id": second["id"]})
    assert len(client.get("/api/students/" + s["id"]).json()["history"]) == 3
    assert {
        e["action"]
        for e in client.get(f"/api/classes/{first['id']}/operations").json()["items"]
    } == {"class.create", "class.update", "class.archive"}


def test_student_identity_same_name_edit_search_and_conflicts(client):
    g = group(client)
    s1 = pupil(client, g, "同名模拟", "001")
    s2 = pupil(client, g, "同名模拟", "002")
    s3 = pupil(client, g, "同名模拟")
    assert len({s1["id"], s2["id"], s3["id"]}) == 3
    assert len(client.get("/api/students?q=同名模拟").json()["items"]) == 3
    assert client.get("/api/students?q=001").json()["items"][0]["id"] == s1["id"]
    updated = post(
        client,
        f"/students/{s1['id']}/update",
        {
            "name": "修改模拟",
            "student_no": "003",
            "gender": "女",
            "entry_year": 2020,
            "notes": "仅测试",
        },
    )
    assert updated["id"] == s1["id"] and updated["notes"] == "仅测试"
    post(
        client,
        f"/students/{s1['id']}/update",
        {"name": "不应保存", "student_no": "002"},
        409,
    )
    assert client.get("/api/students/" + s1["id"]).json()["name"] == "修改模拟"
    assert client.get("/api/students?q=%25").json()["items"] == []
    assert (
        client.get("/api/students?q=" + s1["id"]).json()["items"][0]["id"] == s1["id"]
    )
    post(client, "/students", {"name": "  ", "class_id": g["id"]}, 422)
    post(
        client,
        "/students",
        {"name": "模拟", "class_id": g["id"], "entry_year": 1800},
        422,
    )


def test_transfer_release_history_and_archive(client):
    g = group(client)
    target = group(client, "测试二班")
    s = pupil(client, g)
    old = seat(client, g, [a(s)])
    moved = post(client, f"/students/{s['id']}/transfer", {"class_id": target["id"]})
    assert moved["id"] == s["id"] and moved["seat"] is None
    assert (
        room(client, g)["assignments"] == []
        and room(client, g)["version"] == old["version"] + 1
    )
    history = client.get("/api/students/" + s["id"]).json()["history"]
    assert (
        len(history) == 2
        and history[1]["end_reason"] == "转班"
        and history[0]["ended_at"] is None
    )
    post(client, f"/students/{s['id']}/transfer", {"class_id": target["id"]}, 409)
    seat(client, target, [a(s, 2, 2)])
    post(client, f"/students/{s['id']}/archive", {"confirmation": "确认归档"})
    archived = client.get("/api/students/" + s["id"]).json()
    assert (
        archived["status"] == "archived"
        and archived["current_class"] is None
        and archived["seat"] is None
    )
    assert (
        len(archived["history"]) == 2
        and archived["history"][0]["end_reason"] == "学生归档"
    )
    assert room(client, target)["assignments"] == []
    assert client.get("/api/students?archived=true").json()["items"][0]["id"] == s["id"]
    post(client, f"/students/{s['id']}/update", {"name": "不能编辑"}, 409)
    assert {
        "student.create",
        "student.transfer",
        "student.archive",
        "seat.change",
        "seat.release",
    } <= {x["action"] for x in archived["operations"]}


def test_layout_swap_clear_dimensions_and_stale_version(client):
    g = group(client)
    s1 = pupil(client, g, "模拟甲")
    s2 = pupil(client, g, "模拟乙")
    first = seat(client, g, [a(s1), a(s2, 1, 2)])
    swapped = seat(client, g, [a(s2), a(s1, 1, 2)], first["version"], rows=3, columns=5)
    assert [(x["student_id"], x["column"]) for x in room(client, g)["assignments"]] == [
        (s2["id"], 1),
        (s1["id"], 2),
    ]
    seat(client, g, [a(s1)], first["version"], expected=409)
    assert room(client, g)["version"] == swapped["version"]
    seat(client, g, [a(s1, 1, 2)], rows=1, columns=1, expected=409)
    assert room(client, g)["assignments"] == swapped["assignments"]
    cleared = seat(client, g, [a(s1, 1, 2)])
    assert len(cleared["assignments"]) == 1
    assert client.get("/api/students/" + s2["id"]).json()["seat"] is None
    assert client.get("/api/students/" + s1["id"]).json()["seat"]["column"] == 2


@pytest.mark.parametrize(
    "case", ["position", "student", "foreign", "archived", "bounds"]
)
def test_invalid_seating_is_atomic(client, case):
    g = group(client)
    foreign = group(client, "其他班")
    s1 = pupil(client, g)
    s2 = pupil(client, g, "模拟乙")
    outsider = pupil(client, foreign)
    initial = seat(client, g, [a(s1)])
    data = {
        "position": [a(s1), a(s2)],
        "student": [a(s1), a(s1, 1, 2)],
        "foreign": [a(outsider)],
        "archived": [a(s2)],
        "bounds": [a(s1, 5, 1)],
    }[case]
    if case == "archived":
        post(client, f"/students/{s2['id']}/archive", {"confirmation": "确认归档"})
    seat(client, g, data, initial["version"], expected=409)
    assert room(client, g) == initial


def test_simultaneous_seat_save_only_one_version_wins(client):
    g = group(client)
    s = pupil(client, g)
    body = {"rows": 4, "columns": 6, "expected_version": 1, "assignments": [a(s)]}
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(
            pool.map(
                lambda _: (
                    client.post(
                        f"/api/classes/{g['id']}/layout", json=body, headers=HEADERS
                    ).status_code
                ),
                range(4),
            )
        )
    assert results.count(200) == 1 and results.count(409) == 3
    assert room(client, g)["version"] == 2


def test_database_unique_foreign_key_and_membership_guards(client):
    g = group(client)
    other = group(client, "其他班")
    s = pupil(client, g)
    foreign = pupil(client, other)
    seat(client, g, [a(s)])
    engine = client.app.state.storage.engine
    for sql, params in [
        (
            "INSERT INTO seat_assignments VALUES (:c,2,2,:s)",
            {"c": g["id"], "s": s["id"]},
        ),
        (
            "INSERT INTO seat_assignments VALUES (:c,2,2,:s)",
            {"c": g["id"], "s": foreign["id"]},
        ),
        (
            "INSERT INTO seat_assignments VALUES (:c,2,2,:s)",
            {"c": g["id"], "s": "missing"},
        ),
        ("UPDATE classroom_layouts SET rows=0 WHERE class_id=:c", {"c": g["id"]}),
    ]:
        with pytest.raises(IntegrityError):
            with engine.begin() as con:
                con.execute(text(sql), params)
    assert len(room(client, g)["assignments"]) == 1


def workbook(rows, headers=None):
    wb = Workbook()
    ws = wb.active
    ws.title = "学生导入"
    ws.append(headers or ["姓名", "学号", "性别", "入学年份", "备注"])
    for row in rows:
        ws.append(row)
    data = io.BytesIO()
    wb.save(data)
    return data.getvalue()


def upload(
    client,
    g,
    data,
    action="import-preview",
    policy="reject",
    expected=200,
    filename="test.xlsx",
):
    response = client.post(
        f"/api/classes/{g['id']}/{action}",
        files={
            "file": (
                filename,
                data,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        data={"policy": policy},
        headers=HEADERS,
    )
    assert response.status_code == expected, response.text
    return response.json()


def test_excel_template_import_same_name_and_exact_retry(client):
    template = client.get("/api/student-import/template")
    assert template.status_code == 200 and template.content[:2] == b"PK"
    g = group(client)
    data = workbook(
        [
            ["同名模拟", "001", "男", 2020, "模拟"],
            ["同名模拟", "002", None, None, None],
            ["无学号模拟", None, None, None, None],
        ]
    )
    preview = upload(client, g, data)
    assert preview["valid_count"] == 3
    assert client.get("/api/students").json()["items"] == []
    imported = upload(client, g, data, "import")
    assert imported["imported_count"] == 3 and len(set(imported["student_ids"])) == 3
    repeated = upload(client, g, data, "import")
    assert (
        repeated["already_imported"]
        and repeated["student_ids"] == imported["student_ids"]
    )
    assert len(client.get("/api/students").json()["items"]) == 3


def test_excel_duplicate_skip_never_updates_existing(client):
    g = group(client)
    old = pupil(client, g, "已存在模拟", "001")
    data = workbook([["不能覆盖", "001"], ["新模拟", "002"], ["文件重复", "002"]])
    preview = upload(client, g, data)
    assert preview["duplicate_count"] == 2 and preview["valid_count"] == 1
    upload(client, g, data, "import", expected=422)
    assert len(client.get("/api/students").json()["items"]) == 1
    result = upload(client, g, data, "import", policy="skip")
    assert result["imported_count"] == 1 and result["skipped_count"] == 2
    assert client.get("/api/students/" + old["id"]).json()["name"] == "已存在模拟"


@pytest.mark.parametrize(
    "row",
    [
        [None, "001"],
        ["模拟", 123],
        ["模拟", "001", "未知"],
        ["模拟", "001", None, 2020.5],
        ["=1+1", "001"],
        ["模拟", "001", None, 2020, "x" * 2001],
    ],
)
def test_excel_errors_reject_entire_batch(client, row):
    g = group(client)
    data = workbook([["有效模拟", "900"], row])
    preview = upload(client, g, data)
    assert preview["error_count"] == 1
    upload(client, g, data, "import", policy="skip", expected=422)
    assert client.get("/api/students").json()["items"] == []


def test_excel_bad_files_limit_and_no_number_duplicates(client):
    g = group(client)
    upload(client, g, b"not-xlsx", expected=400)
    upload(client, g, workbook([["模拟"]]), filename="test.xls", expected=400)
    upload(client, g, workbook([["模拟"]], ["错误表头"]), expected=400)
    upload(client, g, workbook([[f"模拟{i}"] for i in range(1001)]), expected=400)
    dup = workbook([["无号模拟"], ["无号模拟"]])
    assert upload(client, g, dup)["duplicate_count"] == 1
    assert upload(client, g, dup, "import", policy="skip")["imported_count"] == 1


def legacy_storage(settings):
    st = Storage(settings)
    st.instance = st._claim(settings.data_dir, "data")
    st._claim(settings.backup_dir, "backups", st.instance)
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[1] / "migrations")
    )
    config.attributes.update(db_path=st.db, instance_id=st.instance)
    command.upgrade(config, "0001")
    with sqlite3.connect(st.db) as con:
        con.execute("INSERT INTO app_metadata VALUES ('legacy-fixture','kept')")
    return st


def test_legacy_upgrade_backup_and_legacy_restore(settings):
    st = legacy_storage(settings)
    st.close()
    st = Storage(settings)
    st.initialize()
    assert st.status()["migration"] == "0006"
    snapshots = list(settings.backup_dir.glob("before-migrate-*.sqlite3"))
    assert len(snapshots) == 1
    old_hash = hashlib.sha256(snapshots[0].read_bytes()).hexdigest()
    with sqlite3.connect(snapshots[0]) as con:
        assert con.execute("SELECT version_num FROM alembic_version").fetchone() == (
            "0001",
        )
    with sqlite3.connect(st.db) as con:
        assert con.execute(
            "SELECT value FROM app_metadata WHERE key='legacy-fixture'"
        ).fetchone() == ("kept",)
    st.restore(snapshots[0].name)
    assert (
        st.status()["migration"] == "0006"
        and old_hash == hashlib.sha256(snapshots[0].read_bytes()).hexdigest()
    )
    journal = (settings.data_dir / "storage-events.jsonl").read_text()
    assert "migration.prepared" in journal and "restore.completed" in journal
    st.close()


def test_business_backup_restore_and_persistence(settings):
    with TestClient(create_app(settings)) as c:
        g = group(c)
        s = pupil(c, g, "备份模拟", "B001")
        seat(c, g, [a(s, 2, 3)])
        backup = post(c, "/backups", {}, 201)["name"]
        post(
            c,
            f"/students/{s['id']}/update",
            {"name": "改后模拟", "student_no": "B001", "notes": "修改后"},
        )
        safety = post(
            c, "/backups/restore", {"name": backup, "confirmation": "恢复当前工作台"}
        )["safety_backup"]
        restored = c.get("/api/students/" + s["id"]).json()
        assert restored["name"] == "备份模拟" and restored["seat"]["column"] == 3
        with sqlite3.connect(settings.backup_dir / safety) as con:
            assert con.execute(
                "SELECT name FROM students WHERE id=?", (s["id"],)
            ).fetchone() == ("改后模拟",)
    with TestClient(create_app(settings)) as c:
        assert c.get("/api/students/" + s["id"]).json()["seat"]["row"] == 2
        assert c.get("/api/classes").json()["items"][0]["id"] == g["id"]
        assert room(c, g)["rows"] == 4
