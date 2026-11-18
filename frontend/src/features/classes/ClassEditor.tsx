import { useState } from "react";
import type { FormEvent } from "react";
import Drawer, { Feedback } from "../../components/Drawer";
import { Button } from "../../components/ui/button";
import { api } from "../../api";
import type { Classroom } from "./types";
export default function ClassEditor({
  group,
  onClose,
  onSaved,
}: {
  group?: Classroom;
  onClose: () => void;
  onSaved: (group: Classroom) => void;
}) {
  const [form, setForm] = useState({
    name: group?.name || "",
    school_year:
      group?.school_year ||
      `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    grade: group?.grade || "",
    class_number: group?.class_number || "",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState<string | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSaved(
        await api<Classroom>(
          group ? `/classes/${group.id}/update` : "/classes",
          form,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!group) return;
    setBusy(true);
    setError("");
    try {
      onSaved(
        await api<Classroom>(`/classes/${group.id}/archive`, {
          confirmation: "确认归档",
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "归档失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      title={group ? "班级设置" : "新建班级"}
      onClose={onClose}
      busy={busy}
    >
      <Feedback error={error} />
      <form className="editor-form" onSubmit={(e) => void save(e)}>
        <label>
          班级名称
          <input
            required
            maxLength={80}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          学年
          <input
            required
            maxLength={30}
            placeholder="例如 2026-2027"
            value={form.school_year}
            onChange={(e) => setForm({ ...form, school_year: e.target.value })}
          />
        </label>
        <label>
          年级
          <input
            maxLength={30}
            placeholder="例如 七年级"
            value={form.grade}
            onChange={(e) => setForm({ ...form, grade: e.target.value })}
          />
        </label>
        <label>
          班级编号
          <input
            maxLength={30}
            placeholder="例如 1"
            value={form.class_number}
            onChange={(e) => setForm({ ...form, class_number: e.target.value })}
          />
        </label>
        <p className="form-help">
          班级名称允许重复，系统以独立 ID
          区分。修改学年、年级或编号时，会为在班学生保留旧归属并建立新历史段，座位不变。
        </p>
        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </Button>
          <Button disabled={busy}>{busy ? "保存中…" : "保存班级"}</Button>
        </div>
      </form>
      {group && !group.archived && (
        <div className="danger-zone">
          <h3>归档班级</h3>
          <p>
            归档后班级只读，学生档案和座位历史仍保留；可查看或将学生转至在用班级。
          </p>
          {confirm === null ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm("")}
            >
              归档此班级
            </Button>
          ) : (
            <>
              <label>
                输入“确认归档”
                <input
                  value={confirm}
                  disabled={busy}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              <Button
                disabled={busy || confirm !== "确认归档"}
                onClick={() => void archive()}
              >
                确认归档班级
              </Button>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
