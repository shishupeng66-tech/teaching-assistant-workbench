import hashlib
import io
import json
import zipfile
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill
from pydantic import ValidationError
from sqlalchemy import select
from app.core.models import Student, ImportBatch
from app.core.schemas import StudentInput
from app.services.classes import (
    transaction,
    classroom,
    create_student_in_session,
    audit,
    BusinessError,
)

HEADERS = ["姓名", "学号", "性别", "入学年份", "备注"]
MAX_SIZE = 5 * 1024 * 1024


def template():
    wb = Workbook()
    sheet = wb.active
    sheet.title = "学生导入"
    sheet.append(HEADERS)
    sheet.freeze_panes = "A2"
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="2563EB")
    for column, width in zip("ABCDE", [22, 24, 14, 16, 50]):
        sheet.column_dimensions[column].width = width
    for row in sheet.iter_rows(min_row=2, max_row=1001, min_col=2, max_col=2):
        row[0].number_format = "@"
    info = wb.create_sheet("填写说明")
    for line in [
        "只在‘学生导入’工作表填写，不改表头。姓名必填，其余可空。",
        "学号按文本保存，保留前导零；非空学号在全系统不得重复（包括归档学生）。",
        "性别可空或填写 男、女、其他；入学年份为1900到2100整数；备注最多2000字。",
        "每次最多1000行、文件最多5MB；只接受.xlsx，不接受宏、公式或外部链接。",
        "目标班级在系统选择，不在模板填写。同名不会自动合并。",
        "相同文件再次导入同一班级会返回原批次；无学号的修改版文件请手动核对，系统不会按姓名合并。",
    ]:
        info.append([line])
    info.column_dimensions["A"].width = 110
    stream = io.BytesIO()
    wb.save(stream)
    return stream.getvalue()


def parse(content, filename):
    if not filename.lower().endswith(".xlsx") or not content or len(content) > MAX_SIZE:
        raise BusinessError("请上传不超过5MB的 .xlsx 文件", 400)
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            names = z.namelist()
            if (
                len(names) > 200
                or sum(i.file_size for i in z.infolist()) > 30 * 1024 * 1024
            ):
                raise BusinessError("Excel 解压后过大，请拆分导入", 400)
            if any(
                "vbaProject" in n or n.startswith("xl/externalLinks/") for n in names
            ):
                raise BusinessError("不支持宏或外部链接", 400)
        wb = load_workbook(
            io.BytesIO(content), read_only=True, data_only=False, keep_links=False
        )
        try:
            sheet = wb["学生导入"]
            sheet.reset_dimensions()
            rows = sheet.iter_rows(max_col=6)
            header = next(rows)
            if [c.value for c in header[:5]] != HEADERS or header[5].value is not None:
                raise BusinessError(
                    "表头不匹配，请下载系统模板，保留‘学生导入’工作表及五列表头", 400
                )
            records = []
            seen_no = set()
            seen_payload = set()
            for number, cells in enumerate(rows, start=2):
                if number > 10001:
                    raise BusinessError("工作表行范围过大，请复制到新的模板后导入", 400)
                vals = [c.value for c in cells]
                if not any(v is not None and str(v).strip() for v in vals):
                    continue
                if number > 1001:
                    raise BusinessError("最多导入1000行，请拆分文件", 400)
                error = None
                duplicate = False
                data = None
                if any(c.data_type == "f" for c in cells):
                    error = "不接受公式，请粘贴为纯值"
                elif vals[5] is not None:
                    error = "只接受模板中的五列"
                else:
                    try:
                        # Numeric IDs risk loss of leading zeros: require text explicitly.
                        if vals[1] is not None and not isinstance(vals[1], str):
                            raise ValueError("学号必须为文本格式，避免前导零丢失")
                        if vals[3] is not None and (
                            isinstance(vals[3], bool)
                            or float(vals[3]) != int(float(vals[3]))
                        ):
                            raise ValueError("入学年份须为整数")
                        body = StudentInput(
                            name=str(vals[0]).strip() if vals[0] is not None else "",
                            student_no=vals[1],
                            gender=str(vals[2]).strip() if vals[2] else None,
                            entry_year=int(float(vals[3]))
                            if vals[3] is not None and str(vals[3]).strip()
                            else None,
                            notes=str(vals[4]) if vals[4] is not None else "",
                        )
                        data = body.model_dump()
                        key = json.dumps(data, sort_keys=True, ensure_ascii=False)
                        if body.student_no and body.student_no in seen_no:
                            duplicate = True
                            error = "文件内学号重复"
                        elif key in seen_payload:
                            duplicate = True
                            error = "文件内存在完全相同记录"
                        if body.student_no:
                            seen_no.add(body.student_no)
                        seen_payload.add(key)
                    except ValidationError as exc:
                        error = "字段不合法：" + "；".join(
                            {
                                "name": "姓名",
                                "student_no": "学号",
                                "gender": "性别",
                                "entry_year": "入学年份",
                                "notes": "备注",
                            }.get(e["loc"][0], str(e["loc"][0]))
                            + " "
                            + {
                                "string_too_short": "不能为空",
                                "string_too_long": "超过允许长度",
                                "literal_error": "仅允许男、女、其他",
                                "int_parsing": "须为整数",
                                "int_from_float": "须为整数",
                                "greater_than_equal": "超出允许范围",
                                "less_than_equal": "超出允许范围",
                            }.get(e["type"], "格式不正确")
                            for e in exc.errors()
                        )
                    except (ValueError, TypeError, OverflowError) as exc:
                        error = str(exc)
                records.append(
                    {
                        "row": number,
                        "data": data,
                        "error": error,
                        "duplicate": duplicate,
                    }
                )
            if not records:
                raise BusinessError("工作表没有可导入的学生", 400)
            return records
        finally:
            wb.close()
    except BusinessError:
        raise
    except Exception as exc:
        raise BusinessError(
            "无法读取 Excel，请使用未加密且未损坏的系统 .xlsx 模板", 400
        ) from exc


