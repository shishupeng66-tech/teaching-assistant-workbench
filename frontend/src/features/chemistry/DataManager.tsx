import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { api } from "../../api";
import type { Overview } from "./types";
import { statusNames } from "./types";
type Management = {
  database: string;
  assets: string;
  backup_dir: string;
  migration: string;
  sources: Record<string, unknown>[];
  imports: {
    id: string;
    manifest: Record<string, unknown>;
    created_at: string;
  }[];
  archive_count: number;
  audit_count: number;
  scope: string;
  backups: {
    name: string;
    valid: boolean;
    asset_count: number;
    scope: string;
  }[];
};
export default function DataManager({
  data,
  onChanged,
  onError,
}: {
  data: Overview;
  onChanged: () => void;
  onError: (s: string) => void;
}) {
  const [value, setValue] = useState<Management | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [restore, setRestore] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [reviewKind, setReviewKind] = useState<"points" | "edges">("points");
  async function load() {
    try {
      setValue(await api<Management>("/chemistry-graph/data"));
    } catch (e) {
      onError(e instanceof Error ? e.message : "读取失败");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function action(path: string, body: object) {
    setBusy(true);
    setMessage("");
    try {
      await api("/chemistry-graph/" + path, body);
      setMessage("操作完成，已保留记录");
      await load();
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="card cg-card">
        <h2>独立空间数据与备份</h2>
        <p>{value?.scope}</p>
        <p>
          知识点{data.points.length} · 诊断题{data.question_total} · 关系
          {data.edges.length} · 题图{data.assets}
        </p>
        <p>
          数据库：<code>{value?.database}</code>
        </p>
        <p>
          题图：<code>{value?.assets}</code>
        </p>
        <p>独立迁移：{value?.migration}</p>
        {message && <p role="status">{message}</p>}
        <div className="toolbar-actions">
          <Button disabled={busy} onClick={() => void action("backups", {})}>
            创建独立图谱备份
          </Button>
          {!data.points.length && (
            <Button
              disabled={busy}
              onClick={() =>
                void action("import", { confirmation: "导入独立化学空间" })
              }
            >
              导入固定版本初中化学资源
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to="/settings">系统备份管理</Link>
          </Button>
        </div>
        <p className="cg-muted">
          此处只恢复独立图谱及图片、浏览状态和教师练习记录，不替换教材题库、班级或学生数据库。主工作台备份不包含本独立数据库，请分别备份。
        </p>
        {value?.backups.map((b) => (
          <div className="cg-record" key={b.name}>
            <strong>{b.name}</strong>
            <p>
              {b.valid ? "已验证" : "校验失败"} · {b.asset_count}图 ·
              独立图谱范围
            </p>
            <Button
              disabled={busy || !b.valid}
              variant="outline"
              onClick={() => {
                setRestore(b.name);
                setConfirmation("");
              }}
            >
              选择此图谱备份恢复
            </Button>
          </div>
        ))}
        {restore && (
          <div className="cg-restore">
            <h3>确认仅恢复独立化学知识图谱</h3>
            <p>{restore}</p>
            <p>将先自动生成恢复前备份。请输入“恢复独立化学知识图谱”。</p>
            <input
              aria-label="独立图谱恢复确认"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
            <Button
              disabled={busy || confirmation !== "恢复独立化学知识图谱"}
              onClick={() =>
                void action("backups/restore", {
                  name: restore,
                  confirmation,
                }).then(() => {
                  setRestore("");
                  setConfirmation("");
                })
              }
            >
              确认恢复独立图谱
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => setRestore("")}
            >
              取消恢复
            </Button>
          </div>
        )}
      </section>
      <section className="card cg-card">
        <h2>资源审核</h2>
        <p>
          仅改变本空间的状态，不同步到教材题库。先修关系是来源建议，确认也不代表已验证学生掌握情况。
        </p>
        <select
          aria-label="图谱审核类型"
          value={reviewKind}
          onChange={(e) => setReviewKind(e.target.value as "points" | "edges")}
        >
          <option value="points">知识点审核</option>
          <option value="edges">先修关系审核</option>
        </select>
        <Button variant="outline" asChild>
          <Link to="/chemistry-graph/questions?status=pending">
            查看待审核诊断题
          </Link>
        </Button>
        {reviewKind === "points"
          ? data.points.map((p) => (
              <div className="cg-record" key={p.id}>
                <strong>{p.name}</strong>
                <p>
                  {p.external_id} · {statusNames[p.status]}
                </p>
                {p.status === "pending" && (
                  <div className="toolbar-actions">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void action("review/points/" + p.id, {
                          status: "approved",
                        })
                      }
                    >
                      确认知识点 {p.external_id}
                    </Button>
                    <Button
                      disabled={busy}
                      variant="outline"
                      onClick={() =>
                        void action("review/points/" + p.id, {
                          status: "rejected",
                        })
                      }
                    >
                      拒绝知识点 {p.external_id}
                    </Button>
                  </div>
                )}
              </div>
            ))
          : data.edges.map((e) => (
              <div className="cg-record" key={e.id}>
                <strong>
                  {data.points.find((p) => p.id === e.prerequisite_id)?.name} →{" "}
                  {data.points.find((p) => p.id === e.topic_id)?.name}
                </strong>
                <p>
                  {e.strength === "hard" ? "强前置" : "弱前置"} ·{" "}
                  {statusNames[e.status]}
                </p>
                <p>{e.reason}</p>
                {e.status === "pending" && (
                  <div className="toolbar-actions">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void action("review/edges/" + e.id, {
                          status: "approved",
                        })
                      }
                    >
                      确认关系
                    </Button>
                    <Button
                      disabled={busy}
                      variant="outline"
                      onClick={() =>
                        void action("review/edges/" + e.id, {
                          status: "rejected",
                        })
                      }
                    >
                      拒绝关系
                    </Button>
                  </div>
                )}
              </div>
            ))}
      </section>
      <section className="card cg-card">
        <h2>来源与迁移记录</h2>
        <p>
          来源：
          <a
            href="https://github.com/xiaoyang111222/cn-math-taxonomy/tree/aa2c22058222d0df404f1819e2fbdb97a62049ea"
            target="_blank"
            rel="noreferrer"
          >
            xiaoyang111222 / cn-math-taxonomy 及其贡献者
          </a>{" "}
          · CC BY-NC 4.0，个人非商业教学。上游题目未经过全面教师审核。
        </p>
        <p>固定commit：aa2c22058222d0df404f1819e2fbdb97a62049ea</p>
        <p>
          历史迁移归档{value?.archive_count || 0}条，当前独立操作记录
          {value?.audit_count || 0}
          条。原上海教材映射建议只作为历史档案保留，不再作为图谱导航或新关联。
        </p>
        {value?.imports.map((i) => (
          <details key={i.id}>
            <summary>
              {i.id} · {new Date(i.created_at).toLocaleString()}
            </summary>
            <pre className="graph-raw">
              {JSON.stringify(i.manifest, null, 2)}
            </pre>
          </details>
        ))}
        <details>
          <summary>来源完整元数据</summary>
          <pre className="graph-raw">
            {JSON.stringify(value?.sources, null, 2)}
          </pre>
        </details>
      </section>
    </>
  );
}
