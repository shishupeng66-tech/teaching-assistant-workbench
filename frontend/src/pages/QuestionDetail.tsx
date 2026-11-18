import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Button } from "../components/ui/button";
import Drawer, { Feedback } from "../components/Drawer";
import { RichView, validateMath } from "../features/library/RichView";
import { useCatalog } from "../features/library/useCatalog";
import { statuses, bookLabel, nodePath } from "../features/library/types";
import type { QuestionDetail as Detail } from "../features/library/types";
export default function QuestionDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { catalog: c } = useCatalog();
  const [item, setItem] = useState<Detail | null>(null),
    [tick, setTick] = useState(0),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [version, setVersion] = useState(0),
    [action, setAction] = useState<"approve" | "reject" | "archive" | null>(
      null,
    ),
    [note, setNote] = useState(""),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false);
  const back = params.get("back")?.startsWith("/questions")
    ? params.get("back")!
    : "/questions";
  useEffect(() => {
    let active = true;
    api<Detail>(`/library/questions/${id}`)
      .then((q) => {
        if (active) {
          setItem(q);
          setError("");
          setVersion(0);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, tick]);
  async function review(choice: string) {
    if (!item) return;
    setBusy(true);
    setError("");
    try {
      await api(`/library/questions/${id}/review`, {
        action: choice,
        expected_version: item.version,
        note,
      });
      setAction(null);
      setNote("");
      setAck(false);
      setMessage("状态变更已记录，历史版本保留");
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "审核失败");
    } finally {
      setBusy(false);
    }
  }
  let formulaError = "";
  if (item) {
    try {
      for (const doc of [
        item.stem,
        item.answer,
        item.explanation,
        ...item.parts.map((p) => p.rubric),
      ])
        validateMath(doc);
    } catch {
      formulaError =
        "当前版本包含无法渲染的公式，请编辑修正后再提交或通过审核。";
    }
  }
  const display = version
    ? item?.revisions.find((r) => r.version === version)?.snapshot
    : item;
  return (
    <>
      <div className="library-heading compact">
        <div className="toolbar-actions">
          <Button asChild variant="outline">
            <Link to={back}>返回题库</Link>
          </Button>
          <h1>题目详情</h1>
        </div>
        {item && (
          <div className="toolbar-actions">
            <Button
              asChild
              variant="outline"
              disabled={item.status === "archived"}
            >
              <Link
                aria-disabled={item.status === "archived"}
                to={
                  item.status === "archived"
                    ? "#"
                    : `/questions/${id}/edit?back=${encodeURIComponent(back)}`
                }
              >
                编辑题目
              </Link>
            </Button>
            {item.status === "draft" && (
              <Button
                disabled={busy || !!formulaError}
                onClick={() => void review("submit")}
              >
                提交审核
              </Button>
            )}
            {item.status === "pending" && (
              <>
                <Button
                  disabled={busy || !!formulaError}
                  onClick={() => {
                    setAction("approve");
                    setAck(false);
                  }}
                >
                  审核通过
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setAction("reject");
                    setAck(false);
                  }}
                >
                  退回草稿
                </Button>
              </>
            )}
            {item.status !== "archived" && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setAction("archive");
                  setAck(false);
                }}
              >
                归档题目
              </Button>
            )}
          </div>
        )}
      </div>
      <Feedback error={error || formulaError} message={message} />
      {!item || !display ? (
        <p className="loading-state">读取题目…</p>
      ) : (
        <>
          <section className="card question-detail-meta">
            <div className="question-row-meta">
              <span className="badge">{display.question_type}</span>
              <span>
                {c.subjects.find((s) => s.id === display.subject_id)?.name} ·{" "}
                {display.grade || "未设年级"} · 难度 {display.difficulty}
              </span>
              <span className={`review-badge ${item.status}`}>
                {statuses[item.status]}
              </span>
            </div>
            <p>
              永久 ID：<code>{item.id}</code> · 当前 v{item.version}
            </p>
            <p>
              来源：{display.source || "未填写"} ·{" "}
              {display.source_kind === "import" ? "批量导入" : "教师手工录入"} ·
              创建 {new Date(item.created_at).toLocaleString("zh-CN")} · 修改{" "}
              {new Date(item.updated_at).toLocaleString("zh-CN")}
            </p>
            <label className="revision-select">
              查看内容版本
              <select
                aria-label="查看题目历史版本"
                value={version}
                onChange={(e) => setVersion(Number(e.target.value))}
              >
                <option value="0">当前内容 v{item.version}</option>
                {item.revisions.map((r) => (
                  <option key={r.id} value={r.version}>
                    v{r.version} · {r.reason} ·{" "}
                    {new Date(r.created_at).toLocaleString("zh-CN")}
                  </option>
                ))}
              </select>
            </label>
            {version > 0 && (
              <p className="historical-notice">
                正在查看不可变的历史内容快照。审核按钮始终针对当前版本，当前状态见上方。
              </p>
            )}
          </section>
          {[
            ["题干", display.stem],
            ["标准答案", display.answer],
            ["解析", display.explanation],
          ].map(([label, doc]) => (
            <section
              className="card question-detail-content"
              key={label as string}
            >
              <h2>{label as string}</h2>
              <RichView doc={doc as Detail["stem"]} />
            </section>
          ))}
          <section className="card question-detail-content">
            <h2>知识点与教材引用</h2>
            <div className="knowledge-chips">
              {display.knowledge_links.map((k) => (
                <span key={k.knowledge_point_id} className="badge">
                  {c.points.find((p) => p.id === k.knowledge_point_id)?.name ||
                    k.knowledge_point_id}
                  {k.is_primary ? " · 主要" : ""}
                  {k.weight !== null ? ` · 权重 ${k.weight}` : ""}
                  {k.part_refs.length ? ` · 小问 ${k.part_refs.join(",")}` : ""}
                </span>
              ))}
            </div>
            <ul className="chapter-reference-list">
              {(version
                ? display.node_ids.map((nid) => ({
                    id: nid,
                    path: c.nodes.find((n) => n.id === nid)?.name || nid,
                    book_id: c.nodes.find((n) => n.id === nid)?.book_id || "",
                  }))
                : item.chapter_references
              ).map((n) => (
                <li key={n.id}>
                  <Link
                    to={`/questions?subject=${item.subject_id}&book=${n.book_id}&node=${n.id}&mode=chapter`}
                  >
                    {bookLabel(c, n.book_id)} · {n.path}
                  </Link>
                </li>
              ))}
            </ul>
            {!version &&
              (c.candidates || []).some(
                (x) => x.question_id === item.id && x.status === "pending",
              ) && (
                <>
                  <h3>候选教材关联（待教师确认）</h3>
                  <ul>
                    {(c.candidates || [])
                      .filter(
                        (x) =>
                          x.question_id === item.id && x.status === "pending",
                      )
                      .map((x) => (
                        <li key={x.node_id}>
                          <Link to={`/questions?node=${x.node_id}`}>
                            {nodePath(c, x.node_id)}
                          </Link>
                          <p className="form-help">{x.reason}</p>
                        </li>
                      ))}
                  </ul>
                  <Link to="/questions/review">前往集中审核确认关联</Link>
                </>
              )}
            {display.parts.length > 0 && (
              <div className="part-previews">
                <h3>小问与评分依据预留</h3>
                {display.parts.map((p) => (
                  <div key={p.ref}>
                    <strong>
                      小问 {p.ref} ·{" "}
                      {p.max_score === null ? "未设满分" : `${p.max_score} 分`}
                    </strong>
                    <RichView doc={p.rubric} />
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="card question-detail-content">
            <h2>审核记录</h2>
            {!item.reviews.length && (
              <p className="form-help">
                尚无审核操作，当前题目仍须教师提交并审核。
              </p>
            )}
            <ul className="operation-list">
              {item.reviews.map((r) => (
                <li key={r.id}>
                  <strong>
                    {{
                      submit: "提交审核",
                      approve: "教师审核通过",
                      reject: "退回草稿",
                      archive: "归档",
                      draft: "退回草稿",
                    }[r.action] || r.action}{" "}
                    · v{r.version}
                  </strong>
                  <small>
                    {statuses[r.before_status]} → {statuses[r.after_status]} ·{" "}
                    {new Date(r.created_at).toLocaleString("zh-CN")}
                  </small>
                  <p>{r.note || "无备注"}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="card question-detail-content">
            <h2>历史修改记录</h2>
            <ul className="operation-list">
              {item.revisions.map((r) => (
                <li key={r.id}>
                  <strong>
                    v{r.version} · {r.reason}
                  </strong>
                  <small>
                    {new Date(r.created_at).toLocaleString("zh-CN")}
                  </small>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setVersion(r.version);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    查看此版本快照
                  </Button>
                </li>
              ))}
            </ul>
            <p className="form-help">
              永久题目 ID +
              不可变版本快照供后续试卷引用；当前阶段不创建试卷或考试。
            </p>
          </section>
        </>
      )}
      {action && item && (
        <Drawer
          title={
            action === "approve"
              ? "审核当前题目"
              : action === "reject"
                ? "退回题目草稿"
                : "归档当前题目"
          }
          busy={busy}
          onClose={() => setAction(null)}
        >
          <Feedback error={error} />
          <p className="form-help">
            本次操作针对当前 v{item.version}
            。编辑后须重新审核；所有内容与审核历史保留，不自动合并题目。
          </p>
          <label className="editor-label">
            {action === "reject" ? "退回原因（必填）" : "审核 / 归档备注"}
            <textarea
              rows={4}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            {action === "approve"
              ? "我已核对当前题目、答案和关联，确认审核通过"
              : action === "reject"
                ? "确认退回草稿并保留旧版本"
                : "确认归档此题，保留所有历史引用"}
          </label>
          <Button
            disabled={busy || !ack || (action === "reject" && !note.trim())}
            onClick={() => void review(action)}
          >
            确认
            {action === "approve"
              ? "审核通过"
              : action === "reject"
                ? "退回草稿"
                : "归档题目"}
          </Button>
        </Drawer>
      )}
    </>
  );
}
