import hashlib
import io
import json
import zipfile
from pathlib import Path
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill
from pydantic import ValidationError
from sqlalchemy import select, insert
from app.core import library_models as m
from app.core.library_schemas import QuestionInput
from app.core.models import now
from app.services.classes import transaction, audit, BusinessError
from app.services.rich_content import document, normalize, validate_document
from app.services import library as service

Q_HEADERS = [
    "题型",
    "题干",
    "标准答案",
    "解析",
    "难度",
    "来源",
    "学科",
    "教材版本",
    "年级",
    "册别",
    "章节路径",
    "关联知识点编码",
]
N_HEADERS = ["章节路径", "层级", "排序", "教学目标或说明"]
MAX_FILE = 5 * 1024 * 1024


def template(kind):
    wb = Workbook()
    sheet = wb.active
    sheet.title = "题目导入" if kind == "questions" else "目录导入"
    sheet.append(Q_HEADERS if kind == "questions" else N_HEADERS)
    sheet.freeze_panes = "A2"
    for cell in sheet[1]:
        cell.fill = PatternFill("solid", fgColor="2563EB")
        cell.font = Font(bold=True, color="FFFFFF")
    for index in range(1, len(sheet[1]) + 1):
        sheet.column_dimensions[sheet.cell(1, index).column_letter].width = (
            24 if index != 2 else 65
        )
    note = wb.create_sheet("填写说明")
    lines = [
        "模板不预填未经核实的教材或正式试题。",
        "只填写命名工作表，保留表头。最多500条、5MB；禁止Excel公式、宏、外部链接和嵌入图片。",
    ]
    if kind == "questions":
        lines += [
            "题型：单选题、多选题、判断题、填空题、简答题、计算题、实验题、综合题；难度为1–5整数。",
            "题干必填。题干、答案、解析可写普通文字，$LaTeX$ 表示公式，例如 $\\ce{2H2 + O2 -> 2H2O}$。",
            "也可填写系统结构化文档JSON；Excel内嵌图片不解析，请在导入后用编辑器上传本地图片。",
            "学科可填既有名称或编码，不填使用页面所选学科；教材版本、年级、册别、章节路径同时填写后关联。",
            "章节路径用 / 分隔，多个路径用 | 分隔；只能匹配已存在且唯一的目录，未知或歧义报错，不会自动建目录。",
            "知识点编码多个用 | 分隔，须属于题目学科。第一项作为主要知识点，导入后可调整。",
            "试题只保存为草稿，需提交审核并由教师明确通过才成为已审核。重复可拒绝、跳过或核对后保留独立题目。",
        ]
    else:
        lines += [
            "路径用 / 分隔，如 自定义第一章/第一节/课时1。父目录须已存在或同时列在本文件。",
            "层级填 章、节、课时，不强制所有层级齐全。排序为非负整数，按同级排序。",
            "已有路径不覆盖，重复可跳过；歧义或缺失父节点须教师修正。提交前须确认目录已审核。",
            "只导入教师已核实的结构，不自动补全任何出版社目录。",
        ]
    for line in lines:
        note.append([line])
    note.column_dimensions["A"].width = 120
    stream = io.BytesIO()
    wb.save(stream)
    return stream.getvalue()


