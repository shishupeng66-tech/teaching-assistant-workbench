from typing import Literal, Any
from fastapi import APIRouter, Request, Query, UploadFile, File
from fastapi.responses import Response
from pydantic import Field
from app.core.schemas import Input
from app.services import chemistry as service

router = APIRouter(prefix="/api/chemistry-graph")


def store(request):
    return request.app.state.chemistry


@router.get("/overview")
def overview(request: Request):
    return service.overview(store(request))


@router.get("/data")
def data(request: Request):
    return service.data_management(store(request))


class ImportInput(Input):
    confirmation: Literal["导入独立化学空间"]


@router.post("/import")
def import_source(body: ImportInput, request: Request):
    return service.initialize_source(store(request))


@router.get("/questions")
def questions(
    request: Request,
    point_id: str = "",
    difficulty: int | None = Query(None, ge=1, le=5),
    status: str = "",
    q: str = Query("", max_length=200),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    return service.questions(
        store(request), point_id, difficulty, status, q, page, page_size
    )


@router.get("/questions/{identity}")
def question(identity: str, request: Request):
    return service.question(store(request), identity)


class QuestionEdit(Input):
    stem: dict[str, Any]
    answer: dict[str, Any]
    explanation: dict[str, Any]
    difficulty: int = Field(ge=1, le=5)
    expected_version: int = Field(ge=1)


@router.post("/questions/{identity}")
def edit(identity: str, body: QuestionEdit, request: Request):
    return service.edit_question(store(request), identity, body)


class Review(Input):
    status: Literal["approved", "rejected"]
    expected_version: int | None = None


@router.post("/review/{kind}/{identity}")
def review(
    kind: Literal["points", "questions", "edges"],
    identity: str,
    body: Review,
    request: Request,
):
    return service.review(
        store(request), kind, identity, body.status, body.expected_version
    )


@router.get("/assets/{identity}/file")
def image(identity: str, request: Request):
    data, content = store(request).read_asset(identity)
    return Response(
        content,
        media_type=data["mime"],
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"},
    )


@router.get("/view")
def view(request: Request):
    return service.view(store(request))


class Position(Input):
    x: float = Field(ge=-100000, le=100000, allow_inf_nan=False)
    y: float = Field(ge=-100000, le=100000, allow_inf_nan=False)


class Viewport(Input):
    x: float = Field(ge=-1000000, le=1000000, allow_inf_nan=False)
    y: float = Field(ge=-1000000, le=1000000, allow_inf_nan=False)
    zoom: float = Field(ge=0.03, le=2.5, allow_inf_nan=False)


class View(Input):
    positions: dict[str, Position] = Field(default_factory=dict, max_length=100)
    selected: str = Field(default="", max_length=64)
    mode: Literal["global", "local"] = "global"
    viewport: Viewport | None = None


@router.post("/view")
def save_view(body: View, request: Request):
    return service.save_view(store(request), body.model_dump())


@router.post("/backups")
def backup(request: Request):
    return dict(name=store(request).backup(), verified=True, scope="仅初中化学知识图谱")


class Restore(Input):
    name: str
    confirmation: Literal["恢复独立化学知识图谱"]


@router.post("/backups/restore")
def restore(body: Restore, request: Request):
    return dict(
        restored=True,
        safety_backup=store(request).restore(body.name),
        scope="仅初中化学知识图谱",
    )


class Practice(Input):
    target: str
    limit: int = Field(default=12, ge=2, le=20)
    acknowledged: bool = False


@router.post("/practice")
def practice(body: Practice, request: Request):
    return service.create_session(
        store(request), body.target, body.limit, body.acknowledged
    )


@router.get("/practice")
def practices(request: Request):
    return dict(items=service.sessions(store(request)))


@router.get("/practice/{identity}")
def session(identity: str, request: Request):
    return service.get_session(store(request), identity)


class Answer(Input):
    answer: str = Field(default="", max_length=1000)
    step: int = Field(ge=0)
    manual_verdict: Literal["correct", "wrong"] | None = None


@router.post("/practice/{identity}/answer")
def answer(identity: str, body: Answer, request: Request):
    return service.answer_session(
        store(request), identity, body.answer, body.step, body.manual_verdict
    )


@router.post("/assets")
async def upload(request: Request, file: UploadFile = File(...)):
    return service.upload_asset(
        store(request), await file.read(5 * 1024 * 1024 + 1), file.filename or ""
    )
