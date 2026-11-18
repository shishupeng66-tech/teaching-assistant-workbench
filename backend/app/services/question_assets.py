import hashlib
import io
import os
import re
import warnings
from pathlib import Path
from PIL import Image
from sqlalchemy import insert
from app.core import library_models as m
from app.core.models import now
from app.services.classes import transaction, BusinessError
from app.services.library import get, uid

MAX_IMAGE = 5 * 1024 * 1024


def asset_directory(storage):
    path = storage.settings.data_dir / "assets"
    if path.is_symlink() or path.resolve() != path:
        raise BusinessError("附件目录不安全")
    path.mkdir(mode=0o700, exist_ok=True)
    return path


def save_asset(storage, content, filename):
    if not content or len(content) > MAX_IMAGE:
        raise BusinessError("图片须小于5MB", 400)
    if not filename or len(filename) > 160 or "/" in filename or "\\" in filename:
        raise BusinessError("图片文件名无效", 400)
    expected = {".png": "PNG", ".jpg": "JPEG", ".jpeg": "JPEG", ".webp": "WEBP"}.get(
        Path(filename).suffix.lower()
    )
    if not expected:
        raise BusinessError("仅允许 PNG、JPEG、WebP 图片，不接受SVG或其他文件", 400)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as image:
                if (
                    image.format != expected
                    or image.width * image.height > 20_000_000
                    or getattr(image, "n_frames", 1) != 1
                ):
                    raise ValueError("格式、像素或动画不支持")
                image.load()
                width, height = image.size
                converted = image.convert("RGB" if expected == "JPEG" else "RGBA")
                output = io.BytesIO()
                converted.save(output, format=expected)
                clean = output.getvalue()
                if len(clean) > 10 * 1024 * 1024:
                    raise ValueError("图片编码后过大")
    except Exception as exc:
        raise BusinessError("图片内容损坏、格式不符或超过2000万像素", 400) from exc
    path = None
    created = False
    try:
        with transaction(storage) as s:
            identity = uid()
            extension = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}[expected]
            name = identity + "." + extension
            path = asset_directory(storage) / name
            data = {
                "id": identity,
                "storage_name": name,
                "original_name": filename,
                "mime": "image/" + ("jpeg" if expected == "JPEG" else extension),
                "size": len(clean),
                "sha256": hashlib.sha256(clean).hexdigest(),
                "width": width,
                "height": height,
                "created_at": now(),
            }
            with path.open("xb") as handle:
                created = True
                handle.write(clean)
            os.chmod(path, 0o600)
            s.execute(insert(m.assets).values(**data))
        return {**data, "url": f"/api/library/assets/{identity}/file"}
    except Exception:
        if created and path is not None:
            path.unlink(missing_ok=True)
        raise


def read_asset(storage, identity):
    with transaction(storage) as s:
        data = get(s, m.assets, identity)
        if not re.fullmatch(r"[a-f0-9]{32}\.(?:png|jpg|webp)", data["storage_name"]):
            raise BusinessError("附件记录非法")
        path = asset_directory(storage) / data["storage_name"]
        try:
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(fd, "rb") as handle:
                content = handle.read(10 * 1024 * 1024 + 1)
            if (
                len(content) != data["size"]
                or hashlib.sha256(content).hexdigest() != data["sha256"]
            ):
                raise ValueError()
        except (OSError, ValueError) as exc:
            raise BusinessError(
                "附件缺失或完整性检查失败，请检查数据目录和备份"
            ) from exc
        return data, content