def read_rows(content, filename, kind):
    if not filename.lower().endswith(".xlsx") or not content or len(content) > MAX_FILE:
        raise BusinessError("请上传不超过5MB的.xlsx文件", 400)
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            names = z.namelist()
            if (
                len(names) > 250
                or sum(i.file_size for i in z.infolist()) > 30 * 1024 * 1024
            ):
                raise BusinessError("Excel解压后过大", 400)
            if any(
                "vbaProject" in n or n.startswith(("xl/externalLinks/", "xl/media/"))
                for n in names
            ):
                raise BusinessError(
                    "不接受宏、外部链接或Excel内嵌图片，请使用标准模板", 400
                )
        wb = load_workbook(
            io.BytesIO(content), read_only=True, data_only=False, keep_links=False
        )
        try:
            name = "题目导入" if kind == "questions" else "目录导入"
            headers = Q_HEADERS if kind == "questions" else N_HEADERS
            sheet = wb[name]
            sheet.reset_dimensions()
            iterator = sheet.iter_rows(max_col=len(headers) + 1)
            first = next(iterator)
            if [x.value for x in first[: len(headers)]] != headers or first[
                -1
            ].value is not None:
                raise BusinessError("表头不匹配，请下载系统模板", 400)
            rows = []
            for rowno, cells in enumerate(iterator, 2):
                if rowno > 10000:
                    raise BusinessError("工作表行范围过大", 400)
                values = [x.value for x in cells]
                if not any(v is not None and str(v).strip() for v in values):
                    continue
                if rowno > 501:
                    raise BusinessError("最多500条，请拆分文件", 400)
                error = (
                    "不接受公式或模板外数据列"
                    if any(x.data_type == "f" for x in cells) or values[-1] is not None
                    else None
                )
                rows.append({"row": rowno, "values": values[:-1], "error": error})
            if not rows:
                raise BusinessError("文件没有可导入记录", 400)
            return rows
        finally:
            wb.close()
    except BusinessError:
        raise
    except Exception as exc:
        raise BusinessError(
            "无法读取模板，请使用未损坏、未加密的.xlsx文件", 400
        ) from exc


def string(value):
    return str(value).strip() if value is not None else ""


def as_doc(value):
    value = string(value)
    if value.startswith("{"):
        try:
            return validate_document(json.loads(value))
        except Exception as exc:
            raise ValueError("结构化文档JSON不合法") from exc
    return validate_document(document(value))


def one(s, table, condition, label):
    rows = list(s.execute(select(table).where(condition)).mappings())
    if len(rows) != 1:
        raise ValueError(
            label + ("不存在" if not rows else "存在歧义，请教师选择或修正")
        )
    if "active" in rows[0] and not rows[0]["active"]:
        raise ValueError(label + "已停用")
    return dict(rows[0])


