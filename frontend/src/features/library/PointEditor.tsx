import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Drawer, { Feedback } from "../../components/Drawer";
import { Button } from "../../components/ui/button";
import { api } from "../../api";
import { nodeSubject, nodePath, bookLabel } from "./types";
import type { Catalog, Point } from "./types";
type PointDetail = Point & {
  prerequisite_ids: string[];
  related_ids: string[];
  node_ids: string[];
};
export default function PointEditor({
  catalog: c,
  subjectId,
  identity,
  nodeId,
  onClose,
  onSaved,
}: {
  catalog: Catalog;
  subjectId: string;
  identity?: string;
  nodeId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
      teaching_requirements: "",
      mastery_text: "",
      difficulty_min: 1,
      difficulty_max: 5,
      content_source: "",
      expected_version: undefined as number | undefined,
      subject_id: subjectId,
      name: "",
      code: "",
      description: "",
      parent_id: "",
      active: true,
      prerequisite_ids: [] as string[],
      related_ids: [] as string[],
      node_ids: nodeId ? [nodeId] : ([] as string[]),
    }),
    [loading, setLoading] = useState(!!identity),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [nodeQ, setNodeQ] = useState("");
  useEffect(() => {
    let active = true;
    if (identity)
      api<PointDetail>(`/library/knowledge-points/${identity}`)
        .then((p) => {
          if (active)
            setForm({
              teaching_requirements: p.teaching_requirements || "",
              mastery_text: (p.mastery_criteria || []).join("\n"),
              difficulty_min: p.difficulty_min || 1,
              difficulty_max: p.difficulty_max || 5,
              content_source: p.content_source || "",
              expected_version: p.profile_version,
              subject_id: p.subject_id,
              name: p.name,
              code: p.code,
              description: p.description,
              parent_id: p.parent_id || "",
              active: !!p.active,
              prerequisite_ids: p.prerequisite_ids,
              related_ids: p.related_ids,
              node_ids: p.node_ids,
            });
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    return () => {
      active = false;
    };
  }, [identity]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/library/knowledge-points${identity ? "/" + identity : ""}`, {
        ...Object.fromEntries(
          Object.entries(form).filter(([k]) => k !== "mastery_text"),
        ),
        mastery_criteria: form.mastery_text
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
        parent_id: form.parent_id || null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  const peers = c.points.filter(
    (p) => p.subject_id === form.subject_id && p.id !== identity,
  );
  function toggleNode(id: string) {
    setForm((old) => ({
      ...old,
      node_ids: old.node_ids.includes(id)
        ? old.node_ids.filter((x) => x !== id)
        : [...old.node_ids, id],
    }));
  }
  return (
    <Drawer
      title={identity ? "编辑知识点" : "新增知识点"}
      onClose={onClose}
      busy={busy}
    >
      <Feedback error={error} />
      {loading ? (
        <p className="loading-state">读取知识点…</p>
      ) : (
        <form className="editor-form" onSubmit={(e) => void save(e)}>
          <label>
            知识点名称
            <input
              required
              maxLength={100}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            知识点编码
            <input
              required
              maxLength={50}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </label>
          <label>
            知识点说明
            <textarea
              rows={4}
              maxLength={5000}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <label>
            教学要求
            <textarea
              value={form.teaching_requirements}
              onChange={(e) =>
                setForm({ ...form, teaching_requirements: e.target.value })
              }
            />
          </label>
          <label>
            掌握标准（每行一项）
            <textarea
              value={form.mastery_text}
              onChange={(e) =>
                setForm({ ...form, mastery_text: e.target.value })
              }
            />
          </label>
          <label>
            内容来源
            <textarea
              value={form.content_source}
              onChange={(e) =>
                setForm({ ...form, content_source: e.target.value })
              }
            />
          </label>
          <p className="form-help">
            原创种子知识点修改后回到待审核；候选章节关联请在集中审核中确认。
          </p>
          <label>
            上级知识点
            <select
              aria-label="上级知识点"
              value={form.parent_id}
              onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
            >
              <option value="">无（顶层知识点）</option>
              {peers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            前置知识点
            <select
              multiple
              aria-label="前置知识点"
              value={form.prerequisite_ids}
              onChange={(e) =>
                setForm({
                  ...form,
                  prerequisite_ids: Array.from(e.target.selectedOptions).map(
                    (o) => o.value,
                  ),
                })
              }
            >
              {peers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            相关知识点
            <select
              multiple
              aria-label="相关知识点"
              value={form.related_ids}
              onChange={(e) =>
                setForm({
                  ...form,
                  related_ids: Array.from(e.target.selectedOptions).map(
                    (o) => o.value,
                  ),
                })
              }
            >
              {peers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </label>
          <p className="form-help">
            多选可按住
            Command。前置方向为“本知识点需要先掌握所选知识点”，系统拒绝循环。
          </p>
          <div>
            <h3>教材章节 / 课时映射</h3>
            <input
              aria-label="搜索映射章节"
              placeholder="搜索章节路径"
              value={nodeQ}
              onChange={(e) => setNodeQ(e.target.value)}
            />
            <div className="reference-picker">
              {c.nodes
                .filter(
                  (n) =>
                    nodeSubject(c, n.id) === form.subject_id &&
                    nodePath(c, n.id).includes(nodeQ),
                )
                .map((n) => (
                  <label key={n.id}>
                    <input
                      type="checkbox"
                      checked={form.node_ids.includes(n.id)}
                      onChange={() => toggleNode(n.id)}
                    />
                    <span>
                      {bookLabel(c, n.book_id)}
                      <small>
                        {nodePath(c, n.id)}
                        {!n.active ? "（停用）" : ""}
                      </small>
                    </span>
                  </label>
                ))}
            </div>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            启用此知识点
          </label>
          <p className="form-help">
            永久 ID
            与教材章节独立，停用不会删除已有引用。种子内容保存修改后仍需集中审核；保存不等于批准。
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
            <Button disabled={busy}>保存知识点</Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
