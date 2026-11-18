"""Separately owned SQLite + immutable assets + same-instance verified snapshots."""

import fcntl
import hashlib
import json
import os
import re
import shutil
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from alembic import command
from alembic.config import Config
from app.services import asset_snapshots
from app.services.storage import StorageError

APP = "teaching-assistant-workbench:chemistry-graph"
VERSION = "cg0001"


def dumps(x):
    return json.dumps(x, ensure_ascii=False, sort_keys=True)


def utc():
    return datetime.now(timezone.utc).isoformat()


class ChemistryStore:
    def __init__(self, main):
        self.main = main
        self.lock = threading.RLock()
        self.directory = main.settings.data_dir / "chemistry-graph"
        self.backups = main.settings.backup_dir / "chemistry-graph"
        self.db = self.directory / "chemistry.sqlite3"
        self.assets = self.directory / "assets"
        self.ready = False
        self.lock_file = None

    def ensure(self):
        if self.ready:
            return
        with self.main.lock, self.lock:
            if self.ready:
                return
            for path in (self.directory, self.backups, self.assets):
                if path.is_symlink() or path.resolve() != path:
                    raise StorageError("独立图谱路径不能含符号链接")
            self.main._claim(self.directory, "chemistry-data", self.main.instance)
            self.main._claim(self.backups, "chemistry-backups", self.main.instance)
            if self.db.is_symlink():
                raise StorageError("独立图谱数据库不能为符号链接")
            if self.lock_file is None:
                fd = os.open(
                    self.directory / ".chemistry.lock",
                    os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW,
                    0o600,
                )
                self.lock_file = os.fdopen(fd, "w")
                try:
                    fcntl.flock(self.lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    self.lock_file.close()
                    self.lock_file = None
                    raise StorageError("另一个进程正在使用独立图谱数据库")
            exists = self.db.exists()
            if exists:
                self.validate(self.db)
            config = Config()
            config.set_main_option(
                "script_location",
                str(Path(__file__).resolve().parents[2] / "chemistry_migrations"),
            )
            config.attributes["db_path"] = self.db
            command.upgrade(config, "head")
            if not exists:
                with sqlite3.connect(self.db) as c:
                    c.executemany(
                        "INSERT INTO app_metadata VALUES (?,?)",
                        [("app_id", APP), ("instance_id", self.main.instance)],
                    )
                self.db.chmod(0o600)
            if self.assets.is_symlink():
                raise StorageError("独立图片目录非法")
            self.assets.mkdir(exist_ok=True, mode=0o700)
            self.validate(self.db)
            self.ready = True

    @contextmanager
    def transaction(self):
        self.ensure()
        with self.lock:
            c = sqlite3.connect(self.db, timeout=10)
            c.row_factory = sqlite3.Row
            c.execute("PRAGMA foreign_keys=ON")
            try:
                c.execute("BEGIN IMMEDIATE")
                yield c
                c.commit()
            except Exception:
                c.rollback()
                raise
            finally:
                c.close()

    def validate(self, path):
        if path.is_symlink() or not path.is_file():
            raise StorageError("图谱数据库不存在或是符号链接")
        try:
            with sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True) as c:
                if (
                    c.execute("PRAGMA integrity_check").fetchall() != [("ok",)]
                    or c.execute("PRAGMA foreign_key_check").fetchall()
                ):
                    raise StorageError("独立图谱完整性或外键校验失败")
                meta = dict(c.execute("SELECT key,value FROM app_metadata"))
                if (
                    meta.get("app_id") != APP
                    or meta.get("instance_id") != self.main.instance
                ):
                    raise StorageError("不是本实例的独立图谱数据库")
                if c.execute("SELECT version_num FROM alembic_version").fetchall() != [
                    (VERSION,)
                ]:
                    raise StorageError("独立图谱迁移版本不兼容")
        except sqlite3.Error as e:
            raise StorageError("独立图谱数据库格式无效") from e

    def backup(self, prefix="chemgraph"):
        self.ensure()
        with self.lock:
            self.validate(self.db)
            name = f"{prefix}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex}.sqlite3"
            target = self.backups / name
            fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(fd)
            try:
                with (
                    sqlite3.connect(self.db) as source,
                    sqlite3.connect(target) as dest,
                ):
                    source.backup(dest)
                self.validate(target)
                asset_snapshots.snapshot(target, self.assets)
                asset_snapshots.verify(target)
            except Exception:
                target.unlink(missing_ok=True)
                shutil.rmtree(Path(str(target) + ".assets"), ignore_errors=True)
                raise
            return name

    def backup_path(self, name):
        if not re.fullmatch(
            r"chemgraph(?:-before-restore)?-\d{8}T\d{6}Z-[a-f0-9]{32}\.sqlite3", name
        ):
            raise StorageError("独立图谱备份名非法")
        path = self.backups / name
        self.validate(path)
        try:
            asset_snapshots.verify(path)
        except asset_snapshots.AttachmentError as e:
            raise StorageError(str(e)) from e
        return path

    def list_backups(self):
        self.ensure()
        rows = []
        with self.lock:
            for path in sorted(self.backups.glob("*.sqlite3"), reverse=True):
                try:
                    self.backup_path(path.name)
                    valid = True
                    count = len(asset_snapshots.rows(path) or [])
                except StorageError:
                    valid = False
                    count = 0
                rows.append(
                    dict(
                        name=path.name,
                        valid=valid,
                        asset_count=count,
                        size=path.stat().st_size,
                        scope="初中化学知识图谱（独立数据库及题图）",
                    )
                )
        return rows

    def restore(self, name):
        self.ensure()
        with self.lock:
            source = self.backup_path(name)
            safety = self.backup("chemgraph-before-restore")
            staged = self.directory / f"restore-{uuid4().hex}.tmp"
            added = []
            published = False
            try:
                with sqlite3.connect(source) as src, sqlite3.connect(staged) as dst:
                    src.backup(dst)
                staged.chmod(0o600)
                self.validate(staged)
                added = asset_snapshots.materialize(source, self.assets)
                os.replace(staged, self.db)
                published = True
                self.validate(self.db)
                self.main.journal(
                    "chemistry.restore",
                    dict(source=name, safety=safety, scope="chemistry-graph"),
                )
            finally:
                staged.unlink(missing_ok=True)
                if not published:
                    for path in added:
                        path.unlink(missing_ok=True)
            return safety

    def read_asset(self, identity):
        with self.transaction() as c:
            row = c.execute(
                "SELECT * FROM question_assets WHERE id=?", (identity,)
            ).fetchone()
            if not row:
                raise StorageError("独立图谱图片不存在")
            data = dict(row)
            content = asset_snapshots.read_checked(self.assets, data)
            return data, content

    def close(self):
        if self.lock_file:
            self.lock_file.close()
            self.lock_file = None
        self.ready = False