def parse_questions(s, raw, default_subject):
    records = []
    seen = set()
    for row in raw:
        rec = {
            "row": row["row"],
            "error": row["error"],
            "duplicate": False,
            "data": None,
            "similar_questions": [],
        }
        if not rec["error"]:
            try:
                (
                    typ,
                    stem,
                    answer,
                    explanation,
                    difficulty,
                    source,
                    subject_name,
                    edition_name,
                    grade,
                    volume,
                    chapter,
                    codes,
                ) = row["values"]
                subject = (
                    one(
                        s,
                        m.subjects,
                        (m.subjects.c.name == string(subject_name))
                        | (m.subjects.c.code == string(subject_name)),
                        "学科",
                    )
                    if string(subject_name)
                    else service.get(s, m.subjects, default_subject)
                )
                nodes = []
                if string(chapter):
                    if not all(string(x) for x in (edition_name, grade, volume)):
                        raise ValueError("按章节导入须同时填写教材版本、年级和册别")
                    edition = one(
                        s,
                        m.editions,
                        (m.editions.c.subject_id == subject["id"])
                        & (m.editions.c.name == string(edition_name)),
                        "教材版本",
                    )
                    book = one(
                        s,
                        m.books,
                        (m.books.c.edition_id == edition["id"])
                        & (m.books.c.grade == string(grade))
                        & (m.books.c.volume == string(volume)),
                        "册别",
                    )
                    candidates = list(
                        s.execute(
                            select(m.nodes).where(m.nodes.c.book_id == book["id"])
                        ).mappings()
                    )
                    for path in string(chapter).split("|"):
                        matches = [
                            n
                            for n in candidates
                            if service.path_of(s, n["id"])
                            == "/".join(p.strip() for p in path.split("/"))
                        ]
                        if len(matches) != 1:
                            raise ValueError(
                                "章节路径 "
                                + path
                                + (
                                    " 不存在"
                                    if not matches
                                    else " 存在歧义，请教师修正"
                                )
                            )
                        if not matches[0]["active"]:
                            raise ValueError("章节已停用")
                        nodes.append(matches[0]["id"])
                point_ids = []
                for code in filter(None, (x.strip() for x in string(codes).split("|"))):
                    point_ids.append(
                        one(
                            s,
                            m.points,
                            (m.points.c.subject_id == subject["id"])
                            & (m.points.c.code == code),
                            "知识点编码 " + code,
                        )["id"]
                    )
                if len(nodes) != len(set(nodes)):
                    raise ValueError("章节路径重复")
                if len(point_ids) != len(set(point_ids)):
                    raise ValueError("知识点编码重复")
                if isinstance(difficulty, bool) or float(difficulty) != int(
                    float(difficulty)
                ):
                    raise ValueError("难度须为1–5整数")
                body = QuestionInput(
                    subject_id=subject["id"],
                    grade=string(grade),
                    question_type=string(typ),
                    difficulty=int(float(difficulty)),
                    stem=as_doc(stem),
                    answer=as_doc(answer),
                    explanation=as_doc(explanation),
                    source=string(source),
                    node_ids=nodes,
                    knowledge_links=[
                        {"knowledge_point_id": kp, "is_primary": index == 0}
                        for index, kp in enumerate(point_ids)
                    ],
                )
                if not normalize(body.stem):
                    raise ValueError("题干不能为空")
                rec["data"] = body.model_dump()
                rec["similar_questions"] = service.duplicate_candidates(
                    s, subject["id"], body.stem
                )
                key = (subject["id"], normalize(body.stem))
                if rec["similar_questions"] or key in seen:
                    rec["duplicate"] = True
                seen.add(key)
            except (ValueError, TypeError, ValidationError, BusinessError) as exc:
                rec["error"] = getattr(exc, "message", str(exc))
        records.append(rec)
    return records


def parse_nodes(s, raw, book_id):
    service.get(s, m.books, book_id)
    existing = list(
        s.execute(select(m.nodes).where(m.nodes.c.book_id == book_id)).mappings()
    )
    paths = {}
    for node in existing:
        paths.setdefault(service.path_of(s, node["id"]), []).append(node["id"])
    records = []
    in_file = set()
    new_paths = set()
    for row in raw:
        rec = {
            "row": row["row"],
            "error": row["error"],
            "duplicate": False,
            "data": None,
        }
        if not rec["error"]:
            try:
                path, kind, position, description = row["values"]
                parts = [x.strip() for x in string(path).split("/")]
                if (
                    not all(parts)
                    or len(parts) > 12
                    or any(len(x) > 100 for x in parts)
                ):
                    raise ValueError("路径须含有效名称，最多12层，每层最多100字")
                path = "/".join(parts)
                kind = {"章": "chapter", "节": "section", "课时": "lesson"}.get(
                    string(kind)
                )
                if kind is None:
                    raise ValueError("层级须填章、节或课时")
                if position is None:
                    position = (len(records) + 1) * 10
                if (
                    isinstance(position, bool)
                    or float(position) != int(float(position))
                    or not 0 <= int(float(position)) <= 100000
                ):
                    raise ValueError("排序须为0–100000整数")
                if len(string(description)) > 5000:
                    raise ValueError("说明最多5000字")
                if len(paths.get(path, [])) > 1:
                    raise ValueError("已有路径存在歧义，请教师修正")
                rec["duplicate"] = path in paths or path in in_file
                rec["data"] = {
                    "path": path,
                    "kind": kind,
                    "position": int(float(position)),
                    "description": string(description),
                }
                in_file.add(path)
                if not rec["duplicate"]:
                    new_paths.add(path)
            except (ValueError, TypeError) as exc:
                rec["error"] = str(exc)
        records.append(rec)
    for rec in records:
        if rec["error"] or rec["duplicate"]:
            continue
        path = rec["data"]["path"]
        parent = "/".join(path.split("/")[:-1])
        if parent and parent not in paths and parent not in new_paths:
            rec["error"] = "父路径不存在，须在本文件列出或先手动创建：" + parent
        elif parent and len(paths.get(parent, [])) > 1:
            rec["error"] = "父路径存在歧义，请教师修正"
    return records, paths


