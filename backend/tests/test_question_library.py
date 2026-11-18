import io, json, sqlite3, hashlib
from pathlib import Path
import pytest
from PIL import Image
from openpyxl import Workbook
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from alembic import command
from alembic.config import Config
from app.services.storage import Storage
from app.services.rich_content import document
from test_storage_api import client, settings, HEADERS


def post(c, path, data, expected=200):
    r = c.post("/api/library" + path, json=data, headers=HEADERS)
    assert r.status_code == expected, r.text
    return r.json()


def catalog(c):
    return c.get("/api/library/catalog").json()


def metadata(c, category, **data):
    return post(c, "/catalog/" + category, data)


def subject(c, name="化学", code="CHEM"):
    return metadata(c, "subjects", name=name, code=code)


def edition(c, s, name="教师自建验证版本"):
    return metadata(c, "editions", name=name, subject_id=s["id"])


def book(c, e, grade="九年级", volume="上册"):
    return metadata(c, "books", edition_id=e["id"], grade=grade, volume=volume)


def node(c, b, name="第一章", parent=None, position=10):
    return metadata(
        c,
        "nodes",
        book_id=b["id"],
        name=name,
        parent_id=parent,
        position=position,
        kind="lesson" if parent else "chapter",
    )


def point(c, s, code="CHEM-001", name="物质组成", **extra):
    return post(
        c,
        "/knowledge-points",
        {"subject_id": s["id"], "code": code, "name": name, **extra},
    )


def environment(c):
    s = subject(c)
    e = edition(c, s)
    b = book(c, e)
    n = node(c, b)
    return s, e, b, n


def question_body(s, title="验证物质组成与化学变化", **extra):
    return {
        "subject_id": s["id"],
        "grade": "九年级",
        "question_type": "简答题",
        "difficulty": 2,
        "stem": document(title),
        "answer": document("明确的标准答案"),
        "explanation": document("教师核实的解析"),
        "confirm_similarity": True,
        **extra,
    }


def question(c, s, title="验证物质组成与化学变化", **extra):
    return post(c, "/questions", question_body(s, title, **extra))


def detail(c, qid):
    return c.get("/api/library/questions/" + qid).json()


def review(c, q, action, **extra):
    return post(
        c,
        f"/questions/{q['id']}/review",
        {"action": action, "expected_version": q["version"], **extra},
    )


def svg_or_png(fmt="PNG"):
    stream = io.BytesIO()
    Image.new("RGB", (24, 18), (50, 120, 200)).save(stream, format=fmt)
    return stream.getvalue()


def upload_asset(c, content=None, name="test.png", expected=200):
    response = c.post(
        "/api/library/assets",
        files={"file": (name, content or svg_or_png(), "image/png")},
        headers=HEADERS,
    )
    assert response.status_code == expected, response.text
    return response.json()


def test_catalog_tree_order_edit_disable_and_scope_constraints(client):
    s, e, b, n = environment(client)
    child = node(client, b, "课时一", n["id"])
    another = node(client, b, "第二章", position=20)
    post(client, "/nodes/" + another["id"] + "/order", {"direction": "up"})
    nodes = catalog(client)["nodes"]
    assert (
        next(x for x in nodes if x["id"] == another["id"])["position"]
        < next(x for x in nodes if x["id"] == n["id"])["position"]
    )
    post(
        client,
        "/catalog/nodes/" + n["id"],
        {"name": "改名第一章", "book_id": b["id"], "parent_id": child["id"]},
        409,
    )
    other = book(client, e, volume="下册")
    foreign = node(client, other, "跨册节点")
    post(
        client,
        "/catalog/nodes/" + child["id"],
        {"name": "不能跨册", "book_id": b["id"], "parent_id": foreign["id"]},
        409,
    )
    renamed = post(
        client,
        "/catalog/nodes/" + n["id"],
        {"name": "改名第一章", "book_id": b["id"], "active": False},
    )
    assert renamed["id"] == n["id"] and renamed["active"] == 0
    assert (
        client.delete(
            "/api/library/catalog/nodes/" + n["id"], headers=HEADERS
        ).status_code
        == 405
    )
    with client.app.state.storage.engine.begin() as connection:
        assert (
            connection.execute(text("SELECT COUNT(*) FROM curriculum_nodes")).scalar()
            == 4
        )


