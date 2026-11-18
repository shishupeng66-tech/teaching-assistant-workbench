import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Feedback } from "../components/Drawer";
import { useCatalog } from "../features/library/useCatalog";
import CatalogEditor from "../features/library/CatalogEditor";
import type { CatalogKind } from "../features/library/CatalogEditor";
import ChapterTree from "../features/library/ChapterTree";
import LibraryImport from "../features/library/LibraryImport";
import { nodePath } from "../features/library/types";
export default function CatalogManager() {
  const { catalog: c, error: loadError, reload } = useCatalog();
  const [selection, setSelection] = useState({
      subject: "",
      edition: "",
      book: "",
      node: "",
    }),
    [editor, setEditor] = useState<{
      kind: CatalogKind;
      existing?: Record<string, unknown>;
    } | null>(null),
    [importing, setImporting] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const subject =
    c.subjects.find((s) => s.id === selection.subject) || c.subjects[0];
  const editions = c.editions.filter((e) => e.subject_id === subject?.id),
    edition = editions.find((e) => e.id === selection.edition) || editions[0];
  const books = c.books.filter((b) => b.edition_id === edition?.id),
    book = books.find((b) => b.id === selection.book) || books[0];
  const nodes = c.nodes.filter((n) => n.book_id === book?.id);
  const node = nodes.find((n) => n.id === selection.node);
  function edit(kind: CatalogKind, existing?: object) {
    setEditor({
      kind,
      existing: existing as Record<string, unknown> | undefined,
    });
  }
  return (
    <>
      <div className="library-heading">
        <div>
          <h1>教材目录管理</h1>
          <p>
            独立管理学科、版本、册别与章节；不自动生成未经核实的出版社目录。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/questions">返回题库</Link>
        </Button>
      </div>
      <Feedback error={error || loadError} message={message} />
      <div className="catalog-levels">
        <section className="card">
          <h2>学科</h2>
          <select
            aria-label="管理学科"
            value={subject?.id || ""}
            onChange={(e) =>
              setSelection({
                subject: e.target.value,
                edition: "",
                book: "",
                node: "",
              })
            }
          >
            <option value="" disabled>
              请选择
            </option>
            {c.subjects.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
                {!s.active ? "（停用）" : ""}
              </option>
            ))}
          </select>
          <div className="toolbar-actions">
            <Button onClick={() => edit("subjects")}>新增学科</Button>
            <Button
              variant="outline"
              disabled={!subject}
              onClick={() => edit("subjects", subject)}
            >
              编辑学科
            </Button>
          </div>
        </section>
        <section className="card">
          <h2>教材版本</h2>
          <select
            aria-label="管理教材版本"
            value={edition?.id || ""}
            onChange={(e) =>
              setSelection({
                ...selection,
                edition: e.target.value,
                book: "",
                node: "",
              })
            }
          >
            <option value="" disabled>
              请选择
            </option>
            {editions.map((x) => (
              <option value={x.id} key={x.id}>
                {x.name}
                {!x.active ? "（停用）" : ""}
              </option>
            ))}
          </select>
          <div className="toolbar-actions">
            <Button disabled={!subject} onClick={() => edit("editions")}>
              新增教材版本
            </Button>
            <Button
              variant="outline"
              disabled={!edition}
              onClick={() => edit("editions", edition)}
            >
              编辑版本
            </Button>
          </div>
        </section>
        <section className="card">
          <h2>年级 / 册别</h2>
          <select
            aria-label="管理册别"
            value={book?.id || ""}
            onChange={(e) =>
              setSelection({ ...selection, book: e.target.value, node: "" })
            }
          >
            <option value="" disabled>
              请选择
            </option>
            {books.map((x) => (
              <option value={x.id} key={x.id}>
                {x.grade} · {x.volume}
                {!x.active ? "（停用）" : ""}
              </option>
            ))}
          </select>
          <div className="toolbar-actions">
            <Button disabled={!edition} onClick={() => edit("books")}>
              新增册别
            </Button>
            <Button
              variant="outline"
              disabled={!book}
              onClick={() => edit("books", book)}
            >
              编辑册别
            </Button>
          </div>
        </section>
      </div>
      <div className="catalog-workspace">
        <aside className="card">
          <div className="catalog-tree-title">
            <h2>教材目录树</h2>
          </div>
          <ChapterTree
            nodes={nodes}
            selected={node?.id}
            onSelect={(id) => setSelection({ ...selection, node: id })}
            onReload={reload}
            onError={setError}
          />
        </aside>
        <section className="card catalog-node-detail">
          <h2>{node?.name || "目录节点"}</h2>
          {node && (
            <>
              <div className="chapter-path">{nodePath(c, node.id)}</div>
              <p>{node.description || "暂无教学目标或说明"}</p>
              <dl className="profile-grid">
                <div>
                  <dt>稳定节点 ID</dt>
                  <dd>
                    <code>{node.id}</code>
                  </dd>
                </div>
                <div>
                  <dt>状态</dt>
                  <dd>{node.active ? "启用" : "停用"}</dd>
                </div>
              </dl>
            </>
          )}
          <div className="toolbar-actions">
            <Button disabled={!book} onClick={() => edit("nodes")}>
              新增目录节点
            </Button>
            <Button
              variant="outline"
              disabled={!node}
              onClick={() => edit("nodes", node)}
            >
              编辑当前节点
            </Button>
            <Button
              variant="outline"
              disabled={!book}
              onClick={() => setImporting(true)}
            >
              批量导入目录
            </Button>
          </div>
          <p className="form-help">
            新建节点默认放在当前所选节点下，可在抽屉选择其他父级。使用树旁箭头调整同级顺序。停用代替删除，所有已有题目与知识点引用保留。
          </p>
        </section>
      </div>
      {editor && (
        <CatalogEditor
          kind={editor.kind}
          existing={editor.existing}
          subjectId={subject?.id}
          editionId={edition?.id}
          bookId={book?.id}
          parentId={node?.id}
          catalog={c}
          onClose={() => setEditor(null)}
          onSaved={(id) => {
            setSelection((old) => ({
              ...old,
              ...(editor.kind === "subjects"
                ? { subject: id, edition: "", book: "", node: "" }
                : editor.kind === "editions"
                  ? { edition: id, book: "", node: "" }
                  : editor.kind === "books"
                    ? { book: id, node: "" }
                    : { node: id }),
            }));
            setEditor(null);
            setMessage("教材资料已保存，原有关联 ID 保持");
            reload();
          }}
        />
      )}
      {importing && book && (
        <LibraryImport
          kind="nodes"
          scopeId={book.id}
          onClose={() => setImporting(false)}
          onSaved={reload}
        />
      )}
    </>
  );
}