def process(storage, class_id, content, filename, commit=False, policy="reject"):
    records = parse(content, filename)
    digest = hashlib.sha256(content).hexdigest()
    with transaction(storage) as session:
        group = classroom(session, class_id, True)
        batch = session.scalar(
            select(ImportBatch).where(
                ImportBatch.class_id == class_id, ImportBatch.file_hash == digest
            )
        )
        if batch:
            result = json.loads(batch.result_json)
            return {
                **result,
                "already_imported": True,
                "message": "相同文件已导入该班级，未重复新增",
            }
        numbers = {
            x
            for x in session.scalars(
                select(Student.student_no).where(Student.student_no.is_not(None))
            )
        }
        for record in records:
            if not record["error"] and record["data"]["student_no"] in numbers:
                record["error"] = "系统中已存在此学号（包括已归档档案）"
                record["duplicate"] = True
        invalid = [x for x in records if x["error"] and not x["duplicate"]]
        duplicates = [x for x in records if x["duplicate"]]
        good = [x for x in records if not x["error"]]
        result = {
            "file_hash": digest,
            "rows": records,
            "valid_count": len(good),
            "duplicate_count": len(duplicates),
            "error_count": len(invalid),
            "already_imported": False,
        }
        if not commit:
            return result
        if policy not in ("reject", "skip"):
            raise BusinessError("重复处理方式无效", 422)
        if invalid or (duplicates and policy == "reject"):
            raise BusinessError(
                "导入未执行：请修正错误，或选择跳过重复记录", 422, result
            )
        created = [
            create_student_in_session(session, row["data"], group)["id"] for row in good
        ]
        result.update(
            imported_count=len(created),
            skipped_count=len(duplicates),
            student_ids=created,
        )
        batch = ImportBatch(
            class_id=class_id,
            file_hash=digest,
            result_json=json.dumps(result, ensure_ascii=False),
        )
        session.add(batch)
        session.flush()
        audit(
            session,
            "student.import",
            "class",
            class_id,
            None,
            {
                "batch_id": batch.id,
                "file_hash": digest,
                "student_ids": created,
                "skipped": len(duplicates),
            },
        )
        return result