def test_knowledge_parent_relations_multi_version_mapping_and_disable(client):
    s, e, b, n = environment(client)
    e2 = edition(client, s, "另一验证版本")
    b2 = book(client, e2)
    n2 = node(client, b2, "第一单元")
    p1 = point(client, s, node_ids=[n["id"], n2["id"]])
    p2 = point(
        client,
        s,
        code="CHEM-002",
        name="化学式",
        prerequisite_ids=[p1["id"]],
        related_ids=[p1["id"]],
        parent_id=p1["id"],
    )
    assert (
        len(client.get("/api/library/knowledge-points/" + p1["id"]).json()["node_ids"])
        == 2
    )
    assert client.get("/api/library/knowledge-points/" + p1["id"]).json()[
        "related_ids"
    ] == [p2["id"]]
    post(
        client,
        "/knowledge-points/" + p1["id"],
        {
            "subject_id": s["id"],
            "code": p1["code"],
            "name": p1["name"],
            "parent_id": p2["id"],
        },
        409,
    )
    post(
        client,
        "/knowledge-points/" + p1["id"],
        {
            "subject_id": s["id"],
            "code": p1["code"],
            "name": p1["name"],
            "prerequisite_ids": [p2["id"]],
        },
        409,
    )
    q = question(
        client,
        s,
        knowledge_links=[
            {"knowledge_point_id": p1["id"], "is_primary": True},
            {"knowledge_point_id": p2["id"], "weight": 0.3},
        ],
    )
    stopped = post(
        client,
        "/knowledge-points/" + p1["id"],
        {
            "subject_id": s["id"],
            "code": p1["code"],
            "name": "停用但保留",
            "active": False,
            "node_ids": [n["id"], n2["id"]],
        },
    )
    assert stopped["id"] == p1["id"] and detail(client, q["id"])["knowledge_links"][0][
        "knowledge_point_id"
    ] in {p1["id"], p2["id"]}
    assert (
        client.delete(
            "/api/library/knowledge-points/" + p1["id"], headers=HEADERS
        ).status_code
        == 405
    )
    # Search metadata is the same persisted source used by the knowledge UI.
    assert any(
        p["code"] == p2["code"] and p["name"] == "化学式"
        for p in catalog(client)["points"]
    )
    post(
        client, "/nodes/" + n["id"] + "/knowledge", {"knowledge_point_ids": [p2["id"]]}
    )
    assert len([m for m in catalog(client)["mappings"] if m["node_id"] == n["id"]]) == 1


def test_cross_subject_invalid_associations_are_atomic(client):
    s, e, b, n = environment(client)
    other = subject(client, "物理", "PHYS")
    p = point(client, other, code="PHY-1")
    other_e = edition(client, other)
    other_b = book(client, other_e)
    other_n = node(client, other_b)
    post(
        client,
        "/nodes/" + n["id"] + "/knowledge",
        {"knowledge_point_ids": [p["id"]]},
        409,
    )
    post(
        client,
        "/questions",
        question_body(s, knowledge_links=[{"knowledge_point_id": p["id"]}]),
        409,
    )
    post(client, "/questions", question_body(s, node_ids=[other_n["id"]]), 409)
    assert client.get("/api/library/questions").json()["total"] == 0
    assert catalog(client)["mappings"] == []


