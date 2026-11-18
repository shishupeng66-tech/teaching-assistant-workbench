from typing import Literal

from fastapi import APIRouter, File, Form, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import Field

from app.core.library_schemas import (
    CatalogInput,
    DuplicateInput,
    MappingInput,
    PointInput,
    QuestionInput,
    ReviewInput,
)
from app.core.schemas import Input
from app.services import library as service
from app.services import library_import, question_assets

router = APIRouter(prefix="/api/library")
UPLOAD_FILE = File(...)


def storage(request):
    return request.app.state.storage


@router.get("/catalog")
def catalog(request: Request):
    return service.catalog(storage(request))


@router.post("/catalog/{kind}")
def create(
    kind: Literal["subjects", "editions", "books", "nodes"],
    body: CatalogInput,
    request: Request,
):
    return service.save_catalog(storage(request), kind, body)


@router.post("/catalog/{kind}/{identity}")
def update_catalog(
    kind: Literal["subjects", "editions", "books", "nodes"],
    identity: str,
    body: CatalogInput,
    request: Request,
):
    return service.save_catalog(storage(request), kind, body, identity)


class OrderInput(Input):
    direction: Literal["up", "down"]


@router.post("/nodes/{identity}/order")
def order(identity: str, body: OrderInput, request: Request):
    return service.reorder_node(storage(request), identity, body.direction)


@router.post("/nodes/{identity}/knowledge")
def map_points(identity: str, body: MappingInput, request: Request):
    return service.map_node(storage(request), identity, body.knowledge_point_ids)


@router.post("/knowledge-points")
def create_point(body: PointInput, request: Request):
    return service.save_point(storage(request), body)


@router.get("/knowledge-points/{identity}")
def get_point(identity: str, request: Request):
    return service.get_point(storage(request), identity)


@router.post("/knowledge-points/{identity}")
def edit_point(identity: str, body: PointInput, request: Request):
    return service.save_point(storage(request), body, identity)


@router.post("/questions/duplicates")
def duplicates(body: DuplicateInput, request: Request):
    return service.duplicates(
        storage(request), body.subject_id, body.stem, body.exclude_id
    )


@router.post("/questions")
def create_question(body: QuestionInput, request: Request):
    return service.save_question(storage(request), body)


@router.get("/questions")
def list_questions(
    request: Request,
    q: str = Query("", max_length=200),
    subject_id: str = "",
    grade: str = "",
    question_type: str = "",
    difficulty: int | None = Query(None, ge=1, le=5),
    status: str = "",
    knowledge_point_id: str = "",
    node_id: str = "",
    descendants: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    filters = {
        "q": q,
        "subject_id": subject_id,
        "grade": grade,
        "question_type": question_type,
        "difficulty": difficulty,
        "status": status,
        "knowledge_point_id": knowledge_point_id,
        "node_id": node_id,
        "descendants": descendants,
    }
    return service.list_questions(storage(request), filters, page, page_size)


@router.get("/statistics")
def stats(
    request: Request,
    q: str = Query("", max_length=200),
    subject_id: str = "",
    grade: str = "",
    question_type: str = "",
    difficulty: int | None = Query(None, ge=1, le=5),
    status: str = "",
    knowledge_point_id: str = "",
    node_id: str = "",
    descendants: bool = False,
):
    return service.statistics(
        storage(request),
        {
            "q": q,
            "subject_id": subject_id,
            "grade": grade,
            "question_type": question_type,
            "difficulty": difficulty,
            "status": status,
            "knowledge_point_id": knowledge_point_id,
            "node_id": node_id,
            "descendants": descendants,
        },
    )


@router.get("/questions/{identity}")
def detail(identity: str, request: Request):
    return service.detail(storage(request), identity)


@router.post("/questions/{identity}")
def edit_question(identity: str, body: QuestionInput, request: Request):
    return service.save_question(storage(request), body, identity)


@router.post("/questions/{identity}/review")
def review(identity: str, body: ReviewInput, request: Request):
    return service.review(storage(request), identity, body)


class LinkInput(Input):
    question_id: str


@router.post("/nodes/{identity}/questions")
def link(identity: str, body: LinkInput, request: Request):
    return service.link_existing(storage(request), identity, body.question_id)


@router.post("/assets")
async def asset(request: Request, file: UploadFile = UPLOAD_FILE):
    return question_assets.save_asset(
        storage(request),
        await file.read(question_assets.MAX_IMAGE + 1),
        file.filename or "",
    )


@router.get("/assets/{identity}/file")
def image(identity: str, request: Request):
    meta, data = question_assets.read_asset(storage(request), identity)
    return Response(
        data,
        media_type=meta["mime"],
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"},
    )


@router.get("/import/{kind}/template")
def template(kind: Literal["questions", "nodes"]):
    return Response(
        library_import.template(kind),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={kind}-template.xlsx"},
    )


@router.post("/import/{kind}/preview")
async def preview(
    kind: Literal["questions", "nodes"],
    request: Request,
    scope_id: str = Form(...),
    file: UploadFile = UPLOAD_FILE,
):
    return library_import.process(
        storage(request),
        kind,
        scope_id,
        await file.read(library_import.MAX_FILE + 1),
        file.filename or "",
    )


@router.post("/import/{kind}/commit")
async def commit(
    kind: Literal["questions", "nodes"],
    request: Request,
    scope_id: str = Form(...),
    policy: Literal["reject", "skip", "keep"] = Form("reject"),
    confirmation: str = Form(""),
    file: UploadFile = UPLOAD_FILE,
):
    return library_import.process(
        storage(request),
        kind,
        scope_id,
        await file.read(library_import.MAX_FILE + 1),
        file.filename or "",
        True,
        policy,
        confirmation,
    )


class ContentPreviewInput(Input):
    point_ids: list[str] = Field(default_factory=list, max_length=500)
    question_ids: list[str] = Field(default_factory=list, max_length=500)
    node_id: str = ""
    action: Literal["approve", "reject"] = "approve"
    note: str = Field(default="", max_length=2000)


class ContentCommitInput(Input):
    batch_id: str
    confirmation: str


@router.get("/content-review")
def content_list(request: Request, node_id: str = "", status: str = "pending"):
    from app.services import textbook_content

    return textbook_content.listing(storage(request), node_id, status)


@router.post("/content-review/preview")
def content_preview(body: ContentPreviewInput, request: Request):
    from app.services import textbook_content

    return textbook_content.preview(storage(request), **body.model_dump())


@router.post("/content-review/commit")
def content_commit(body: ContentCommitInput, request: Request):
    from app.services import textbook_content

    return textbook_content.commit(storage(request), **body.model_dump())
