"""Immutable attachments: copy assets before publishing a restored SQLite snapshot."""

import hashlib, json, os, re, shutil, sqlite3
from pathlib import Path


class AttachmentError(ValueError):
    pass


def rows(database):
    with sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True) as con:
        if not con.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='question_assets'"
        ).fetchone():
            return None
        return [
            dict(zip(("id", "storage_name", "size", "sha256"), row))
            for row in con.execute(
                "SELECT id,storage_name,size,sha256 FROM question_assets ORDER BY id"
            )
        ]


def safe_directory(path, create=False):
    if path.is_symlink() or path.resolve() != path:
        raise AttachmentError("附件目录存在符号链接或路径异常")
    if create:
        path.mkdir(mode=0o700, exist_ok=True)


def read_checked(directory, row):
    safe_directory(directory)
    if (
        not re.fullmatch(r"[a-f0-9]{32}\.(png|jpg|webp)", row["storage_name"])
        or not 0 < row["size"] <= 10 * 1024 * 1024
    ):
        raise AttachmentError("附件记录不合法")
    try:
        fd = os.open(directory / row["storage_name"], os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, "rb") as handle:
            data = handle.read(10 * 1024 * 1024 + 1)
        if (
            len(data) != row["size"]
            or hashlib.sha256(data).hexdigest() != row["sha256"]
        ):
            raise AttachmentError("附件内容或校验值不匹配")
        return data
    except OSError as exc:
        raise AttachmentError("附件文件缺失，无法生成完整备份或恢复") from exc


def snapshot(database, live_directory):
    records = rows(database)
    if records is None:
        return None
    target = Path(str(database) + ".assets")
    target.mkdir(mode=0o700, exist_ok=False)
    try:
        for row in records:
            data = read_checked(live_directory, row)
            with (target / row["storage_name"]).open("xb") as handle:
                handle.write(data)
            os.chmod(target / row["storage_name"], 0o600)
        (target / "manifest.json").write_text(
            json.dumps({"assets": records}, ensure_ascii=False)
        )
        verify(database)
    except Exception:
        shutil.rmtree(target)
        raise
    return target


def verify(database):
    records = rows(database)
    if records is None:
        return 0
    directory = Path(str(database) + ".assets")
    safe_directory(directory)
    manifest = directory / "manifest.json"
    if manifest.is_symlink():
        raise AttachmentError("备份附件清单不安全")
    try:
        if manifest.stat().st_size > 5 * 1024 * 1024:
            raise AttachmentError("附件清单过大")
        content = json.loads(manifest.read_text())
        if content != {"assets": records}:
            raise AttachmentError("备份附件清单与数据库不匹配")
    except (OSError, ValueError) as exc:
        raise AttachmentError("备份缺少有效的同名 .assets 附件目录或清单") from exc
    for row in records:
        read_checked(directory, row)
    return len(records)


def materialize(database, destination):
    records = rows(database)
    if not records:
        return []
    verify(database)
    safe_directory(destination, create=True)
    source = Path(str(database) + ".assets")
    created = []
    try:
        for row in records:
            target = destination / row["storage_name"]
            if target.exists() or target.is_symlink():
                read_checked(destination, row)
                continue
            data = read_checked(source, row)
            with target.open("xb") as handle:
                handle.write(data)
            os.chmod(target, 0o600)
            created.append(target)
        return created
    except Exception:
        for path in created:
            path.unlink(missing_ok=True)
        raise