@pytest.mark.parametrize(
    "typ",
    ["单选题", "多选题", "判断题", "填空题", "简答题", "计算题", "实验题", "综合题"],
)
def test_all_question_types_and_multiple_point_weights(client, typ):
    s, e, b, n = environment(client)
    a = point(client, s)
    bpoint = point(client, s, code="CHEM-2", name="反应规律")
    q = question(
        client,
        s,
        title=typ + "教师编写的验证题",
        question_type=typ,
        node_ids=[n["id"]],
        knowledge_links=[
            {
                "knowledge_point_id": a["id"],
                "is_primary": True,
                "weight": 0.7,
                "part_refs": ["a"],
            },
            {"knowledge_point_id": bpoint["id"], "weight": 0.3},
        ],
        parts=[{"ref": "a", "max_score": 3, "rubric": document("说明依据")}],
    )
    data = detail(client, q["id"])
    assert (
        data["status"] == "draft"
        and data["version"] == 1
        and len(data["knowledge_links"]) == 2
    )
    assert data["parts"][0]["max_score"] == 3 and data["node_ids"] == [n["id"]]
    assert data["revisions"][0]["snapshot"]["stem"] == q["stem"]


def test_review_state_versions_and_old_content_are_immutable(client):
    s = subject(client)
    q = question(client, s)
    post(
        client,
        f"/questions/{q['id']}/review",
        {"action": "approve", "expected_version": q["version"]},
        409,
    )
    pending = review(client, q, "submit")
    approved = review(client, pending, "approve", note="教师确认答案及解析")
    assert approved["status"] == "approved"
    old = detail(client, q["id"])["revisions"][0]["snapshot"]
    edited = post(
        client,
        "/questions/" + q["id"],
        question_body(s, "修改后的第二版本题干", expected_version=approved["version"]),
    )
    assert edited["status"] == "draft" and edited["id"] == q["id"]
    revisions = detail(client, q["id"])["revisions"]
    assert (
        next(r["snapshot"] for r in revisions if r["version"] == approved["version"])
        == old
    )
    post(
        client,
        "/questions/" + q["id"],
        question_body(s, "过期写入", expected_version=approved["version"]),
        409,
    )
    p = review(client, edited, "submit")
    post(
        client,
        f"/questions/{q['id']}/review",
        {"action": "reject", "expected_version": p["version"]},
        422,
    )
    rejected = review(client, p, "reject", note="解析需要补全")
    archived = review(client, rejected, "archive")
    assert archived["status"] == "archived"
    post(
        client,
        "/questions/" + q["id"],
        question_body(s, expected_version=archived["version"]),
        409,
    )
    assert len(detail(client, q["id"])["reviews"]) == 5


def test_unanswered_cannot_become_reviewed_and_no_injected_state(client):
    s = subject(client)
    q = question(client, s, answer=document(""))
    post(
        client,
        f"/questions/{q['id']}/review",
        {"action": "submit", "expected_version": 1},
        409,
    )
    post(client, "/questions", question_body(s, status="approved"), 422)
    post(
        client, "/questions", question_body(s, parts=[{"ref": "a"}, {"ref": "a"}]), 409
    )


def test_duplicate_normalization_prompts_and_keeps_independent_ids(client):
    s = subject(client)
    q = question(client, s, "H₂O 的组成与性质")
    result = post(
        client,
        "/questions/duplicates",
        {"subject_id": s["id"], "stem": document(" H2O 的 组成与性质！")},
    )
    assert result["items"][0]["id"] == q["id"] and result["items"][0]["similarity"] == 1
    post(
        client,
        "/questions",
        question_body(s, "H2O 的组成与性质", confirm_similarity=False),
        409,
    )
    separate = question(client, s, "H2O 的组成与性质", confirm_similarity=True)
    assert (
        separate["id"] != q["id"]
        and client.get("/api/library/questions").json()["total"] == 2
    )
    assert client.get("/api/library/questions?q=H₂O").json()["total"] == 2


