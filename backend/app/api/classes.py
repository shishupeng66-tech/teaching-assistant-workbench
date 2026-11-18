from typing import Literal
from fastapi import APIRouter, Request, UploadFile, File, Form, Query
from fastapi.responses import Response
from app.core.schemas import (
    ClassInput,
    StudentCreate,
    StudentInput,
    TransferInput,
    ArchiveInput,
    LayoutInput,
)
from app.services import classes as service
from app.services import student_import

router = APIRouter(prefix="/api")


def storage(request):
    return request.app.state.storage


@router.get("/classes")
def list_classes(request: Request, archived: bool = False):
    return service.list_classes(storage(request), archived)


@router.post("/classes", status_code=201)
def create_class(body: ClassInput, request: Request):
    return service.save_class(storage(request), body)


@router.post("/classes/{class_id}/update")
def edit_class(class_id: str, body: ClassInput, request: Request):
    return service.save_class(storage(request), body, class_id)


@router.post("/classes/{class_id}/archive")
def archive_class(class_id: str, body: ArchiveInput, request: Request):
    return service.archive_class(storage(request), class_id)


@router.get("/classes/{class_id}/layout")
def get_layout(class_id: str, request: Request):
    return service.get_layout(storage(request), class_id)


@router.post("/classes/{class_id}/layout")
def save_layout(class_id: str, body: LayoutInput, request: Request):
    return service.save_layout(storage(request), class_id, body)


@router.get("/classes/{class_id}/operations")
def operations(class_id: str, request: Request):
    return service.class_operations(storage(request), class_id)


@router.get("/students")
def students(
    request: Request,
    q: str = Query("", max_length=100),
    class_id: str | None = None,
    archived: bool = False,
):
    return service.list_students(storage(request), q, class_id, archived)


@router.post("/students", status_code=201)
def create_student(body: StudentCreate, request: Request):
    return service.create_student(storage(request), body)


@router.get("/students/{student_id}")
def detail(student_id: str, request: Request):
    return service.detail(storage(request), student_id)


@router.post("/students/{student_id}/update")
def edit(student_id: str, body: StudentInput, request: Request):
    return service.edit_student(storage(request), student_id, body)


@router.post("/students/{student_id}/transfer")
def transfer(student_id: str, body: TransferInput, request: Request):
    return service.transfer_student(storage(request), student_id, body)


@router.post("/students/{student_id}/archive")
def archive(student_id: str, body: ArchiveInput, request: Request):
    return service.archive_student(storage(request), student_id)


@router.get("/student-import/template")
def template():
    return Response(
        student_import.template(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=student-import-template.xlsx"
        },
    )


@router.post("/classes/{class_id}/import-preview")
async def preview(class_id: str, request: Request, file: UploadFile = File(...)):
    content = await file.read(student_import.MAX_SIZE + 1)
    return student_import.process(
        storage(request), class_id, content, file.filename or ""
    )


@router.post("/classes/{class_id}/import")
async def commit(
    class_id: str,
    request: Request,
    file: UploadFile = File(...),
    policy: Literal["reject", "skip"] = Form("reject"),
):
    content = await file.read(student_import.MAX_SIZE + 1)
    return student_import.process(
        storage(request), class_id, content, file.filename or "", True, policy
    )
