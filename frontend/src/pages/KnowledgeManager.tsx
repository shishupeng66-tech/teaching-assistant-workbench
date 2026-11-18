import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Feedback } from "../components/Drawer";
import { useCatalog } from "../features/library/useCatalog";
import PointEditor from "../features/library/PointEditor";
export default function KnowledgeManager() {
  const [params] = useSearchParams();
  const { catalog: c, error, reload } = useCatalog();
  const [subjectId, setSubject] = useState(params.get("subject") || ""),
    [q, setQ] = useState(""),
    [inactive, setInactive] = useState(false),
    [editor, setEditor] = useState<{ identity?: string } | null>(
      params.get("new") === "1" ? {} : null,
    ),
    [message, setMessage] = useState("");
  const subject = c.subjects.find((s) => s.id === subjectId) || c.subjects[0];
  const points = c.points.filter(
    (p) =>
      p.subject_id === subject?.id &&
      (inactive || p.active) &&
      (p.name.includes(q) || p.code.includes(q) || p.description.includes(q)),
  );
  return (
    <>
      <div className="library-heading">
        <div>
          <h1>知识点主库</h1>
          <p>知识点身份独立于教材，同一知识点可映射多版本、多章节。</p>
        </div>
        <div className="toolbar-actions">
          <Button asChild variant="outline">
            <Link to="/questions">返回题库</Link>
          </Button>
          <Button disabled={!subject} onClick={() => setEditor({})}>
            新增知识点
          </Button>
        </div>
      </div>
      <Feedback error={error} message={message} />
      <div className="knowledge-tools">
        <select
          aria-label="知识点学科"
          value={subject?.id || ""}
          onChange={(e) => setSubject(e.target.value)}
        >
          {c.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          aria-label="搜索知识点"
          placeholder="搜索名称、编码、说明"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="check-label">
          <input
            type="checkbox"
            checked={inactive}
            onChange={(e) => setInactive(e.target.checked)}
          />
          包含停用知识点
        </label>
      </div>
      <section className="card knowledge-list">
        {points.map((p) => (
          <button key={p.id} onClick={() => setEditor({ identity: p.id })}>
            <div>
              <strong>
                {p.name}{" "}
                {p.review_status === "pending"
                  ? "（待审核）"
                  : p.review_status === "rejected"
                    ? "（已拒绝）"
                    : ""}
              </strong>
              <small>
                {p.code} ·{" "}
                {p.parent_id
                  ? `上级：${c.points.find((x) => x.id === p.parent_id)?.name || "—"}`
                  : "顶层知识点"}
              </small>
              <p>{p.description || "暂无说明"}</p>
            </div>
            <div className="knowledge-meta">
              <span>
                {c.mappings.filter((x) => x.knowledge_point_id === p.id).length}{" "}
                个正式教材映射 · 候选{" "}
                {
                  (c.candidates || []).filter(
                    (x) => x.point_id === p.id && x.status === "pending",
                  ).length
                }{" "}
                个
              </span>
              <span className="badge">{p.active ? "启用" : "停用"}</span>
            </div>
          </button>
        ))}
        {!points.length && (
          <p className="loading-state">
            暂无知识点。请先选择或创建学科，再由教师新增。
          </p>
        )}
      </section>
      {editor && subject && (
        <PointEditor
          identity={editor.identity}
          nodeId={
            !editor.identity ? params.get("node") || undefined : undefined
          }
          catalog={c}
          subjectId={subject.id}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setMessage("知识点已保存，永久 ID 与原有题目关联保持");
            reload();
          }}
        />
      )}
    </>
  );
}