def test_chapter_reuse_descendant_distinct_statistics_paging_and_filters(client):
    s, e, b, n = environment(client)
    child = node(client, b, "第一课时", n["id"])
    p = point(client, s, node_ids=[n["id"], child["id"]])
    e2 = edition(client, s, "验证第二版本")
    b2 = book(client, e2)
    node2 = node(client, b2, "第二版单元")
    q = question(
        client,
        s,
        node_ids=[n["id"], child["id"], node2["id"]],
        knowledge_links=[{"knowledge_point_id": p["id"]}],
    )
    other = question(
        client,
        s,
        "完全不同的实验安全现象问题",
        question_type="实验题",
        difficulty=5,
        node_ids=[child["id"]],
    )
    pending = review(client, q, "submit")
    review(client, pending, "approve")
    exact = client.get("/api/library/statistics", params={"node_id": n["id"]}).json()
    subtree = client.get(
        "/api/library/statistics", params={"node_id": n["id"], "descendants": True}
    ).json()
    assert (
        exact["total"] == 1
        and subtree["total"] == 2
        and subtree["approved"] == 1
        and subtree["knowledge_covered"] == 1
    )
    assert subtree["types"] == {"简答题": 1, "实验题": 1}
    page = client.get(
        "/api/library/questions",
        params={"node_id": n["id"], "descendants": True, "page_size": 1, "page": 2},
    ).json()
    assert page["total"] == 2 and len(page["items"]) == 1
    assert (
        client.get("/api/library/questions?question_type=实验题&difficulty=5").json()[
            "items"
        ][0]["id"]
        == other["id"]
    )
    assert client.get("/api/library/questions?status=approved").json()["total"] == 1
    assert len(detail(client, q["id"])["chapter_references"]) == 3
    post(
        client,
        "/catalog/nodes/" + n["id"],
        {"book_id": b["id"], "name": "改名章节", "position": 90},
    )
    assert (
        detail(client, q["id"])["knowledge_links"][0]["knowledge_point_id"] == p["id"]
    )
    assert len(detail(client, q["id"])["node_ids"]) == 3
    post(client, "/nodes/" + node2["id"] + "/questions", {"question_id": other["id"]})
    repeated = post(
        client, "/nodes/" + node2["id"] + "/questions", {"question_id": other["id"]}
    )
    assert (
        repeated["already_linked"]
        and client.get("/api/library/questions").json()["total"] == 2
    )


@pytest.mark.parametrize(
    "bad",
    [
        {"type": "doc", "content": [{"type": "script", "text": "alert(1)"}]},
        {
            "type": "doc",
            "content": [
                {"type": "paragraph", "attrs": {"onclick": "bad"}, "content": []}
            ],
        },
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "asset",
                            "attrs": {
                                "assetId": "a" * 32,
                                "src": "https://external.test/a",
                            },
                        }
                    ],
                }
            ],
        },
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "math",
                            "attrs": {"latex": r"\href{https://evil.test}{x}"},
                        }
                    ],
                }
            ],
        },
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "x",
                            "marks": [
                                {
                                    "type": "link",
                                    "attrs": {"href": "javascript:alert(1)"},
                                }
                            ],
                        }
                    ],
                }
            ],
        },
        {"type": "doc", "content": [{"type": "paragraph", "attrs": [], "content": []}]},
    ],
)
def test_rich_text_rejects_scripts_external_urls_and_invalid_nodes(client, bad):
    s = subject(client)
    post(client, "/questions", question_body(s, stem=bad), 422)


def test_chemical_math_table_subscripts_and_image_persist(client):
    s = subject(client)
    asset = upload_asset(client)
    stem = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "SO"},
                    {"type": "text", "text": "4", "marks": [{"type": "subscript"}]},
                    {"type": "text", "text": "2−", "marks": [{"type": "superscript"}]},
                    {"type": "math", "attrs": {"latex": r"\ce{2H2 + O2 -> 2H2O}"}},
                    {
                        "type": "asset",
                        "attrs": {"assetId": asset["id"], "alt": "验证图片"},
                    },
                ],
            },
            {
                "type": "table",
                "content": [
                    {
                        "type": "tableRow",
                        "content": [
                            {
                                "type": "tableHeader",
                                "content": [
                                    {
                                        "type": "paragraph",
                                        "content": [{"type": "text", "text": "质量"}],
                                    }
                                ],
                            },
                            {
                                "type": "tableCell",
                                "content": [
                                    {
                                        "type": "paragraph",
                                        "content": [{"type": "text", "text": "守恒"}],
                                    }
                                ],
                            },
                        ],
                    }
                ],
            },
        ],
    }
    q = question(client, s, stem=stem)
    loaded = detail(client, q["id"])
    assert loaded["stem"]["content"][0]["content"][4]["attrs"]["assetId"] == asset["id"]
    response = client.get("/api/library/assets/" + asset["id"] + "/file")
    assert (
        response.status_code == 200
        and hashlib.sha256(response.content).hexdigest() == asset["sha256"]
    )
    assert response.headers["x-content-type-options"] == "nosniff"
    assert (
        client.app.state.storage.settings.data_dir / "assets" / asset["storage_name"]
    ).is_file()


