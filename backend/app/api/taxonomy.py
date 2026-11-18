from typing import Literal
from fastapi import APIRouter, Request
from app.core.schemas import Input
from app.services import taxonomy

router = APIRouter(prefix="/api/library/taxonomy")


@router.get("/preview")
def preview(request: Request):
    return taxonomy.preview(request.app.state.storage)


class ImportInput(Input):
    confirmation: Literal["导入待审核初中化学数据"]


@router.post("/import")
def import_data(body: ImportInput, request: Request):
    from app.services.classes import BusinessError

    raise BusinessError(
        "来源导入已迁移至独立化学空间，请访问/chemistry-graph/data", 410
    )


@router.get("/graph")
def graph(request: Request):
    return taxonomy.graph(request.app.state.storage)


@router.get("/items/{identity}")
def item(identity: str, request: Request):
    return taxonomy.source_item(request.app.state.storage, identity)


class Decision(Input):
    action: Literal["approve", "reject"]


@router.post("/review/{kind}/{identity}")
def decide(
    kind: Literal["point", "mapping", "dependency"],
    identity: str,
    body: Decision,
    request: Request,
):
    from app.services.classes import BusinessError

    raise BusinessError("来源审核已迁移至独立化学空间，旧记录只读保留", 410)
