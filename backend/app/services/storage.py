"""Only operate on explicitly owned directories and same-instance SQLite snapshots."""

import fcntl
import json
import os
import re
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from alembic import command
from alembic.config import Config
from app.core.database import APP_ID, REVISION, make_engine
from app.services import asset_snapshots
import shutil


class StorageError(Exception):
    pass


class Storage:
    def __init__(self, settings):
        self.settings = settings.checked()
        self.lock = threading.RLock()
        self.db = settings.data_dir / "workbench.sqlite3"
        self.engine = make_engine(self.db)
        self.instance = None
        self._lock_file = None

    def _claim(self, directory, role, instance=None):
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        marker = directory / ".workbench-owner.json"
        if marker.is_symlink():
            raise StorageError("目录标识不得是符号链接")
        if marker.exists():
            try:
                meta = json.loads(marker.read_text())
                if (
                    meta["app"] != APP_ID
                    or meta["role"] != role
                    or not re.fullmatch(r"[a-f0-9]{32}", meta["instance"])
                ):
                    raise ValueError()
                if instance and meta["instance"] != instance:
                    raise ValueError()
                return meta["instance"]
            except (ValueError, KeyError, TypeError):
                raise StorageError("目录归属不匹配，拒绝使用未知数据目录")
        if any(directory.iterdir()):
            raise StorageError("目标目录非空且没有本项目标识，拒绝覆盖")
        identity = instance or uuid4().hex
        with marker.open("x") as f:
            json.dump({"app": APP_ID, "role": role, "instance": identity}, f)
        return identity

    def _validate(self, path, revision=True):
        if path.is_symlink() or not path.is_file():
            raise StorageError("数据库文件不存在或是符号链接")
        try:
            with sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True) as con:
                if con.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                    raise StorageError("数据库完整性检查失败")
                values = dict(con.execute("SELECT key, value FROM app_metadata"))
                if (
                    values.get("app_id") != APP_ID
                    or values.get("instance_id") != self.instance
                ):
                    raise StorageError("数据库项目或实例标识不匹配，拒绝操作")
                versions = con.execute(
                    "SELECT version_num FROM alembic_version"
                ).fetchall()
                if versions not in (
                    [("0001",)],
                    [("0002",)],
                    [("0003",)],
                    [("0004",)],
                    [("0005",)],
                    [(REVISION,)],
                ):
                    raise StorageError("数据库迁移版本不兼容")
                if revision and versions != [(REVISION,)]:
                    raise StorageError("数据库需要先通过安全增量迁移")
                if con.execute("PRAGMA foreign_key_check").fetchall():
                    raise StorageError("数据库外键一致性检查失败")
                return versions[0][0]
        except sqlite3.Error as exc:
            raise StorageError("不是兼容的工作台数据库") from exc

    def initialize(self):
        with self.lock:
            self.instance = self._claim(self.settings.data_dir, "data")
            if self._lock_file is None:
                lock_path = self.settings.data_dir / ".workbench.lock"
                fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
                self._lock_file = os.fdopen(fd, "w")
                try:
                    fcntl.flock(self._lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    self._lock_file.close()
                    self._lock_file = None
                    raise StorageError("另一个后端正在使用当前数据库，请先关闭该实例")
            self._claim(self.settings.backup_dir, "backups", self.instance)
            if self.db.exists() or self.db.is_symlink():
                previous = self._validate(self.db, revision=False)
                if previous != REVISION:
                    backup = self._backup("before-migrate", compatible=True)
                    self.journal(
                        "migration.prepared",
                        {"from": previous, "to": REVISION, "backup": backup},
                    )
            self._migrate(self.db)
            self._validate(self.db)

    def _migrate(self, path):
        config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
        config.set_main_option(
            "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
        )
        config.attributes["db_path"] = path
        config.attributes["instance_id"] = self.instance
        command.upgrade(config, "head")

    def journal(self, action, data):
        path = self.settings.data_dir / "storage-events.jsonl"
        fd = os.open(
            path, os.O_CREAT | os.O_APPEND | os.O_WRONLY | os.O_NOFOLLOW, 0o600
        )
        with os.fdopen(fd, "a") as handle:
            handle.write(
                json.dumps(
                    {
                        "at": datetime.now(timezone.utc).isoformat(),
                        "action": action,
                        **data,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
            handle.flush()
            os.fsync(handle.fileno())

    def status(self):
        with self.lock:
            self._validate(self.db)
            with self.engine.connect() as con:
                from sqlalchemy import text

                con.execute(text("SELECT 1"))
            return {"connected": True, "migration": REVISION}

    def _backup(self, prefix="backup", compatible=False):
        self._validate(self.db, revision=not compatible)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = self.settings.backup_dir / f"{prefix}-{stamp}-{uuid4().hex}.sqlite3"
        # Exclusive placeholder prevents overwriting any pre-existing file.
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(fd)
        attachment_dir = None
        try:
            with sqlite3.connect(self.db) as source, sqlite3.connect(path) as target:
                source.backup(target)
            self._validate(path, revision=not compatible)
            attachment_dir = asset_snapshots.snapshot(
                path, self.settings.data_dir / "assets"
            )
        except Exception as exc:
            path.unlink(missing_ok=True)
            if attachment_dir is not None:
                shutil.rmtree(attachment_dir)
            if isinstance(exc, asset_snapshots.AttachmentError):
                raise StorageError(str(exc)) from exc
            raise
        return path.name

    def backup(self):
        with self.lock:
            return self._backup()

    def backup_path(self, name):
        if not re.fullmatch(
            r"(?:backup|before-restore|before-migrate)-\d{8}T\d{6}Z-[a-f0-9]{32}\.sqlite3",
            name,
        ):
            raise StorageError("备份文件名无效")
        path = self.settings.backup_dir / name
        self._validate(path, revision=False)
        try:
            asset_snapshots.verify(path)
        except asset_snapshots.AttachmentError as exc:
            raise StorageError(str(exc)) from exc
        return path

    def list_backups(self):
        with self.lock:
            result = []
            for path in sorted(
                self.settings.backup_dir.glob("*.sqlite3"), reverse=True
            ):
                valid = True
                asset_records = []
                try:
                    self.backup_path(path.name)
                    asset_records = asset_snapshots.rows(path) or []
                except StorageError:
                    valid = False
                result.append(
                    {
                        "name": path.name,
                        "size": path.lstat().st_size
                        + sum(a["size"] for a in asset_records),
                        "asset_count": len(asset_records),
                        "created_at": datetime.fromtimestamp(
                            path.lstat().st_mtime, timezone.utc
                        ).isoformat(),
                        "valid": valid,
                    }
                )
            return result

    def restore(self, name):
        with self.lock:
            self._validate(self.db)
            source = self.backup_path(name)
            safety = self._backup("before-restore")
            staged = self.settings.data_dir / f"restore-{uuid4().hex}.tmp"
            added_assets = []
            published = False
            try:
                with (
                    sqlite3.connect(f"{source.as_uri()}?mode=ro", uri=True) as src,
                    sqlite3.connect(staged) as dst,
                ):
                    src.backup(dst)
                os.chmod(staged, 0o600)
                self._validate(staged, revision=False)
                self._migrate(staged)
                self._validate(staged)
                self.journal(
                    "restore.prepared", {"source": name, "safety_backup": safety}
                )
                try:
                    added_assets = asset_snapshots.materialize(
                        source, self.settings.data_dir / "assets"
                    )
                except asset_snapshots.AttachmentError as exc:
                    raise StorageError(str(exc)) from exc
                self.engine.dispose()
                os.replace(staged, self.db)
                published = True
                self._validate(self.db)
                self.journal(
                    "restore.completed", {"source": name, "safety_backup": safety}
                )
            finally:
                staged.unlink(missing_ok=True)
                if not published:
                    for path in added_assets:
                        path.unlink(missing_ok=True)
            return safety

    def close(self):
        self.engine.dispose()
        if self._lock_file is not None:
            self._lock_file.close()
            self._lock_file = None
