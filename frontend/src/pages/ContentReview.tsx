import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Button } from "../components/ui/button";
import { Feedback } from "../components/Drawer";
import { useCatalog } from "../features/library/useCatalog";
import { nodePath, statuses } from "../features/library/types";
import type { Point, Question } from "../features/library/types";
import { RichView } from "../features/library/RichView";
type Result = { points: Point[]; questions: Question[]; scope: string };
type Preview = {
  batch_id: string;
  scope: string;
  action: string;
  point_count: number;
  question_count: number;
  items: {
    kind: string;
    id: string;
    candidate_ids: string[];
    value: Point & Question;
  }[];
};
export default function ContentReview() {
  const { catalog: c, reload } = useCatalog();
  const [params] = useSearchParams();
  const [node, setNode] = useState(params.get("node") || ""),
    [status, setStatus] = useState("pending"),
    [result, setResult] = useState<Result | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0),
    [preview, setPreview] = useState<Preview | null>(null),
    [note, setNote] = useState("");
  useEffect(() => {
    let live = true;
    setBusy(true);
    setPreview(null);
    setSelected([]);
    api<Result>(`/library/content-review?node_id=${node}&status=${status}`)
      .then((v) => {
        if (live) {
          setResult(v);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [node, status, tick]);
  const ids = [
    ...(result?.points || []).map((p) => "p:" + p.id),
    ...(result?.questions || []).map((q) => "q:" + q.id),
  ];
  function toggle(id: string) {
    setPreview(null);
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  }
  async function prepare(action: string) {
    setBusy(true);
    setError("");
    try {
      setPreview(
        await api<Preview>("/library/content-review/preview", {
          node_id: node,
          point_ids: selected
            .filter((x) => x.startsWith("p:"))
            .map((x) => x.slice(2)),
          question_ids: selected
            .filter((x) => x.startsWith("q:"))
            .map((x) => x.slice(2)),
          action,
          note,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await api<{ processed: number }>(
        "/library/content-review/commit",
        { batch_id: preview.batch_id, confirmation: "确认本批审核" },
      );
      setMessage(`已处理 ${r.processed} 项，审核和关联记录已保存`);
      setPreview(null);
      setTick((t) => t + 1);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function pointBody(p: Point) {
    return (
      <>
        <p>{p.description}</p>
        <p>
          <b>教学要求：</b>
          {p.teaching_requirements}
        </p>
        <ul>
          {p.mastery_criteria?.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <small>{p.content_source}</small>
        <details>
          <summary>审核历史</summary>
          {p.content_reviews?.map((r, i) => (
            <p key={i}>
              {r.created_at} {r.action} {r.note}
            </p>
          ))}
        </details>
      </>
    );
  }
  function questionBody(q: Question) {
    return (
      <>
        <RichView doc={q.stem} />
        <h4>参考答案</h4>
        <RichView doc={q.answer} />
        <h4>解析</h4>
        <RichView doc={q.explanation} />
        <small>{q.source}</small>
      </>
    );
  }
  return (
    <>
      <div className="library-heading compact">
        <h1>教材内容集中审核</h1>
        <Button asChild variant="outline">
          <Link to="/questions">返回题库</Link>
        </Button>
      </div>
      <Feedback error={error} message={message} />
      <section className="card review-controls">
        <p>
          原创教学草案需教师核实。批准内容时，同时确认本次范围内列出的候选章节关联；不会自动批准范围外关联。
        </p>
        <label>
          主题 / 专题 / 课题范围
          <select
            aria-label="审核章节范围"
            value={node}
            onChange={(e) => setNode(e.target.value)}
          >
            <option value="">全部教材</option>
            {c.nodes
              .filter((n) => n.active)
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {nodePath(c, n.id)}
                </option>
              ))}
          </select>
        </label>
        <label>
          内容状态
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">待审核</option>
            <option value="">全部状态与审核记录</option>
            <option value="approved">已审核</option>
            <option value="rejected">已退回知识点</option>
            <option value="draft">退回 / 编辑后题目草稿</option>
          </select>
        </label>
        <p>
          范围：{result?.scope}（含下级，实体去重）· 知识点{" "}
          {result?.points.length || 0} · 题目 {result?.questions.length || 0}
        </p>
        <div className="toolbar-actions">
          <Button
            disabled={busy || status !== "pending"}
            variant="outline"
            onClick={() => {
              setSelected(ids);
              setPreview(null);
            }}
          >
            选择当前范围全部待审核内容
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setSelected([]);
              setPreview(null);
            }}
          >
            清空选择
          </Button>
          <span>已选 {selected.length} 项</span>
        </div>
        <label>
          审核备注 / 退回原因
          <textarea
            value={note}
            maxLength={2000}
            onChange={(e) => {
              setNote(e.target.value);
              setPreview(null);
            }}
          />
        </label>
        <div className="toolbar-actions">
          <Button
            disabled={busy || !selected.length || status !== "pending"}
            onClick={() => void prepare("approve")}
          >
            预览批量批准
          </Button>
          <Button
            variant="outline"
            disabled={
              busy || !selected.length || !note.trim() || status !== "pending"
            }
            onClick={() => void prepare("reject")}
          >
            预览退回
          </Button>
        </div>
      </section>
      {preview && (
        <section className="card review-confirm">
          <h2>本批审核预览</h2>
          <p>
            范围：{preview.scope} · 操作：
            {preview.action === "approve" ? "批准" : "退回"} · 知识点{" "}
            {preview.point_count} · 题目 {preview.question_count}
          </p>
          <p>请逐项检查下方内容及候选关联；确认后才会保存审核结果。</p>
          {preview.items.map((i) => (
            <details key={i.id}>
              <summary>
                {i.kind === "point"
                  ? i.value.name
                  : "题目 " + i.value.id.slice(0, 8)}
              </summary>
              {i.kind === "point" ? pointBody(i.value) : questionBody(i.value)}
              <p>
                候选关联：
                {(
                  (
                    i.value as unknown as {
                      candidates: {
                        id: string;
                        node_id: string;
                        status: string;
                        reason: string;
                      }[];
                    }
                  ).candidates || []
                )
                  .filter((x) => i.candidate_ids.includes(x.id))
                  .map((x) => (
                    <span key={x.node_id}>
                      {nodePath(c, x.node_id)}（{x.reason}）；
                    </span>
                  ))}
              </p>
            </details>
          ))}
          <Button disabled={busy} onClick={() => void commit()}>
            确认本批审核
          </Button>
          <Button variant="ghost" onClick={() => setPreview(null)}>
            取消，继续检查
          </Button>
        </section>
      )}
      {busy && <p>正在读取或处理…</p>}
      <section className="card review-items">
        <h2>知识点说明与掌握标准</h2>
        {result?.points.map((p) => (
          <article key={p.id}>
            <label className="check-label">
              <input
                type="checkbox"
                disabled={status !== "pending" || busy}
                checked={selected.includes("p:" + p.id)}
                onChange={() => toggle("p:" + p.id)}
              />
              <b>{p.name}</b> ·{" "}
              {p.review_status === "approved"
                ? "已审核"
                : p.review_status === "rejected"
                  ? "已退回"
                  : "待审核"}
            </label>
            {pointBody(p)}
            <Link to={`/questions/knowledge?subject=${p.subject_id}`}>
              编辑知识点
            </Link>
          </article>
        ))}
      </section>
      <section className="card review-items">
        <h2>题目、答案和解析</h2>
        {result?.questions.map((q) => (
          <article key={q.id}>
            <label className="check-label">
              <input
                type="checkbox"
                disabled={status !== "pending" || busy}
                checked={selected.includes("q:" + q.id)}
                onChange={() => toggle("q:" + q.id)}
              />
              <b>
                {q.question_type} · 难度 {q.difficulty}
              </b>{" "}
              · {statuses[q.status]}
            </label>
            <details>
              <summary>预览题目、答案与解析</summary>
              {questionBody(q)}
            </details>
            <Link
              to={`/questions/${q.id}?back=${encodeURIComponent("/questions/review?node=" + node)}`}
            >
              详情 / 修改 / 审核记录
            </Link>
          </article>
        ))}
      </section>
    </>
  );
}
