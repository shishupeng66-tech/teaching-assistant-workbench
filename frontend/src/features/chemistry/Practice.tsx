import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { Button } from "../../components/ui/button";
import { RichView } from "../library/RichView";
import type { Overview, Practice as Session } from "./types";
import { base } from "./types";
const outcome: Record<string, string> = {
  passed_this_practice: "本次两题通过",
  unstable: "本次表现不稳",
  possible_weakness: "可能薄弱（待教师核对）",
  untested: "未测",
};
export default function Practice({
  data,
  onError,
}: {
  data: Overview;
  onError: (s: string) => void;
}) {
  const [params, setParams] = useSearchParams(),
    [target, setTarget] = useState(data.points[0]?.id || ""),
    [limit, setLimit] = useState(12),
    [ack, setAck] = useState(false),
    [session, setSession] = useState<Session | null>(null),
    [answer, setAnswer] = useState(""),
    [verdict, setVerdict] = useState(""),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<
      {
        id: string;
        target: string;
        finished: boolean;
        answer_count: number;
        updated_at: string;
      }[]
    >([]);
  const identity = params.get("session") || "";
  useEffect(() => {
    api<{ items: typeof history }>("/chemistry-graph/practice")
      .then((r) => setHistory(r.items))
      .catch((e) => onError(e.message));
    if (identity)
      api<Session>("/chemistry-graph/practice/" + identity)
        .then(setSession)
        .catch((e) => onError(e.message));
    else setSession(null);
  }, [identity, onError]);
  async function start() {
    setBusy(true);
    try {
      const r = await api<Session>("/chemistry-graph/practice", {
        target,
        limit,
        acknowledged: ack,
      });
      setSession(r);
      setParams({ session: r.id });
    } catch (e) {
      onError(e instanceof Error ? e.message : "无法开始练习");
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!session) return;
    setBusy(true);
    try {
      const r = await api<Session>(
        "/chemistry-graph/practice/" + session.id + "/answer",
        {
          answer,
          step: session.answers.length,
          manual_verdict: verdict || null,
        },
      );
      setSession(r);
      setAnswer("");
      setVerdict("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }
  const current = session?.current,
    last = session?.answers.at(-1);
  return (
    <>
      <section className="card cg-card">
        <h2>教师知识诊断试做</h2>
        <p className="cg-muted">
          参考来源的“两次作答、错误后补基础题、强前置优先回溯”规则，在本机重新实现。仅用于教师检查资源及试做；题目未经全面审核，不代表学生正式掌握度，不写学生档案或画像。
        </p>
        {!session ? (
          <>
            <div className="knowledge-tools">
              <label>
                目标知识点
                <select
                  aria-label="诊断目标知识点"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  {data.points.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                最多题数
                <select
                  aria-label="诊断最多题数"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                >
                  {[2, 6, 12, 20].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              我了解来源题目及自动判分存在局限，仅作教师试做
            </label>
            <p>
              <Button
                disabled={busy || !ack || !target}
                onClick={() => void start()}
              >
                开始诊断练习
              </Button>
            </p>
          </>
        ) : (
          <>
            <div className="cg-title-row">
              <h3>
                已作答{session.answers.length} / 最多{session.limit}题
              </h3>
              <Button
                variant="outline"
                onClick={() => {
                  setSession(null);
                  setParams({});
                }}
              >
                返回练习设置
              </Button>
            </div>
            {last && (
              <section className="cg-feedback" aria-label="上题反馈">
                <h3>
                  {last.correct
                    ? "上题：与参考答案一致"
                    : "上题：与参考答案不一致"}
                </h3>
                <p>
                  {last.external_id} ·{" "}
                  {last.mode === "teacher_self_assessment"
                    ? "教师自评"
                    : "依据来源答案比较"}
                </p>
                <h4>参考答案</h4>
                <RichView doc={last.reference} assetBase={base} />
                <h4>解析</h4>
                <RichView doc={last.explanation} assetBase={base} />
              </section>
            )}
            {session.finished ? (
              <>
                <h3>本次练习结束</h3>
                {Object.entries(session.outcomes).map(([id, result]) => (
                  <p key={id}>
                    {data.points.find((p) => p.id === id)?.name}：
                    {outcome[result] || result}
                  </p>
                ))}
                {!Object.keys(session.outcomes).length && (
                  <p>
                    题量不足以形成两次作答结果，保留已答记录，不推断掌握度。
                  </p>
                )}
                <p className="cg-muted">
                  未测试节点不推断已掌握；“可能薄弱”仅是本次参考题的提示，应由教师结合实际教学核对。
                </p>
                <details>
                  <summary>全部作答记录</summary>
                  {session.answers.map((a, i) => (
                    <div className="cg-record" key={i}>
                      <strong>
                        {a.external_id} · {a.correct ? "一致" : "不一致"} ·
                        题目版本{a.question_version}
                      </strong>
                      <RichView doc={a.stem} assetBase={base} />
                      <p>填写：{a.text || "教师自评"}</p>
                      <RichView doc={a.reference} assetBase={base} />
                    </div>
                  ))}
                </details>
              </>
            ) : (
              current && (
                <section>
                  <h3>
                    当前题：
                    {data.points.find((p) => p.id === current.point_id)?.name}
                  </h3>
                  <p>{current.external_id}</p>
                  <RichView doc={current.stem} assetBase={base} />
                  {current.manual_only ? (
                    <>
                      <p>本题经过教师编辑，请按当前参考答案自评：</p>
                      {current.reference && (
                        <RichView doc={current.reference} assetBase={base} />
                      )}
                      <select
                        aria-label="教师自评结果"
                        value={verdict}
                        onChange={(e) => setVerdict(e.target.value)}
                      >
                        <option value="">请选择自评结果</option>
                        <option value="correct">本次作答正确</option>
                        <option value="wrong">本次作答错误</option>
                      </select>
                    </>
                  ) : current.type === "choice" ? (
                    <fieldset className="cg-choices">
                      <legend>选择答案</legend>
                      {current.choices.map((c) => (
                        <label key={c.key}>
                          <input
                            type="radio"
                            name="diagnostic-answer"
                            value={c.key}
                            checked={answer === c.key}
                            onChange={() => setAnswer(c.key)}
                          />
                          {c.key}. {c.text}
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <label>
                      数值答案（不带单位，按题干单位填写）
                      <input
                        aria-label="数值诊断答案"
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="整数、小数或分数，如1/2"
                      />
                    </label>
                  )}
                  <p>
                    <Button
                      disabled={
                        busy || (current.manual_only ? !verdict : !answer)
                      }
                      onClick={() => void submit()}
                    >
                      提交本题并继续
                    </Button>
                  </p>
                </section>
              )
            )}
          </>
        )}
      </section>
      {!session && (
        <section className="card cg-card">
          <h2>仅本空间的练习记录</h2>
          {history.length ? (
            history.map((h) => (
              <button
                className="cg-question-row"
                key={h.id}
                onClick={() => setParams({ session: h.id })}
              >
                {data.points.find((p) => p.id === h.target)?.name} ·{" "}
                {h.answer_count}题 · {h.finished ? "已结束" : "可继续"}
                <small>{new Date(h.updated_at).toLocaleString()}</small>
              </button>
            ))
          ) : (
            <p>暂无教师试做记录。</p>
          )}
        </section>
      )}
    </>
  );
}