def process(
    storage,
    kind,
    scope_id,
    content,
    filename,
    commit=False,
    policy="reject",
    confirmation="",
):
    raw = read_rows(content, filename, kind)
    digest = hashlib.sha256(content).hexdigest()
    with transaction(storage) as s:
        if kind == "questions":
            service.ensure_subject(s, scope_id)
        else:
            book = service.get(s, m.books, scope_id)
            if not book["active"]:
                raise BusinessError("教材册别已停用")
        previous = (
            s.execute(
                select(m.batches).where(
                    m.batches.c.kind == kind,
                    m.batches.c.scope_id == scope_id,
                    m.batches.c.file_hash == digest,
                )
            )
            .mappings()
            .first()
        )
        if previous:
            return {**previous["result"], "already_imported": True}
        if kind == "questions":
            records = parse_questions(s, raw, scope_id)
            paths = None
        else:
            records, paths = parse_nodes(s, raw, scope_id)
        invalid = [x for x in records if x["error"]]
        dups = [x for x in records if x["duplicate"] and not x["error"]]
        result = {
            "rows": records,
            "error_count": len(invalid),
            "duplicate_count": len(dups),
            "valid_count": len(records) - len(invalid) - len(dups),
            "already_imported": False,
        }
        if not commit:
            return result
        if policy not in ("reject", "skip", "keep") or (
            kind == "nodes" and policy == "keep"
        ):
            raise BusinessError("重复处理方式无效", 422)
        if invalid or (dups and policy == "reject"):
            raise BusinessError(
                "未导入：请修正错误，或明确选择重复处理方式", 422, result
            )
        if kind == "nodes" and confirmation != "目录已审核":
            raise BusinessError("请确认目录已由教师审核，输入：目录已审核", 422)
        selected = [
            x
            for x in records
            if not x["error"] and (not x["duplicate"] or policy == "keep")
        ]
        created = []
        if kind == "questions":
            for rec in selected:
                body = QuestionInput(
                    **{**rec["data"], "confirm_similarity": policy == "keep"}
                )
                created.append(
                    service.save_question_in_session(
                        s, body, source_kind="import", check_similarity=False
                    )["id"]
                )
        else:
            resolved = {path: ids[0] for path, ids in paths.items() if len(ids) == 1}
            for rec in sorted(
                selected, key=lambda x: (x["data"]["path"].count("/"), x["row"])
            ):
                d = rec["data"]
                parts = d["path"].split("/")
                parent = "/".join(parts[:-1])
                identity = service.uid()
                if parent and parent not in resolved:
                    raise BusinessError("父节点尚未正确建立，导入回滚", 422)
                s.execute(
                    insert(m.nodes).values(
                        id=identity,
                        book_id=scope_id,
                        parent_id=resolved.get(parent),
                        name=parts[-1],
                        kind=d["kind"],
                        position=d["position"],
                        description=d["description"],
                        active=1,
                    )
                )
                resolved[d["path"]] = identity
                created.append(identity)
        result.update(
            imported_count=len(created),
            skipped_count=len(dups) if policy == "skip" else 0,
            created_ids=created,
        )
        batch_id = service.uid()
        s.execute(
            insert(m.batches).values(
                id=batch_id,
                kind=kind,
                scope_id=scope_id,
                file_hash=digest,
                result=result,
                created_at=now(),
            )
        )
        audit(
            s,
            "library.import",
            "library_import",
            batch_id,
            None,
            {
                "kind": kind,
                "scope_id": scope_id,
                "file_hash": digest,
                "created_ids": created,
                "duplicate_policy": policy,
                "teacher_confirmation": confirmation,
            },
        )
        return result
