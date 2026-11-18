import json
from contextlib import contextmanager
from sqlalchemy import select, delete, or_
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.core.models import (
    Classroom,
    Student,
    Enrollment,
    Layout,
    SeatAssignment,
    AuditLog,
    now,
)


class BusinessError(Exception):
    def __init__(self, message, status=409, details=None):
        self.message, self.status, self.details = message, status, details


def values(obj):
    return {column.key: getattr(obj, column.key) for column in obj.__table__.columns}


def audit(session, action, entity_type, entity_id, before=None, after=None):
    session.add(
        AuditLog(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before_json=json.dumps(before, ensure_ascii=False)
            if before is not None
            else None,
            after_json=json.dumps(after, ensure_ascii=False)
            if after is not None
            else None,
        )
    )


@contextmanager
def transaction(storage):
    with storage.lock:
        with Session(storage.engine) as session:
            try:
                with session.begin():
                    yield session
            except IntegrityError as exc:
                raise BusinessError(
                    "数据冲突：编码、学号、关联或座位已存在，或所属关系不合法。请检查后重试。"
                ) from exc


def classroom(session, class_id, writable=False):
    item = session.get(Classroom, class_id)
    if item is None:
        raise BusinessError("班级不存在", 404)
    if writable and item.archived:
        raise BusinessError("班级已归档，只能查看或将学生转出")
    return item


def student(session, student_id, writable=False):
    item = session.get(Student, student_id)
    if item is None:
        raise BusinessError("学生不存在", 404)
    if writable and item.status != "active":
        raise BusinessError("学生已归档，档案只读")
    return item


def membership(session, student_id):
    return session.scalar(
        select(Enrollment).where(
            Enrollment.student_id == student_id, Enrollment.ended_at.is_(None)
        )
    )


def enroll(session, item, group):
    item_id = item.id
    session.add(
        Enrollment(
            student_id=item_id,
            class_id=group.id,
            class_name=group.name,
            school_year=group.school_year,
            grade=group.grade,
            class_number=group.class_number,
        )
    )


def student_view(session, item):
    result = values(item)
    current = membership(session, item.id)
    group = session.get(Classroom, current.class_id) if current else None
    seat = session.scalar(
        select(SeatAssignment).where(SeatAssignment.student_id == item.id)
    )
    result.update(
        current_class=values(group) if group else None,
        seat=values(seat) if seat else None,
    )
    return result


def list_classes(storage, archived=False):
    with transaction(storage) as session:
        result = []
        for group in session.scalars(
            select(Classroom)
            .where(Classroom.archived == int(archived))
            .order_by(Classroom.created_at, Classroom.id)
        ):
            data = values(group)
            data["student_count"] = len(
                list(
                    session.scalars(
                        select(Enrollment.id).where(
                            Enrollment.class_id == group.id,
                            Enrollment.ended_at.is_(None),
                        )
                    )
                )
            )
            result.append(data)
        return {"items": result}


def save_class(storage, body, class_id=None):
    with transaction(storage) as session:
        if class_id:
            group = classroom(session, class_id, True)
            before = values(group)
            academic_change = any(
                getattr(group, key) != getattr(body, key)
                for key in ("school_year", "grade", "class_number")
            )
            prior_members = (
                list(
                    session.scalars(
                        select(Enrollment).where(
                            Enrollment.class_id == class_id,
                            Enrollment.ended_at.is_(None),
                        )
                    )
                )
                if academic_change
                else []
            )
            for k, v in body.model_dump().items():
                setattr(group, k, v)
            group.updated_at = now()
            for prior in prior_members:
                previous = values(prior)
                prior.ended_at = now()
                prior.end_reason = "班级学年信息调整"
                session.flush()
                item = session.get(Student, prior.student_id)
                enroll(session, item, group)
                session.flush()
                audit(
                    session,
                    "student.progression",
                    "student",
                    item.id,
                    previous,
                    values(membership(session, item.id)),
                )
        else:
            before = None
            group = Classroom(**body.model_dump())
            session.add(group)
            session.flush()
            session.add(Layout(class_id=group.id))
        session.flush()
        audit(
            session,
            "class.update" if before else "class.create",
            "class",
            group.id,
            before,
            values(group),
        )
        return values(group)


def archive_class(storage, class_id):
    with transaction(storage) as session:
        group = classroom(session, class_id, True)
        before = values(group)
        group.archived = 1
        group.updated_at = now()
        audit(session, "class.archive", "class", class_id, before, values(group))
        return values(group)


def list_students(storage, q="", class_id=None, archived=False):
    with transaction(storage) as session:
        query = select(Student).where(
            Student.status == ("archived" if archived else "active")
        )
        if q:
            # Literal substring; escape SQL wildcard characters.
            query = query.where(
                or_(
                    Student.name.contains(q, autoescape=True),
                    Student.student_no.contains(q, autoescape=True),
                    Student.id == q,
                )
            )
        if class_id:
            classroom(session, class_id)
            # Archived student lookup includes historical membership in the chosen class.
            member_query = select(Enrollment.student_id).where(
                Enrollment.class_id == class_id
            )
            if not archived:
                member_query = member_query.where(Enrollment.ended_at.is_(None))
            query = query.where(Student.id.in_(member_query))
        return {
            "items": [
                student_view(session, s)
                for s in session.scalars(query.order_by(Student.created_at, Student.id))
            ]
        }