@pytest.mark.parametrize(
    "content,name",
    [
        (b'<svg onload="alert(1)"></svg>', "bad.svg"),
        (b"not image", "bad.png"),
        (svg_or_png(), "../bad.png"),
        (svg_or_png(), "bad.jpg"),
        (b"x" * (5 * 1024 * 1024 + 1), "big.png"),
    ],
)
def test_unsafe_assets_are_rejected(client, content, name):
    upload_asset(client, content, name, 400)


def workbook(rows, kind="questions"):
    from app.services.library_import import Q_HEADERS, N_HEADERS

    wb = Workbook()
    ws = wb.active
    ws.title = "题目导入" if kind == "questions" else "目录导入"
    ws.append(Q_HEADERS if kind == "questions" else N_HEADERS)
    for row in rows:
        ws.append(row)
    stream = io.BytesIO()
    wb.save(stream)
    return stream.getvalue()


def import_file(
    client,
    kind,
    scope,
    content,
    action="preview",
    policy="reject",
    confirmation="",
    expected=200,
):
    response = client.post(
        f"/api/library/import/{kind}/{action}",
        files={
            "file": (
                "validated.xlsx",
                content,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        data={"scope_id": scope, "policy": policy, "confirmation": confirmation},
        headers=HEADERS,
    )
    assert response.status_code == expected, response.text
    return response.json()


def test_question_excel_chapter_resolution_duplicates_and_draft_import(client):
    s, e, b, n = environment(client)
    p = point(client, s)
    assert client.get("/api/library/import/questions/template").content[:2] == b"PK"
    row = [
        "简答题",
        r"验证 $\ce{H2O}$ 组成",
        "氢和氧",
        "从元素理解",
        2,
        "教师验证",
        "CHEM",
        e["name"],
        "九年级",
        "上册",
        n["name"],
        p["code"],
    ]
    file = workbook([row])
    preview = import_file(client, "questions", s["id"], file)
    assert (
        preview["valid_count"] == 1
        and client.get("/api/library/questions").json()["total"] == 0
    )
    imported = import_file(client, "questions", s["id"], file, "commit")
    q = detail(client, imported["created_ids"][0])
    assert (
        q["status"] == "draft"
        and q["node_ids"] == [n["id"]]
        and q["knowledge_links"][0]["knowledge_point_id"] == p["id"]
    )
    assert import_file(client, "questions", s["id"], file, "commit")["already_imported"]
    variant = workbook([row, ["判断题", "另一条不同性质题干", "正确", "", 1]])
    assert import_file(client, "questions", s["id"], variant)["duplicate_count"] == 1
    import_file(client, "questions", s["id"], variant, "commit", expected=422)
    result = import_file(client, "questions", s["id"], variant, "commit", policy="skip")
    assert result["imported_count"] == 1 and result["skipped_count"] == 1


def test_unknown_or_ambiguous_excel_paths_never_create_or_mislink_nodes(client):
    s, e, b, n = environment(client)
    row = [
        "简答题",
        "检查目录解析",
        "答案",
        "",
        2,
        "",
        "CHEM",
        e["name"],
        "九年级",
        "上册",
        "未知章节",
        "",
    ]
    preview = import_file(client, "questions", s["id"], workbook([row]))
    assert preview["error_count"] == 1
    import_file(client, "questions", s["id"], workbook([row]), "commit", expected=422)
    node(client, b, n["name"])
    row[10] = n["name"]
    preview = import_file(client, "questions", s["id"], workbook([row]))
    assert "歧义" in preview["rows"][0]["error"]
    assert (
        len(catalog(client)["nodes"]) == 2
        and client.get("/api/library/questions").json()["total"] == 0
    )


def test_directory_import_preview_teacher_confirmation_parent_and_duplicates(client):
    s = subject(client)
    e = edition(client, s)
    b = book(client, e)
    file = workbook(
        [
            ["自建章", "章", 10, "教师核实的说明"],
            ["自建章/独立课时", "课时", 20, "目标"],
        ],
        kind="nodes",
    )
    p = import_file(client, "nodes", b["id"], file)
    assert p["valid_count"] == 2 and not catalog(client)["nodes"]
    import_file(client, "nodes", b["id"], file, "commit", expected=422)
    result = import_file(
        client, "nodes", b["id"], file, "commit", confirmation="目录已审核"
    )
    assert result["imported_count"] == 2
    assert import_file(
        client, "nodes", b["id"], file, "commit", confirmation="目录已审核"
    )["already_imported"]
    bad = workbook([["缺失父级/课时", "课时", 10]], kind="nodes")
    p = import_file(client, "nodes", b["id"], bad)
    assert p["error_count"] == 1
    duplicate = workbook([["自建章", "章", 10], ["另一个章", "章", 30]], kind="nodes")
    r = import_file(
        client,
        "nodes",
        b["id"],
        duplicate,
        "commit",
        policy="skip",
        confirmation="目录已审核",
    )
    assert r["imported_count"] == 1 and r["skipped_count"] == 1


def test_backup_includes_images_and_restore_can_materialize_missing_unreferenced_files(
    client,
):
    empty = client.post("/api/backups", json={}, headers=HEADERS).json()["name"]
    s, e, b, n = environment(client)
    asset = upload_asset(client)
    stem = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "图片备份验证"},
                    {"type": "asset", "attrs": {"assetId": asset["id"]}},
                ],
            }
        ],
    }
    q = question(client, s, stem=stem, node_ids=[n["id"]])
    backup = client.post("/api/backups", json={}, headers=HEADERS).json()["name"]
    storage = client.app.state.storage
    folder = Path(str(storage.settings.backup_dir / backup) + ".assets")
    assert (folder / asset["storage_name"]).is_file()
    original = client.get("/api/library/assets/" + asset["id"] + "/file").content
    post(
        client,
        "/questions/" + q["id"],
        question_body(s, "更新后题干", expected_version=1),
    )
    assert (
        client.post(
            "/api/backups/restore",
            json={"name": empty, "confirmation": "恢复当前工作台"},
            headers=HEADERS,
        ).status_code
        == 200
    )
    assert client.get("/api/library/questions").json()["total"] == 0
    # Now this leftover blob is not referenced by live metadata; restore must copy it from backup.
    (storage.settings.data_dir / "assets" / asset["storage_name"]).unlink()
    assert (
        client.post(
            "/api/backups/restore",
            json={"name": backup, "confirmation": "恢复当前工作台"},
            headers=HEADERS,
        ).status_code
        == 200
    )
    assert detail(client, q["id"])["node_ids"] == [n["id"]]
    assert (
        client.get("/api/library/assets/" + asset["id"] + "/file").content == original
    )
    (folder / asset["storage_name"]).write_bytes(b"corrupted")
    assert not next(
        x for x in client.get("/api/backups").json()["items"] if x["name"] == backup
    )["valid"]
    assert (
        client.post(
            "/api/backups/restore",
            json={"name": backup, "confirmation": "恢复当前工作台"},
            headers=HEADERS,
        ).status_code
        == 409
    )
    assert (
        client.get("/api/library/assets/" + asset["id"] + "/file").content == original
    )


