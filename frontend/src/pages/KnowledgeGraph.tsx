import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Feedback } from "../components/Drawer";
import { api } from "../api";
import type { Chapter, Point } from "../features/library/types";

type Item = {
  id: string;
  external_id: string;
  point_id: string;
  prerequisite_id?: string;
  review_status: string;
  processing_status: string;
  note: string;
  original_name: string;
  payload: Record<string, unknown>;
  point?: Point;
  question_count?: number;
};
type Mapping = {
  id: string;
  item_id: string;
  node_id: string;
  reason: string;
  confidence: number;
  status: string;
};
type Question = {
  id: string;
  external_id: string;
  point_id: string;
  question_id: string | null;
  name: string;
  review_status: string;
  processing_status: string;
  note: string;
};
type Graph = {
  sources: {
    repository: string;
    commit_sha: string;
    license: string;
    attribution: string;
  }[];
  points: Item[];
  edges: Item[];
  mappings: Mapping[];
  nodes: Chapter[];
  questions: Question[];
};
type Preview = {
  topics: number;
  questions: number;
  dependencies: number;
  hard: number;
  soft: number;
  images: number;
  ready: number;
  imported: number;
  unsupported: { id: string; reason: string }[];
  unmapped: string[];
  synonyms: { external_id: string; local_name: string }[];
  commit: string;
  license: string;
};
const labels: Record<string, string> = {
  pending: "待审核",
  approved: "已审核",
  rejected: "已拒绝",
  draft: "草稿",
  archived: "已归档",
};
export default function KnowledgeGraph() {
  const [data, setData] = useState<Graph | null>(null),
    [selected, setSelected] = useState(""),
    [scope, setScope] = useState(""),
    [query, setQuery] = useState(""),
    [unmapped, setUnmapped] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<Preview | null>(null),
    [raw, setRaw] = useState<Item | null>(null);
  async function reload() {
    try {
      setData(await api<Graph>("/library/taxonomy/graph"));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }
  useEffect(() => {
    void reload();
  }, []);
  const nodes = data?.nodes || [],
    selectedNodes = new Set(scope ? [scope] : []);
  for (let changed = true; changed;) {
    changed = false;
    for (const n of nodes)
      if (
        n.parent_id &&
        selectedNodes.has(n.parent_id) &&
        !selectedNodes.has(n.id)
      ) {
        selectedNodes.add(n.id);
        changed = true;
      }
  }
  const points = (data?.points || []).filter(
    (p) =>
      (!query ||
        p.original_name.includes(query) ||
        p.external_id.includes(query)) &&
      (!scope ||
        data?.mappings.some(
          (m) =>
            m.item_id === p.id &&
            selectedNodes.has(m.node_id) &&
            m.status !== "rejected",
        )) &&
      (!unmapped ||
        !data?.mappings.some(
          (m) => m.item_id === p.id && m.status !== "rejected",
        )),
  );
  const current =
    data?.points.find((p) => p.point_id === selected) || points[0];
  const prerequisites =
      data?.edges.filter((e) => e.point_id === current?.point_id) || [],
    following =
      data?.edges.filter((e) => e.prerequisite_id === current?.point_id) || [];
  const mappings =
      data?.mappings.filter((m) => m.item_id === current?.id) || [],
    questions =
      data?.questions.filter((q) => q.point_id === current?.point_id) || [];
  async function decision(kind: string, id: string, action: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/library/taxonomy/review/${kind}/${id}`, { action });
      setMessage(
        action === "approve" ? "已确认并保留审核记录" : "已拒绝并保留记录",
      );
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "审核失败");
    } finally {
      setBusy(false);
    }
  }
  function buttons(kind: string, id: string, status: string) {
    return status === "pending" ? (
      <div className="toolbar-actions">
        <Button
          disabled={busy}
          className="graph-action"
          onClick={() => void decision(kind, id, "approve")}
        >
          确认
          {kind === "point" ? "知识点" : kind === "mapping" ? "映射" : "关系"}
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          className="graph-action"
          onClick={() => void decision(kind, id, "reject")}
        >
          拒绝
        </Button>
      </div>
    ) : null;
  }
  function edgeList(edges: Item[], direction: "before" | "after") {
    return edges.length ? (
      edges.map((e) => {
        const p = data?.points.find(
          (p) =>
            p.point_id ===
            (direction === "before" ? e.prerequisite_id : e.point_id),
        );
        return (
          <div
            key={e.id}
            className={`graph-edge ${e.payload.strength === "hard" ? "hard" : "soft"}`}
          >
            <button
              className="graph-node"
              onClick={() => {
                setSelected(p?.point_id || "");
                setRaw(null);
              }}
            >
              {p?.original_name || "未知知识点"}
            </button>
            <small>
              {e.payload.strength === "hard" ? "强前置" : "弱前置"} ·{" "}
              {labels[e.review_status]}
            </small>
            <p>{String(e.payload.reason || "")}</p>
            {buttons("dependency", e.id, e.review_status)}
          </div>
        );
      })
    ) : (
      <p className="form-help">来源未提供此方向的关系</p>
    );
  }
  return (
    <>
      <div className="library-heading compact">
        <h1>初中化学知识图谱</h1>
        <div className="toolbar-actions">
          <Button variant="outline" asChild>
            <Link to="/questions">返回题库</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/questions/knowledge">知识点主库</Link>
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setPreview(await api<Preview>("/library/taxonomy/preview"));
              } catch (e) {
                setError(e instanceof Error ? e.message : "预览失败");
              } finally {
                setBusy(false);
              }
            }}
          >
            导入预览与管理
          </Button>
        </div>
      </div>
      <Feedback error={error} message={message} />
      <p className="form-help">
        来源知识与诊断题由上游提供，尚需教师审核。箭头方向：前置知识 → 当前知识
        → 后续知识。章节筛选包含待确认建议，不表示正式教材映射或学生学情结论。
      </p>
      {preview && (
        <section className="card graph-section">
          <h2>导入预览</h2>
          <p>
            {preview.topics}知识点 · {preview.questions}题（可转换
            {preview.ready}） · {preview.dependencies}关系（强{preview.hard}/弱
            {preview.soft}） · {preview.images}张图片
          </p>
          <p>
            已处理来源记录{preview.imported}条；未映射：
            {preview.unmapped.join("、") || "无"}。
          </p>
          <p>
            固定来源版本：<code>{preview.commit}</code> · {preview.license}
          </p>
          {preview.synonyms.length > 0 && (
            <p>
              可能同义，保留独立档案不自动合并：
              {preview.synonyms
                .map((s) => `${s.external_id} ↔ ${s.local_name}`)
                .join("；")}
            </p>
          )}
          {preview.unsupported.map((x) => (
            <p key={x.id}>
              {x.id}：待处理，{x.reason}
            </p>
          ))}
          <p>
            确认导入将新增待审核数据并先创建完整备份，不覆盖已有内容；同一版本重复执行新增0条。
          </p>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const r = await api<{ already_imported: boolean }>(
                  "/library/taxonomy/import",
                  { confirmation: "导入待审核初中化学数据" },
                );
                setMessage(
                  r.already_imported
                    ? "此版本已导入，未重复新增"
                    : "导入完成，全部等待教师审核",
                );
                setPreview(await api<Preview>("/library/taxonomy/preview"));
                await reload();
              } catch (e) {
                setError(e instanceof Error ? e.message : "导入失败");
              } finally {
                setBusy(false);
              }
            }}
          >
            确认导入待审核数据
          </Button>
        </section>
      )}
      <div className="knowledge-tools">
        <select
          aria-label="图谱主题专题筛选"
          value={scope}
          onChange={(e) => {
            setScope(e.target.value);
            setSelected("");
          }}
        >
          <option value="">全部六主题</option>
          {nodes
            .filter((n) => n.active && n.name.startsWith("主题"))
            .sort((a, b) => a.position - b.position)
            .map((n) => (
              <optgroup key={n.id} label={n.name}>
                <option value={n.id}>{n.name}</option>
                {nodes
                  .filter((x) => x.parent_id === n.id)
                  .sort((a, b) => a.position - b.position)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      　{x.name}
                    </option>
                  ))}
              </optgroup>
            ))}
        </select>
        <input
          aria-label="搜索图谱知识点"
          placeholder="搜索知识点或来源编号"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected("");
          }}
        />
        <label className="check-label">
          <input
            type="checkbox"
            checked={unmapped}
            onChange={(e) => {
              setUnmapped(e.target.checked);
              setSelected("");
            }}
          />
          仅未映射
        </label>
      </div>
      <div className="graph-layout">
        <aside className="card graph-section">
          <h2>知识点（{points.length}）</h2>
          {points.map((p) => (
            <button
              key={p.id}
              className={`graph-point ${p.id === current?.id ? "selected" : ""}`}
              onClick={() => {
                setSelected(p.point_id);
                setRaw(null);
              }}
            >
              <strong>{p.original_name}</strong>
              <small>
                {p.external_id} ·{" "}
                {labels[p.point?.review_status || p.review_status]} ·{" "}
                {p.question_count}题
              </small>
              <small>
                {data?.mappings.some(
                  (m) => m.item_id === p.id && m.status === "approved",
                )
                  ? "已确认映射"
                  : data?.mappings.some(
                        (m) => m.item_id === p.id && m.status === "pending",
                      )
                    ? "建议映射待确认"
                    : "尚未映射"}
              </small>
            </button>
          ))}
          {!points.length && <p>暂无符合条件的知识点，可查看导入预览。</p>}
        </aside>
        <div>
          {current && (
            <>
              <section className="card graph-section">
                <h2>{current.original_name}</h2>
                <p>
                  {current.external_id} ·{" "}
                  {
                    labels[
                      current.point?.review_status || current.review_status
                    ]
                  }{" "}
                  · {current.question_count}道关联题
                </p>
                <p>{current.point?.description}</p>
                {buttons(
                  "point",
                  current.id,
                  current.point?.review_status || current.review_status,
                )}
                <details>
                  <summary>来源知识点详情与掌握标准</summary>
                  <pre className="graph-raw">
                    {JSON.stringify(current.payload, null, 2)}
                  </pre>
                </details>
              </section>
              <section className="card graph-section">
                <h2>知识关系</h2>
                <div className="graph-chain">
                  <div>
                    <h3>前置知识 →</h3>
                    {edgeList(prerequisites, "before")}
                  </div>
                  <div className="graph-current">
                    <h3>当前知识</h3>
                    <strong>{current.original_name}</strong>
                    <p>强前置：实线；弱前置：虚线。均显示审核状态。</p>
                  </div>
                  <div>
                    <h3>→ 后续知识</h3>
                    {edgeList(following, "after")}
                  </div>
                </div>
              </section>
              <section className="card graph-section">
                <h2>上海课题映射（{mappings.length}）</h2>
                {mappings.map((m) => (
                  <div key={m.id} className="graph-mapping">
                    <Link to={`/questions?node=${m.node_id}`}>
                      {nodes.find((n) => n.id === m.node_id)?.name ||
                        "目录不存在"}
                    </Link>
                    <p>
                      建议置信程度：{Math.round(m.confidence * 100)}
                      %（规则判断） · {labels[m.status]} ·{" "}
                      {m.status === "approved" ? "教师已确认" : "教师未确认"}
                    </p>
                    <p>{m.reason}</p>
                    {buttons("mapping", m.id, m.status)}
                  </div>
                ))}
                {!mappings.length && (
                  <p>尚未找到可靠课题映射，请教师在知识点主库手动关联。</p>
                )}
              </section>
              <section className="card graph-section">
                <h2>对应诊断题（{questions.length}）</h2>
                {questions.map((q) => (
                  <div key={q.id} className="graph-mapping">
                    {q.question_id ? (
                      <Link to={`/questions/${q.question_id}`}>{q.name}</Link>
                    ) : (
                      <strong>{q.name}</strong>
                    )}
                    <p>
                      {q.external_id} ·{" "}
                      {labels[q.review_status] || q.review_status}
                      {q.processing_status !== "imported"
                        ? ` · 未导入：${q.note}`
                        : ""}
                    </p>
                    <Button
                      variant="outline"
                      className="graph-action"
                      onClick={async () => {
                        try {
                          setRaw(
                            await api<Item>(`/library/taxonomy/items/${q.id}`),
                          );
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "读取失败");
                        }
                      }}
                    >
                      查看原始选项与作答规则
                    </Button>
                  </div>
                ))}
                {raw && (
                  <details open>
                    <summary>来源原始记录（verify仅文字保存，未执行）</summary>
                    <pre className="graph-raw">
                      {JSON.stringify(raw.payload, null, 2)}
                    </pre>
                  </details>
                )}
              </section>
            </>
          )}
        </div>
      </div>
      {data?.sources.map((s) => (
        <p className="form-help" key={s.commit_sha}>
          来源：
          <a
            href={`${s.repository}/tree/${s.commit_sha}`}
            target="_blank"
            rel="noreferrer"
          >
            {s.attribution}
          </a>{" "}
          · {s.license} · <code>{s.commit_sha}</code>
          。本次有格式转换和上海章节建议，不代表上游审核或出版社认可。
        </p>
      ))}
    </>
  );
}
