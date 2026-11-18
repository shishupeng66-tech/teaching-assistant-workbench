import logging
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.api.routes import router
from app.api.classes import router as class_router
from app.api.library import router as library_router
from app.api.taxonomy import router as taxonomy_router
from app.api.chemistry import router as chemistry_router
from app.services.chemistry_store import ChemistryStore
from app.services.classes import BusinessError
from app.core.config import Settings
from app.services.storage import Storage, StorageError

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
logger = logging.getLogger("workbench")


def create_app(settings=None):
    @asynccontextmanager
    async def lifespan(app):
        app.state.storage = Storage(settings or Settings())
        try:
            app.state.storage.initialize()
            app.state.chemistry = ChemistryStore(app.state.storage)
            logger.info("独立数据库就绪；第三阶段 0.3.0")
            yield
        finally:
            if hasattr(app.state, "chemistry"):
                app.state.chemistry.close()
            app.state.storage.close()

    app = FastAPI(title="教学辅助工作台", version="0.3.0", lifespan=lifespan)

    def error(status, code, message):
        return JSONResponse(
            status_code=status, content={"error": {"code": code, "message": message}}
        )

    @app.middleware("http")
    async def local_guard(request: Request, call_next):
        start = time.monotonic()
        if request.headers.get("host", "").split(":")[0] not in {
            "127.0.0.1",
            "localhost",
            "testserver",
        }:
            return error(400, "INVALID_HOST", "仅允许本机工作台地址")
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            origin = request.headers.get("origin")
            if (
                origin not in {None, "http://127.0.0.1:5188"}
                or request.headers.get("x-workbench-request") != "1"
            ):
                return error(
                    403, "LOCAL_REQUEST_REQUIRED", "仅允许本机工作台发起此操作"
                )
        response = await call_next(request)
        logger.info(
            "%s %s %s %.0fms",
            request.method,
            request.url.path,
            response.status_code,
            (time.monotonic() - start) * 1000,
        )
        return response

    @app.exception_handler(StorageError)
    async def storage_error(request, exc):
        return error(409, "STORAGE_SAFETY_CHECK", str(exc))

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        messages = []
        for item in exc.errors():
            field = ".".join(str(x) for x in item["loc"][1:])
            messages.append(f"{field}: {item['msg']}")
        return error(422, "VALIDATION_ERROR", "请求参数无效：" + "；".join(messages))

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, exc):
        return error(exc.status_code, "HTTP_ERROR", str(exc.detail))

    @app.exception_handler(Exception)
    async def unexpected_error(request, exc):
        logger.exception("请求异常")
        return error(500, "INTERNAL_ERROR", "服务暂时不可用，请检查后端日志")

    @app.exception_handler(BusinessError)
    async def business_error(request, exc):
        return JSONResponse(
            status_code=exc.status,
            content={
                "error": {
                    "code": "BUSINESS_ERROR",
                    "message": exc.message,
                    "details": exc.details,
                }
            },
        )

    app.include_router(library_router)
    app.include_router(taxonomy_router)
    app.include_router(chemistry_router)
    app.include_router(class_router)
    app.include_router(router)
    return app


app = create_app()