def test_revision_two_migration_preserves_business_data_and_makes_backup(settings):
    st = Storage(settings)
    st.instance = st._claim(settings.data_dir, "data")
    st._claim(settings.backup_dir, "backups", st.instance)
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[1] / "migrations")
    )
    config.attributes.update(db_path=st.db, instance_id=st.instance)
    command.upgrade(config, "0002")
    with sqlite3.connect(st.db) as con:
        con.execute(
            "INSERT INTO classrooms VALUES ('stable-class','保留的模拟班级','2026-2027','七年级','1',0,'t','t')"
        )
        con.execute(
            "INSERT INTO students VALUES ('stable-student','迁移模拟学生',NULL,NULL,NULL,'保留', 'active','t','t')"
        )
        con.execute(
            "INSERT INTO enrollments VALUES ('enroll','stable-student','stable-class','保留的模拟班级','2026-2027','七年级','1','t',NULL,NULL)"
        )
        con.execute("INSERT INTO classroom_layouts VALUES ('stable-class',4,6,1)")
        con.execute(
            "INSERT INTO seat_assignments VALUES ('stable-class',1,2,'stable-student')"
        )
    st.close()
    st = Storage(settings)
    st.initialize()
    with sqlite3.connect(st.db) as con:
        assert con.execute("SELECT version_num FROM alembic_version").fetchone() == (
            "0006",
        )
        assert con.execute("SELECT student_id FROM seat_assignments").fetchone() == (
            "stable-student",
        )
        assert con.execute("PRAGMA foreign_key_check").fetchall() == []
    assert len(list(settings.backup_dir.glob("before-migrate-*.sqlite3"))) == 1
    st.close()


