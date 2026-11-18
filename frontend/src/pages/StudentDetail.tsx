import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  ArrowRightLeft,
  Archive,
  UserRound,
} from "lucide-react";
import { Button } from "../components/ui/button";
import Drawer, { Feedback } from "../components/Drawer";
import { api } from "../api";
import StudentEditor from "../features/classes/StudentEditor";
import { OperationList } from "../features/classes/Operations";
import type {
  StudentDetail as Detail,
  Classroom,
} from "../features/classes/types";
export default function StudentDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [item, setItem] = useState<Detail | null>(null),
    [classes, setClasses] = useState<Classroom[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [panel, setPanel] = useState<"edit" | "transfer" | "archive" | null>(null),
    [target, setTarget] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0);
  useEffect(() => {
    let active = true;
    setItem(null);
    api<Detail>(`/students/${id}`)
      .then((r) => {
        if (active) {
          setItem(r);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, tick]);
  useEffect(() => {
    api<{ items: Classroom[] }>("/classes")
      .then((r) => setClasses(r.items))
      .catch((e) => setError(e.message));
  }, []);
  async function act(type: "transfer" | "archive") {
    setBusy(true);
    setError("");
    try {
      await api(
        `/students/${id}/${type}`,
        type === "transfer"
          ? { class_id: target }
          : { confirmation: "确认归档" },
      );
      setPanel(null);
      setConfirm("");
      setMessage(
        type === "transfer"
          ? "转班完成，原座位已释放，永久 ID 保持不变"
          : "学生已归档，历史记录保留",
      );
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  const back = item?.current_class || null;
  const last = item?.history[0];
  const backClass = back?.id || last?.class_id;
  const backArchived =
    back?.archived ||
    last?.class_archived ||
    (!back && params.get("archived") === "1");
  return (
    <>
      <div className="detail-top">
        <Button asChild variant="outline">
          <Link
            to={
              backClass
                ? `/?class=${backClass}${backArchived ? "&archived=1" : ""}`
                : "/"
            }
          >
            <ArrowLeft size={15} />
            返回教室
          </Link>
        </Button>
        <div className="toolbar-actions">
          <Button
            variant="outline"
            disabled={!item || item.status === "archived"}
            onClick={() => setPanel("transfer")}
          >
            <ArrowRightLeft size={15} />
            转班
          </Button>
          <Button
            variant="outline"
            disabled={!item || item.status === "archived"}
            onClick={() => {
              setConfirm("");
              setPanel("archive");
            }}
          >
            <Archive size={15} />
            归档学生
          </Button>
          <Button
            disabled={!item || item.status === "archived"}
            onClick={() => setPanel("edit")}
          >
            <Pencil size={15} />
            编辑资料
          </Button>
        </div>
      </div>
      <Feedback error={error} message={message} />
      {!item ? (
        !error && <p className="loading-state">正在读取学生档案…</p>
      ) : (
        <>
          <section className="card student-profile">
            <div className="profile-heading">
              <div className="profile-avatar">
                <UserRound size={28} />
              </div>
              <div>
                <h1>{item.name}</h1>
                <span className="badge">
                  {item.status === "active" ? "在档" : "已归档"}
                </span>
              </div>
            </div>
            <dl className="profile-grid">
              <div>
                <dt>永久内部 ID</dt>
                <dd>
                  <code>{item.id}</code>
                </dd>
              </div>
              <div>
                <dt>学号</dt>
                <dd>{item.student_no || "未填写"}</dd>
              </div>
              <div>
                <dt>性别</dt>
                <dd>{item.gender || "未填写"}</dd>
              </div>
              <div>
                <dt>入学年份</dt>
                <dd>{item.entry_year || "未填写"}</dd>
              </div>
              <div>
                <dt>当前班级</dt>
                <dd>
                  {item.current_class
                    ? `${item.current_class.name} · ${item.current_class.school_year}${item.current_class.archived ? "（班级已归档）" : ""}`
                    : "无当前班级"}
                </dd>
              </div>
              <div>
                <dt>当前座位</dt>
                <dd>
                  {item.seat
                    ? `${item.seat.row} 排 ${item.seat.column} 列`
                    : "未安排"}
                </dd>
              </div>
              <div className="profile-notes">
                <dt>备注</dt>
                <dd>{item.notes || "未填写"}</dd>
              </div>
            </dl>
          </section>
          <section className="card detail-section">
            <h2>学年与班级归属历史</h2>
            <p>保留入班时的班级资料快照，转班或归档不会删除旧记录。</p>
            <div className="history-table">
              <table>
                <thead>
                  <tr>
                    <th>班级 / 学年</th>
                    <th>年级 / 编号</th>
                    <th>入班时间</th>
                    <th>结束时间 / 原因</th>
                  </tr>
                </thead>
                <tbody>
                  {item.history.map((h) => (
                    <tr key={h.id}>
                      <td>
                        {h.class_name}
                        <small>{h.school_year}</small>
                      </td>
                      <td>
                        {h.grade || "—"} / {h.class_number || "—"}
                      </td>
                      <td>{new Date(h.started_at).toLocaleString("zh-CN")}</td>
                      <td>
                        {h.ended_at
                          ? `${new Date(h.ended_at).toLocaleString("zh-CN")} · ${h.end_reason}`
                          : "当前归属"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card detail-section">
            <h2>学生操作记录</h2>
            <OperationList items={item.operations} />
          </section>
          <section className="card detail-section">
            <h2>后续教学记录</h2>
            <div className="future-sections">
              {[
                "历次考试",
                "错题记录",
                "知识点掌握情况",
                "AI 学情分析",
                "个性化练习试卷",
              ].map((name) => (
                <div key={name}>
                  <strong>{name}</strong>
                  <span>后续阶段开发</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {panel === "edit" && item && (
        <StudentEditor
          student={item}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            setMessage("学生资料已保存");
            setTick((t) => t + 1);
          }}
        />
      )}
      {panel === "transfer" && item && (
        <Drawer title="学生转班" busy={busy} onClose={() => setPanel(null)}>
          <Feedback error={error} />
          <p className="form-help">
            原班座位将自动释放，学年与班级历史保留，永久内部 ID
            不变。目标必须为未归档班级。
          </p>
          <label className="editor-label">
            目标班级
            <select
              aria-label="目标班级"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">请选择班级</option>
              {classes
                .filter((c) => c.id !== item.current_class?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.school_year}（{c.id.slice(0, 4)}）
                  </option>
                ))}
            </select>
          </label>
          <Button
            disabled={busy || !target}
            onClick={() => void act("transfer")}
          >
            确认转班
          </Button>
        </Drawer>
      )}
      {panel === "archive" && (
        <Drawer title="归档学生" busy={busy} onClose={() => setPanel(null)}>
          <Feedback error={error} />
          <p className="form-help">
            归档会结束当前班级归属并释放座位。学生档案、历史和操作记录全部保留，本阶段归档后只读。
          </p>
          <label className="editor-label">
            输入“确认归档”
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <Button
            disabled={busy || confirm !== "确认归档"}
            onClick={() => void act("archive")}
          >
            确认归档学生
          </Button>
        </Drawer>
      )}
    </>
  );
}