def create_student_in_session(session, body, group):
    item = Student(**body)
    session.add(item)
    session.flush()
    enroll(session, item, group)
    session.flush()
    audit(
        session, "student.create", "student", item.id, None, student_view(session, item)
    )
    return student_view(session, item)


def create_student(storage, body):
    with transaction(storage) as session:
        group = classroom(session, body.class_id, True)
        return create_student_in_session(
            session, body.model_dump(exclude={"class_id"}), group
        )


def edit_student(storage, student_id, body):
    with transaction(storage) as session:
        item = student(session, student_id, True)
        before = student_view(session, item)
        for key, value in body.model_dump().items():
            setattr(item, key, value)
        item.updated_at = now()
        session.flush()
        audit(
            session,
            "student.update",
            "student",
            item.id,
            before,
            student_view(session, item),
        )
        return student_view(session, item)


def release_seat(session, student_id):
    seat = session.scalar(
        select(SeatAssignment).where(SeatAssignment.student_id == student_id)
    )
    if seat:
        previous = values(seat)
        layout = session.get(Layout, seat.class_id)
        layout.version += 1
        session.delete(seat)
        session.flush()
        audit(session, "seat.release", "student", student_id, previous, None)


def transfer_student(storage, student_id, body):
    with transaction(storage) as session:
        item = student(session, student_id, True)
        target = classroom(session, body.class_id, True)
        old = membership(session, item.id)
        if old and old.class_id == target.id:
            raise BusinessError("学生已经在此班级，无需重复转班")
        before = student_view(session, item)
        release_seat(session, item.id)
        if old:
            old.ended_at = now()
            old.end_reason = "转班"
            session.flush()
        enroll(session, item, target)
        item.updated_at = now()
        session.flush()
        audit(
            session,
            "student.transfer",
            "student",
            item.id,
            before,
            student_view(session, item),
        )
        return student_view(session, item)


def archive_student(storage, student_id):
    with transaction(storage) as session:
        item = student(session, student_id, True)
        before = student_view(session, item)
        release_seat(session, item.id)
        current = membership(session, item.id)
        if current:
            current.ended_at = now()
            current.end_reason = "学生归档"
        item.status = "archived"
        item.updated_at = now()
        session.flush()
        audit(
            session,
            "student.archive",
            "student",
            item.id,
            before,
            student_view(session, item),
        )
        return student_view(session, item)


def detail(storage, student_id):
    with transaction(storage) as session:
        item = student(session, student_id)
        result = student_view(session, item)
        result["history"] = [
            {
                **values(e),
                "class_archived": bool(session.get(Classroom, e.class_id).archived),
            }
            for e in session.scalars(
                select(Enrollment)
                .where(Enrollment.student_id == item.id)
                .order_by(Enrollment.started_at.desc())
            )
        ]
        result["operations"] = [
            values(e)
            for e in session.scalars(
                select(AuditLog)
                .where(AuditLog.entity_id == item.id)
                .order_by(AuditLog.at.desc())
            )
        ]
        return result


def layout_view(session, class_id):
    layout = session.get(Layout, class_id)
    return {
        **values(layout),
        "assignments": [
            values(s)
            for s in session.scalars(
                select(SeatAssignment)
                .where(SeatAssignment.class_id == class_id)
                .order_by(SeatAssignment.row, SeatAssignment.column)
            )
        ],
    }


def get_layout(storage, class_id):
    with transaction(storage) as session:
        classroom(session, class_id)
        return layout_view(session, class_id)


def save_layout(storage, class_id, body):
    with transaction(storage) as session:
        classroom(session, class_id, True)
        layout = session.get(Layout, class_id)
        if layout.version != body.expected_version:
            raise BusinessError("座位已被其他操作修改。请重新载入教室后再安排。")
        before = layout_view(session, class_id)
        positions = set()
        students = set()
        for assignment in body.assignments:
            pos = (assignment.row, assignment.column)
            if pos in positions or assignment.student_id in students:
                raise BusinessError("同一座位或学生不能重复分配")
            if assignment.row > body.rows or assignment.column > body.columns:
                raise BusinessError("座位超出设置的行列范围")
            item = student(session, assignment.student_id, True)
            current = membership(session, item.id)
            if not current or current.class_id != class_id:
                raise BusinessError("只能安排当前班级的在档学生")
            positions.add(pos)
            students.add(item.id)
        session.execute(
            delete(SeatAssignment).where(SeatAssignment.class_id == class_id)
        )
        session.flush()
        layout.rows = body.rows
        layout.columns = body.columns
        layout.version += 1
        session.flush()
        for assignment in body.assignments:
            session.add(SeatAssignment(class_id=class_id, **assignment.model_dump()))
        session.flush()
        after = layout_view(session, class_id)
        audit(session, "layout.save", "class", class_id, before, after)
        old_by_id = {x["student_id"]: x for x in before["assignments"]}
        new_by_id = {x["student_id"]: x for x in after["assignments"]}
        for sid in old_by_id.keys() | new_by_id.keys():
            if old_by_id.get(sid) != new_by_id.get(sid):
                audit(
                    session,
                    "seat.change",
                    "student",
                    sid,
                    old_by_id.get(sid),
                    new_by_id.get(sid),
                )
        return after


def class_operations(storage, class_id):
    with transaction(storage) as session:
        classroom(session, class_id)
        return {
            "items": [
                values(e)
                for e in session.scalars(
                    select(AuditLog)
                    .where(AuditLog.entity_id == class_id)
                    .order_by(AuditLog.at.desc())
                )
            ]
        }
