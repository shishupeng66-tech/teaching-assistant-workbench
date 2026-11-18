import { useState } from "react";
import type { FormEvent } from "react";
import Drawer, { Feedback } from "../../components/Drawer";
import { Button } from "../../components/ui/button";
import { api } from "../../api";
import type { Catalog } from "./types";
import { nodePath } from "./types";
export type CatalogKind = "subjects" | "editions" | "books" | "nodes";
const names = {
  subjects: "学科",
  editions: "教材版本",
  books: "教材册别",
  nodes: "目录节点",
};
export default function CatalogEditor({
  kind,
  existing,
  subjectId,
  editionId,
  bookId,
  parentId,
  catalog,
  onClose,
  onSaved,
}: {
  kind: CatalogKind;
  existing?: Record<string, unknown>;
  subjectId?: string;
  editionId?: string;
  bookId?: string;
  parentId?: string;
  catalog: Catalog;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState({
    name: String(existing?.name || ""),
    code: String(existing?.code || ""),
    subject_id: String(existing?.subject_id || subjectId || ""),
    edition_id: String(existing?.edition_id || editionId || ""),
    book_id: String(existing?.book_id || bookId || ""),
    parent_id: existing ? String(existing.parent_id || "") : parentId || "",
    grade: String(existing?.grade || ""),
    volume: String(existing?.volume || ""),
    kind: String(existing?.kind || "chapter"),
    position: Number(existing?.position ?? 10),
    description: String(existing?.description || ""),
    active: existing ? !!existing.active : true,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ id: string }>(
        `/library/catalog/${kind}${existing ? "/" + existing.id : ""}`,
        {
          ...form,
          subject_id: form.subject_id || null,
          edition_id: form.edition_id || null,
          book_id: form.book_id || null,
          parent_id: form.parent_id || null,
        },
      );
      onSaved(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  const subject = catalog.subjects.find((s) => s.id === form.subject_id);
  const edition = catalog.editions.find((s) => s.id === form.edition_id);
  return (
    <Drawer
      title={`${existing ? "编辑" : "新增"}${names[kind]}`}
      busy={busy}
      onClose={onClose}
    >
      <Feedback error={error} />
      <form className="editor-form" onSubmit={(e) => void save(e)}>
        {kind !== "books" && (
          <label>
            {names[kind]}名称
            <input
              required
              maxLength={100}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
        )}
        {kind === "subjects" && (
          <label>
            学科编码
            <input
              required
              maxLength={50}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </label>
        )}
        {kind === "editions" && (
          <p className="form-help">
            所属学科：{subject?.name || "未选择"}
            。版本信息由教师核实录入，不自动生成出版社目录。
          </p>
        )}
        {kind === "books" && (
          <>
            <p className="form-help">所属版本：{edition?.name || "未选择"}</p>
            <label>
              年级
              <input
                required
                maxLength={40}
                value={form.grade}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
              />
            </label>
            <label>
              学期 / 册别
              <input
                required
                maxLength={60}
                placeholder="例如 上册、必修第一册"
                value={form.volume}
                onChange={(e) => setForm({ ...form, volume: e.target.value })}
              />
            </label>
          </>
        )}
        {kind === "nodes" && (
          <>
            <label>
              节点层级
              <select
                aria-label="节点层级"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                <option value="chapter">章</option>
                <option value="section">节</option>
                <option value="lesson">课时</option>
              </select>
            </label>
            <label>
              父级目录
              <select
                aria-label="父级目录"
                value={form.parent_id}
                onChange={(e) =>
                  setForm({ ...form, parent_id: e.target.value })
                }
              >
                <option value="">无（册别根目录）</option>
                {catalog.nodes
                  .filter(
                    (n) => n.book_id === form.book_id && n.id !== existing?.id,
                  )
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {nodePath(catalog, n.id)}
                      {!n.active ? "（停用）" : ""}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              同级排序
              <input
                required
                type="number"
                min="0"
                max="100000"
                value={form.position}
                onChange={(e) =>
                  setForm({ ...form, position: Number(e.target.value) })
                }
              />
            </label>
          </>
        )}
        {kind !== "subjects" && kind !== "books" && (
          <label>
            {kind === "nodes" ? "教学目标 / 说明" : "版本说明"}
            <textarea
              rows={4}
              maxLength={5000}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
        )}
        <label className="check-label">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          启用此{names[kind]}
        </label>
        <p className="form-help">
          停用保留原有题目、知识点及历史关联。目录可调整父级，但不能形成循环或跨册别移动。
        </p>
        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </Button>
          <Button disabled={busy}>保存{names[kind]}</Button>
        </div>
      </form>
    </Drawer>
  );
}
