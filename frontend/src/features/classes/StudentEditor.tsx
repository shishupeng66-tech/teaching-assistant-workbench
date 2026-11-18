import { useState } from "react";
import type { FormEvent } from "react";
import Drawer, { Feedback } from "../../components/Drawer";
import { Button } from "../../components/ui/button";
import { api } from "../../api";
import type { Student } from "./types";
export default function StudentEditor({
  student,
  classId,
  onClose,
  onSaved,
}: {
  student?: Student;
  classId?: string;
  onClose: () => void;
  onSaved: (student: Student) => void;
}) {
  const [form, setForm] = useState({
    name: student?.name || "",
    student_no: student?.student_no || "",
    gender: student?.gender || "",
    entry_year: student?.entry_year?.toString() || "",
    notes: student?.notes || "",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = {
      ...form,
      gender: form.gender || null,
      student_no: form.student_no || null,
      entry_year: form.entry_year ? Number(form.entry_year) : null,
      ...(!student ? { class_id: classId } : {}),
    };
    try {
      onSaved(
        await api<Student>(
          student ? `/students/${student.id}/update` : "/students",
          data,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      title={student ? "编辑学生资料" : "添加学生"}
      busy={busy}
      onClose={onClose}
    >
      <Feedback error={error} />
      <form className="editor-form" onSubmit={(e) => void save(e)}>
        <label>
          学生姓名
          <input
            required
            maxLength={80}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          学号（可选）
          <input
            maxLength={60}
            value={form.student_no}
            onChange={(e) => setForm({ ...form, student_no: e.target.value })}
          />
        </label>
        <label>
          性别（可选）
          <select
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
          >
            <option value="">未填写</option>
            {["男", "女", "其他"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          入学年份（可选）
          <input
            type="number"
            min="1900"
            max="2100"
            step="1"
            value={form.entry_year}
            onChange={(e) => setForm({ ...form, entry_year: e.target.value })}
          />
        </label>
        <label>
          备注（可选）
          <textarea
            rows={4}
            maxLength={2000}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <p className="form-help">
          永久内部 ID
          自动生成，不随转班或学号变化。同名学生分别建档；非空学号在全系统内须唯一。
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
          <Button disabled={busy}>{busy ? "保存中…" : "保存学生"}</Button>
        </div>
      </form>
    </Drawer>
  );
}
