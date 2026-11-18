import { useEffect, useState, lazy, Suspense } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { Button } from "../../components/ui/button";
import { RichView } from "../library/RichView";
import type { Overview, Question, QuestionPage } from "./types";
import { base, statusNames } from "./types";
const RichEditor = lazy(() => import("../library/RichEditor"));
export function GraphQuestion({
  identity,
  onChanged,
  onError,
}: {
  identity: string;
  onChanged: () => void;
  onError: (s: string) => void;
}) {
  const [value, setValue] = useState<Question | null>(null),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Question>("/chemistry-graph/questions/" + identity)
      .then(setValue)
      .catch((e) => onError(e.message));
  }, [identity, onError]);
  async function save() {
    if (!value) return;
    setBusy(true);
    try {
      setValue(
        await api<Question>("/chemistry-graph/questions/" + identity, {
          stem: value.stem,
          answer: value.answer,
          explanation: value.explanation,
          difficulty: value.difficulty,
          expected_version: value.version,
        }),
      );
      setEditing(false);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function review(status: string) {
    if (!value) return;
    setBusy(true);
    try {
      await api("/chemistry-graph/review/questions/" + identity, {
        status,
        expected_version: value.version,
      });
      setValue(await api<Question>("/chemistry-graph/questions/" + identity));
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "审核失败");
    } finally {
      setBusy(false);
    }
  }
  if (!value) return <p>正在读取诊断题…</p>;
  return (
    <section className="card cg-card">
      <div className="cg-title-row">
        <h2>{value.external_id}</h2>
        <div className="toolbar-actions">
          <Button variant="outline" asChild>
            <Link to="/chemistry-graph/questions">返回诊断题库</Link>
          </Button>
          <Button disabled={busy} onClick={() => setEditing(!editing)}>
            {editing ? "取消编辑" : "编辑题目"}
          </Button>
        </div>
      </div>
      <p>
        {statusNames[value.status]} · 难度{value.difficulty} · 版本
        {value.version}
      </p>
      {editing ? (
        <Suspense fallback={<p>加载编辑器…</p>}>
          <p className="cg-muted">
            修改后重新待审核；因原选项规则可能已变化，该题练习改用教师自评，避免错误自动判分。
          </p>
          <RichEditor
            label="独立题干"
            value={value.stem}
            assetBase={base}
            onChange={(stem) => setValue({ ...value, stem })}
          />
          <RichEditor
            label="独立答案"
            value={value.answer}
            assetBase={base}
            onChange={(answer) => setValue({ ...value, answer })}
          />
          <RichEditor
            label="独立解析"
            value={value.explanation}
            assetBase={base}
            onChange={(explanation) => setValue({ ...value, explanation })}
          />
          <label>
            难度
            <select
              value={value.difficulty}
              onChange={(e) =>
                setValue({ ...value, difficulty: Number(e.target.value) })
              }
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <Button disabled={busy} onClick={() => void save()}>
            保存独立题目
          </Button>
        </Suspense>
      ) : (
        <>
          <h3>题干与选项</h3>
          <RichView doc={value.stem} assetBase={base} />
          <h3>参考答案</h3>
          <RichView doc={value.answer} assetBase={base} />
          <h3>解析</h3>
          <RichView doc={value.explanation} assetBase={base} />
          {value.status === "pending" && (
            <div className="toolbar-actions">
              <Button disabled={busy} onClick={() => void review("approved")}>
                审核通过
              </Button>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => void review("rejected")}
              >
                拒绝题目
              </Button>
            </div>
          )}
          <details>
            <summary>来源原始记录（仅文字，不执行verify）</summary>
            <pre className="graph-raw">
              {JSON.stringify(value.raw, null, 2)}
            </pre>
          </details>
          <details>
            <summary>版本与审核记录（{value.history.length}）</summary>
            {value.history.map((h) => (
              <details key={h.id}>
                <summary>
                  版本{h.version} · {h.action}
                </summary>
                <pre className="graph-raw">
                  {JSON.stringify(h.snapshot, null, 2)}
                </pre>
              </details>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
export default function GraphQuestions({
  data,
  onError,
}: {
  data: Overview;
  onError: (s: string) => void;
}) {
  const [params, setParams] = useSearchParams(),
    [result, setResult] = useState<QuestionPage | null>(null),
    [search, setSearch] = useState("");
  const point = params.get("point") || "",
    difficulty = params.get("difficulty") || "",
    status = params.get("status") || "",
    page = Number(params.get("page") || 1);
  useEffect(() => {
    const q = new URLSearchParams({
      point_id: point,
      difficulty,
      status,
      q: search,
      page: String(page),
      page_size: "20",
    });
    if (!difficulty) q.delete("difficulty");
    api<QuestionPage>("/chemistry-graph/questions?" + q)
      .then(setResult)
      .catch((e) => onError(e.message));
  }, [point, difficulty, status, page, search, onError]);
  function select(key: string, value: string) {
    setParams({
      ...Object.fromEntries(params),
      [key]: value,
      ...(key === "page" ? {} : { page: "1" }),
    });
  }
  return (
    <>
      <div className="knowledge-tools">
        <input
          aria-label="搜索独立诊断题"
          placeholder="搜索题干或来源编号"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            select("page", "1");
          }}
        />
        <select
          aria-label="诊断题知识点"
          value={point}
          onChange={(e) => select("point", e.target.value)}
        >
          <option value="">全部知识点</option>
          {data.points.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="诊断题难度"
          value={difficulty}
          onChange={(e) => select("difficulty", e.target.value)}
        >
          <option value="">全部难度</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              难度{n}
            </option>
          ))}
        </select>
        <select
          aria-label="独立题目审核状态"
          value={status}
          onChange={(e) => select("status", e.target.value)}
        >
          <option value="">全部状态</option>
          {Object.entries(statusNames)
            .filter(([k]) => k !== "draft")
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </select>
      </div>
      <section className="card cg-card">
        <h2>诊断题库（{result?.total || 0}）</h2>
        {result?.items.map((q) => (
          <Link
            className="cg-question-row"
            key={q.id}
            to={"/chemistry-graph/questions/" + q.id}
          >
            <strong>{q.summary}</strong>
            <small>
              {q.external_id} · 难度{q.difficulty} · {statusNames[q.status]}
            </small>
          </Link>
        ))}
        <div className="toolbar-actions">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => select("page", String(page - 1))}
          >
            上一页
          </Button>
          <span>第{page}页</span>
          <Button
            variant="outline"
            disabled={!result || page * 20 >= result.total}
            onClick={() =>
              setParams({
                ...Object.fromEntries(params),
                page: String(page + 1),
              })
            }
          >
            下一页
          </Button>
        </div>
      </section>
    </>
  );
}