def test_reparenting_keeps_question_point_ids_and_db_rejects_cycles(client):
    s, e, b, n = environment(client)
    child = node(client, b, "被移动课时", n["id"])
    target = node(client, b, "新的章")
    p = point(client, s, node_ids=[child["id"]])
    q = question(
        client,
        s,
        node_ids=[child["id"]],
        knowledge_links=[{"knowledge_point_id": p["id"]}],
    )
    post(
        client,
        "/catalog/nodes/" + child["id"],
        {
            "book_id": b["id"],
            "name": "被移动课时",
            "kind": "lesson",
            "parent_id": target["id"],
        },
    )
    data = detail(client, q["id"])
    assert (
        data["node_ids"] == [child["id"]]
        and data["knowledge_links"][0]["knowledge_point_id"] == p["id"]
    )
    assert (
        client.get(
            "/api/library/statistics", params={"node_id": n["id"], "descendants": True}
        ).json()["total"]
        == 0
    )
    assert (
        client.get(
            "/api/library/statistics",
            params={"node_id": target["id"], "descendants": True},
        ).json()["total"]
        == 1
    )
    with pytest.raises(IntegrityError):
        with client.app.state.storage.engine.begin() as con:
            con.execute(
                text("UPDATE curriculum_nodes SET parent_id=:p WHERE id=:id"),
                {"p": child["id"], "id": target["id"]},
            )


def test_asset_transaction_failure_cleans_only_new_file(client):
    storage = client.app.state.storage
    with storage.engine.begin() as con:
        con.execute(
            text(
                "CREATE TRIGGER reject_asset_test BEFORE INSERT ON question_assets BEGIN SELECT RAISE(ABORT,'simulated failure'); END"
            )
        )
    upload_asset(client, expected=409)
    assets = storage.settings.data_dir / "assets"
    assert not list(assets.iterdir())
    with storage.engine.begin() as con:
        assert con.execute(text("SELECT COUNT(*) FROM question_assets")).scalar() == 0


def test_asset_symlink_and_missing_backup_pair_are_rejected(client, tmp_path):
    a = upload_asset(client)
    storage = client.app.state.storage
    backup = client.post("/api/backups", json={}, headers=HEADERS).json()["name"]
    pair = Path(str(storage.settings.backup_dir / backup) + ".assets")
    (pair / "manifest.json").unlink()
    assert (
        client.post(
            "/api/backups/restore",
            json={"name": backup, "confirmation": "恢复当前工作台"},
            headers=HEADERS,
        ).status_code
        == 409
    )
    outside = tmp_path / "outside.png"
    outside.write_bytes(b"not-an-image")
    live = storage.settings.data_dir / "assets" / a["storage_name"]
    live.unlink()
    live.symlink_to(outside)
    assert client.get("/api/library/assets/" + a["id"] + "/file").status_code == 409
    assert client.post("/api/backups", json={}, headers=HEADERS).status_code == 409
    assert outside.read_bytes() == b"not-an-image"
