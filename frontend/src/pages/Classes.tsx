import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Plus,
  GraduationCap,
  LayoutGrid,
  Monitor,
  UsersRound,
  Settings2,
  Move,
  Check,
  X,
  Upload,
  RefreshCw,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Feedback } from "../components/Drawer";
import { api } from "../api";
import ClassEditor from "../features/classes/ClassEditor";
import StudentEditor from "../features/classes/StudentEditor";
import StudentDirectory from "../features/classes/StudentDirectory";
import ImportStudents from "../features/classes/ImportStudents";
import type {
  Classroom,
  Student,
  Layout,
  Assignment,
} from "../features/classes/types";
import Operations from "../features/classes/Operations";

export default function Classes() {
  const [params, setParams] = useSearchParams();
  const archivedParam = params.get("archived") === "1";
  const [archived, setArchived] = useState(archivedParam);
  useEffect(() => setArchived(archivedParam), [archivedParam]);
  const requested = params.get("class");
  const [groups, setGroups] = useState<Classroom[]>([]),
    [room, setRoom] = useState<{ students: Student[]; layout: Layout } | null>(
      null,
    ),
    [tick, setTick] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [panel, setPanel] = useState<
    | "new-class"
    | "class"
    | "student"
    | "directory"
    | "import"
    | "operations"
    | null
  >(null);
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<Assignment[]>([]),
    [rows, setRows] = useState(4),
    [columns, setColumns] = useState(6),
    [position, setPosition] = useState<[number, number] | null>(null),
    [busy, setBusy] = useState(false),
    [q, setQ] = useState("");
  const group = groups.find((g) => g.id === requested) || groups[0];
  const layout = room?.layout.class_id === group?.id ? room?.layout : undefined;
  const students = layout ? room!.students : [];
  const reload = () => setTick((t) => t + 1);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api<{ items: Classroom[] }>(`/classes?archived=${archived}`)
      .then((r) => {
        if (active) {
          setGroups(r.items);
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
  }, [archived, tick]);
  useEffect(() => {
    setEditing(false);
    setPosition(null);
    setPanel(null);
    setQ("");
  }, [group?.id]);
  useEffect(() => {
    let active = true;
    if (!group) {
      setRoom(null);
      return;
    }
    Promise.all([
      api<{ items: Student[] }>(`/students?class_id=${group.id}`),
      api<Layout>(`/classes/${group.id}/layout`),
    ])
      .then(([s, l]) => {
        if (active) {
          setRoom({ students: s.items, layout: l });
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [group?.id, tick]);
  function choose(id: string) {
    setParams({ ...(archived ? { archived: "1" } : {}), class: id });
    setMessage("");
  }
  function begin() {
    if (!layout) return;
    setDraft(layout.assignments.map((s) => ({ ...s })));
    setRows(layout.rows);
    setColumns(layout.columns);
    setEditing(true);
    setPosition(null);
    setMessage("");
  }
  function assign(studentId: string, row: number, column: number) {
    setDraft((previous) => {
      const at = previous.find((a) => a.row === row && a.column === column);
      const from = previous.find((a) => a.student_id === studentId);
      const next = previous.filter(
        (a) =>
          !(a.row === row && a.column === column) && a.student_id !== studentId,
      );
      if (studentId) next.push({ row, column, student_id: studentId });
      if (studentId && at && from && at.student_id !== studentId)
        next.push({
          row: from.row,
          column: from.column,
          student_id: at.student_id,
        });
      return next;
    });
  }
  async function save() {
    if (!group || !layout) return;
    setBusy(true);
    setError("");
    try {
      const saved = await api<Layout>(`/classes/${group.id}/layout`, {
        rows,
        columns,
        expected_version: layout.version,
        assignments: draft.map(({ row, column, student_id }) => ({
          row,
          column,
          student_id,
        })),
      });
      setRoom({ students, layout: saved });
      setEditing(false);
      setPosition(null);
      setMessage("座位布局已保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  function savedClass(item: Classroom) {
    setPanel(null);
    setParams(item.archived ? {} : { class: item.id });
    setMessage(item.archived ? "班级已归档，学生历史保留" : "班级已保存");
    reload();
  }
  const assignments = editing ? draft : layout?.assignments || [];
  const displayRows = editing ? rows : layout?.rows || 4;
  const displayColumns = editing ? columns : layout?.columns || 6;
  const roster = students.filter(
    (s) => s.name.includes(q) || (s.student_no || "").includes(q),
  );
  const selected =
    position &&
    draft.find((a) => a.row === position[0] && a.column === position[1]);
  return (
    <>
      <Feedback error={error} message={message} />
      <div className="class-summary">
        <div className="class-choice">
          <div className="class-icon">
            <GraduationCap size={24} />
          </div>
          <div>
            <div className="class-label">
              当前班级{" "}
              {group && (
                <span>
                  {group.school_year} · {group.student_count ?? 0} 人
                  {group.archived ? " · 已归档" : ""}
                </span>
              )}
            </div>
            <select
              className="live-class-select"
              aria-label="班级切换"
              disabled={!groups.length || editing || busy}
              value={group?.id || ""}
              onChange={(e) => choose(e.target.value)}
            >
              {!groups.length && (
                <option value="">
                  {loading
                    ? "正在加载…"
                    : archived
                      ? "暂无归档班级"
                      : "尚未创建班级"}
                </option>
              )}
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {g.school_year} · {g.grade} {g.class_number}（
                  {g.id.slice(0, 4)}）
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button
          disabled={editing || busy}
          onClick={() => setPanel("new-class")}
        >
          <Plus size={16} />
          新建班级
        </Button>
      </div>
      <div className="class-toolbar">
        <label className="check-label">
          <input
            type="checkbox"
            checked={archived}
            disabled={editing || busy}
            onChange={(e) => {
              setArchived(e.target.checked);
              setParams(e.target.checked ? { archived: "1" } : {});
              setMessage("");
            }}
          />
          查看已归档班级
        </label>
        <div className="toolbar-actions">
          <Button
            variant="outline"
            disabled={editing || busy}
            onClick={() => setPanel("directory")}
          >
            <UsersRound size={15} />
            学生管理
          </Button>
          {group && (
            <>
              <Button
                variant="outline"
                disabled={editing || busy}
                onClick={() => setPanel("operations")}
              >
                操作记录
              </Button>
              <Button
                variant="outline"
                disabled={!!group.archived || editing || busy}
                onClick={() => setPanel("class")}
              >
                <Settings2 size={15} />
                班级设置
              </Button>
            </>
          )}
        </div>
      </div>
      {loading && !groups.length ? (
        <p className="loading-state">正在读取班级…</p>
      ) : !group ? (
        <section className="card first-class">
          <GraduationCap size={40} />
          <h2>{archived ? "暂无归档班级" : "还没有班级"}</h2>
          <p>
            {archived
              ? "归档班级会保留学生与归属历史。"
              : "点击右上角“新建班级”，开始建立你的教室。"}
          </p>
        </section>
      ) : !layout ? (
        <p className="loading-state">
          正在读取教室…
          <Button variant="outline" onClick={reload}>
            重试
          </Button>
        </p>
      ) : (
        <>
          <section className="card classroom">
            <div className="section-heading">
              <div>
                <h2>
                  <LayoutGrid size={17} />
                  教室座位图
                </h2>
                <p>
                  {editing
                    ? "拖动学生到座位，或点击座位后选择学生。更改须保存才会生效。"
                    : "点击已分配学生的座位查看档案。"}
                </p>
              </div>
              <div className="room-actions">
                {editing ? (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setEditing(false);
                        setPosition(null);
                      }}
                    >
                      <X size={14} />
                      取消安排
                    </Button>
                    <Button disabled={busy} onClick={() => void save()}>
                      <Check size={14} />
                      保存座位布局
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    disabled={!!group.archived}
                    onClick={begin}
                  >
                    <Move size={15} />
                    安排座位
                  </Button>
                )}
              </div>
            </div>
            {editing && (
              <div className="seat-controls">
                <label>
                  行数
                  <input
                    aria-label="教室行数"
                    type="number"
                    min="1"
                    max="12"
                    value={rows}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n >= 1 && n <= 12) setRows(n);
                    }}
                  />
                </label>
                <label>
                  列数
                  <input
                    aria-label="教室列数"
                    type="number"
                    min="1"
                    max="12"
                    value={columns}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n >= 1 && n <= 12) setColumns(n);
                    }}
                  />
                </label>
                <span className="form-help">
                  1–12 行 / 列；缩小前请先清空范围外的座位。
                </span>
                {position && (
                  <label className="seat-picker">
                    {position[0]} 排 {position[1]} 列
                    <select
                      aria-label="为选中座位选择学生"
                      value={selected?.student_id || ""}
                      disabled={busy}
                      onChange={(e) =>
                        assign(e.target.value, position[0], position[1])
                      }
                    >
                      <option value="">空座位（清空）</option>
                      {students.map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.name} · {s.student_no || s.id.slice(0, 6)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    reload();
                  }}
                >
                  <RefreshCw size={14} />
                  重新载入
                </Button>
              </div>
            )}
            <div className="classroom-floor live-floor">
              <div className="blackboard">
                <span>黑 板</span>
                <i />
              </div>
              <div className="podium">讲台</div>
              <div
                className="seat-grid live-seats"
                aria-label="教室座位图"
                style={{ "--seat-columns": displayColumns } as CSSProperties}
              >
                {Array.from(
                  { length: displayRows * displayColumns },
                  (_, index) => {
                    const row = Math.floor(index / displayColumns) + 1,
                      column = (index % displayColumns) + 1;
                    const assignment = assignments.find(
                      (a) => a.row === row && a.column === column,
                    );
                    const student = students.find(
                      (s) => s.id === assignment?.student_id,
                    );
                    return (
                      <button
                        key={`${row}-${column}`}
                        className={`seat ${student ? "occupied" : "empty"} ${position?.[0] === row && position?.[1] === column ? "selected-seat" : ""}`}
                        aria-label={`${row}排${column}列 ${student?.name || "空座位"}`}
                        disabled={busy || (!editing && !student)}
                        draggable={editing && !!student && !busy}
                        onDragStart={(e) => {
                          if (student)
                            e.dataTransfer.setData("text/plain", student.id);
                        }}
                        onDragOver={(e) => {
                          if (editing && !busy) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const id = e.dataTransfer.getData("text/plain");
                          if (
                            editing &&
                            !busy &&
                            students.some((s) => s.id === id)
                          )
                            assign(id, row, column);
                        }}
                        onClick={() => {
                          if (editing) setPosition([row, column]);
                          else if (student)
                            window.location.assign(`/students/${student.id}`);
                        }}
                      >
                        <span className="seat-number">
                          {row}-{column}
                        </span>
                        {student ? (
                          <>
                            <span className="avatar">
                              {student.name.slice(0, 1)}
                            </span>
                            <span className="student-name">{student.name}</span>
                            <span className="seat-caption">
                              {student.student_no || "未填学号"}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="empty-avatar">
                              <Plus size={17} />
                            </span>
                            <span className="seat-caption">空座位</span>
                          </>
                        )}
                      </button>
                    );
                  },
                )}
              </div>
              <div className="room-back">教 室 后 方</div>
            </div>
            <div className="classroom-footer">
              <span>
                <Monitor size={13} /> 面向黑板 · {displayRows} 排 ×{" "}
                {displayColumns} 列
              </span>
              <span>
                {editing ? "当前为待保存安排" : "布局已持久保存"} · 版本{" "}
                {layout.version}
              </span>
            </div>
          </section>
          <section className="card roster-card">
            <div className="roster-heading">
              <h2>
                <UsersRound size={18} />
                班级学生 <span className="badge">{students.length} 人</span>
              </h2>
              <div className="toolbar-actions">
                <Button
                  variant="outline"
                  disabled={!!group.archived || editing}
                  onClick={() => setPanel("import")}
                >
                  <Upload size={15} />
                  Excel 导入
                </Button>
                <Button
                  disabled={!!group.archived || editing}
                  onClick={() => setPanel("student")}
                >
                  <Plus size={15} />
                  添加学生
                </Button>
              </div>
            </div>
            <input
              aria-label="搜索本班学生"
              placeholder="搜索姓名或学号"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {editing && (
              <p className="form-help">
                将下方学生拖到座位，或使用座位选择框。已排座学生也可拖动交换。
              </p>
            )}
            <div className="roster-grid">
              {roster.map((s) => (
                <div
                  className="roster-student"
                  key={s.id}
                  draggable={editing && !busy}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", s.id)
                  }
                >
                  <span className="avatar">{s.name.slice(0, 1)}</span>
                  <div>
                    <Link
                      to={`/students/${s.id}`}
                      onClick={(e) => {
                        if (editing) e.preventDefault();
                      }}
                    >
                      {s.name}
                    </Link>
                    <small>
                      {s.student_no || "未填学号"} ·{" "}
                      {assignments.some((a) => a.student_id === s.id)
                        ? "已排座"
                        : "未排座"}
                    </small>
                  </div>
                </div>
              ))}
            </div>
            {!roster.length && (
              <p className="loading-state">
                {students.length
                  ? "没有匹配学生"
                  : "尚无学生，添加或导入后即可安排座位。"}
              </p>
            )}
          </section>
        </>
      )}
      {panel === "new-class" && (
        <ClassEditor onClose={() => setPanel(null)} onSaved={savedClass} />
      )}{" "}
      {panel === "class" && group && (
        <ClassEditor
          group={group}
          onClose={() => setPanel(null)}
          onSaved={savedClass}
        />
      )}{" "}
      {panel === "student" && group && (
        <StudentEditor
          classId={group.id}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            setMessage("学生已添加");
            reload();
          }}
        />
      )}
      {panel === "directory" && (
        <StudentDirectory onClose={() => setPanel(null)} />
      )}{" "}
      {panel === "import" && group && (
        <ImportStudents
          classId={group.id}
          onClose={() => setPanel(null)}
          onSaved={reload}
        />
      )}{" "}
      {panel === "operations" && group && (
        <Operations classId={group.id} onClose={() => setPanel(null)} />
      )}
    </>
  );
}
