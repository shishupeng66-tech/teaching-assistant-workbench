import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Drawer, { Feedback } from "../../components/Drawer";
import { api } from "../../api";
import type { Student } from "./types";
export default function StudentDirectory({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState(""),
    [archived, setArchived] = useState(false),
    [items, setItems] = useState<Student[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api<{ items: Student[] }>(
      `/students?q=${encodeURIComponent(q)}&archived=${archived}`,
    )
      .then((r) => {
        if (active) {
          setItems(r.items);
          setError("");
        }
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
  }, [q, archived]);
  return (
    <Drawer title="学生管理" onClose={onClose}>
      <Feedback error={error} />
      <label className="directory-search">
        搜索全部学生
        <input
          placeholder="姓名、学号或完整内部 ID"
          aria-label="搜索全部学生"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => setArchived(e.target.checked)}
        />
        查看已归档学生
      </label>
      <p className="form-help">
        包括所有班级。点击姓名查看完整资料、转班与归属历史。
      </p>
      {loading ? (
        <p className="loading-state">正在查询…</p>
      ) : (
        <ul className="directory-list">
          {items.map((s) => (
            <li key={s.id}>
              <Link to={`/students/${s.id}`} onClick={onClose}>
                <strong>{s.name}</strong>
                <span>
                  {s.student_no || "未填学号"} ·{" "}
                  {s.current_class
                    ? `${s.current_class.name} · ${s.current_class.school_year}`
                    : "无当前班级"}
                </span>
                <small>
                  {s.id} · {s.status === "active" ? "在档" : "已归档"}
                </small>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!loading && !items.length && (
        <p className="loading-state">没有匹配的学生</p>
      )}
    </Drawer>
  );
}
