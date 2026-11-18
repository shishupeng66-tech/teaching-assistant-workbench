from fastapi import APIRouter, Request
from typing import Literal
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/api")


class RestoreRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    confirmation: Literal["恢复当前工作台"]


@router.get("/health")
def health(request: Request):
    return {
        "status": "ok",
        "database": request.app.state.storage.status(),
        "version": "0.3.0",
    }


@router.get("/settings")
def settings(request: Request):
    storage = request.app.state.storage
    return {
        "name": "教学辅助工作台",
        "version": "0.3.0",
        "data_dir": str(storage.settings.data_dir),
        "backup_dir": str(storage.settings.backup_dir),
        "database": storage.status(),
    }


@router.get("/backups")
def backups(request: Request):
    return {"items": request.app.state.storage.list_backups()}


@router.post("/backups", status_code=201)
def backup(request: Request):
    return {"name": request.app.state.storage.backup(), "verified": True}


@router.post("/backups/restore")
def restore(body: RestoreRequest, request: Request):
    safety = request.app.state.storage.restore(body.name)
    return {"restored": True, "safety_backup": safety}
