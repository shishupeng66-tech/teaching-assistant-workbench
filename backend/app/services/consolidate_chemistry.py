"""Owner-authorized consolidation of the two imported chemistry books."""

from sqlalchemy import select, update, delete, insert
from app.core import library_models as m
from app.core.models import now
from app.services.classes import transaction, audit, BusinessError
from app.services.textbook_seed import identity, load

OLD_EDITION = "544e74d1db724c53a98f1e76e38b3075"
OLD_BOOK = "8fdb9e52e910445ca23171b425cd3640"


def consolidate(storage, directory, old_edition=OLD_EDITION, old_book=OLD_BOOK):
    payload, digest = load(directory)
    bid, eid = identity("grade8"), identity("grade8:edition")
    marker = identity("consolidate-junior-chemistry-v1")
    with storage.lock:
        backup = storage.backup()
        with transaction(storage) as s:
            previous = (
                s.execute(select(m.batches).where(m.batches.c.id == marker))
                .mappings()
                .first()
            )
            if previous:
                return dict(
                    already_done=True, backup=backup, book_id=bid, edition_id=eid
                )
            old_nodes = list(
                s.execute(
                    select(m.nodes.c.id).where(m.nodes.c.book_id == old_book)
                ).scalars()
            )
            old_books = list(
                s.execute(
                    select(m.books.c.id).where(m.books.c.edition_id == old_edition)
                ).scalars()
            )
            if old_nodes or any(x != old_book for x in old_books):
                raise BusinessError(
                    "原九年级目录已有内容或额外册别，拒绝自动删除，请先保留关联内容"
                )
            old_ed = (
                s.execute(select(m.editions).where(m.editions.c.id == old_edition))
                .mappings()
                .first()
            )
            if old_ed and old_ed["name"] != "九年级":
                raise BusinessError("原九年级版本身份已改变，拒绝删除")
            originals = {}
            for key in ("grade8", "grade9"):
                originals[key] = dict(
                    s.execute(select(m.books).where(m.books.c.id == identity(key)))
                    .mappings()
                    .one()
                )
            if originals["grade8"]["edition_id"] != eid or originals["grade9"][
                "edition_id"
            ] != identity("grade9:edition"):
                raise BusinessError("导入教材身份不匹配")
            target_subject = s.execute(
                select(m.editions.c.subject_id).where(m.editions.c.id == eid)
            ).scalar_one()
            if (
                s.execute(
                    select(m.editions.c.subject_id).where(
                        m.editions.c.id == identity("grade9:edition")
                    )
                ).scalar_one()
                != target_subject
            ):
                raise BusinessError("教材学科不一致")
            before = {
                k: [dict(row) for row in s.execute(select(t)).mappings()]
                for k, t in [
                    ("editions", m.editions),
                    ("books", m.books),
                    ("nodes", m.nodes),
                ]
            }
            for b in payload["books"]:
                expected = {identity(n["key"]) for n in b["nodes"]}
                actual = set(
                    s.execute(
                        select(m.nodes.c.id).where(
                            m.nodes.c.book_id == identity(b["key"])
                        )
                    ).scalars()
                )
                if actual != expected:
                    raise BusinessError("教材目录数量或身份已改变，拒绝遗漏额外目录")
            # Parent-first order satisfies existing scope triggers without disabling constraints.
            for b in payload["books"]:
                for n in b["nodes"]:
                    data = dict(book_id=bid)
                    if not n["parent_key"]:
                        if n["node_type"] == "theme":
                            # Original theme IDs and names are preserved; only global order changes.
                            theme_number = {
                                "主题一": 1,
                                "主题二": 2,
                                "主题三": 3,
                                "主题四": 4,
                                "主题五": 5,
                                "主题六": 6,
                            }[n["original_name"].split(" ")[0]]
                            data["position"] = theme_number * 10
                        else:
                            data.update(
                                position=70 if b["key"] == "grade8" else 80,
                                name=b["grade"] + "附录",
                            )
                    s.execute(
                        update(m.nodes)
                        .where(m.nodes.c.id == identity(n["key"]))
                        .values(**data)
                    )
            ed8 = next(x for x in before["editions"] if x["id"] == eid)
            ed9 = next(
                x for x in before["editions"] if x["id"] == identity("grade9:edition")
            )
            s.execute(
                update(m.editions)
                .where(m.editions.c.id == eid)
                .values(
                    name="初中化学",
                    description="教师授权合并的初中化学教学目录，六个主题连续排列。原教材版本并未改为同一出版版次。\n八年级来源："
                    + ed8["description"]
                    + "\n九年级来源："
                    + ed9["description"],
                )
            )
            s.execute(
                update(m.books)
                .where(m.books.c.id == bid)
                .values(grade="初中", volume="全一册")
            )
            for book_id in (identity("grade9"), old_book):
                s.execute(delete(m.books).where(m.books.c.id == book_id))
            for edition_id in (identity("grade9:edition"), old_edition):
                s.execute(delete(m.editions).where(m.editions.c.id == edition_id))
            result = dict(
                already_done=False,
                backup=backup,
                book_id=bid,
                edition_id=eid,
                nodes=65,
                themes=6,
                name="初中化学",
            )
            s.execute(
                insert(m.batches).values(
                    id=marker,
                    kind="textbook_consolidation",
                    scope_id="junior-chemistry",
                    file_hash=digest,
                    result=result,
                    created_at=now(),
                )
            )
            audit(s, "textbook.consolidate", "textbook_book", bid, before, result)
        storage.journal("textbook.consolidated", result)
        return result
