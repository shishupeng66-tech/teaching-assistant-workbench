import { useState, useEffect } from "react";
import Drawer, { Feedback } from "../../components/Drawer";
import { api } from "../../api";
import { operationNames } from "./types";
import type { Operation } from "./types";
function readableSnapshot(raw: string | null): string {
  if (!raw) return "无";
  const d = JSON.parse(raw);
  const fields: Record<string, string> = {
    name: "姓名 / 名称",
    student_no: "学号",
    gender: "性别",
    entry_year: "入学年份",
    notes: "备注",
    school_year: "学年",
    grade: "年级",
    class_number: "班级编号",
    rows: "行数",
    columns: "列数",
    version: "布局版本",
    archived: "归档标记",
    status: "档案状态",
  };
  const lines = Object.entries(fields)
    .filter(([key]) => key in d)
    .map(
      ([key, label]) =>
        `${label}：${d[key] === null || d[key] === "" ? "未填写" : key === "status" ? (d[key] === "active" ? "在档" : "已归档") : d[key]}`,
    );
  if ("current_class" in d)
    lines.push(
      `当前班级：${d.current_class ? `${d.current_class.name} · ${d.current_class.school_year}` : "无"}`,
    );
  if ("seat" in d)
    lines.push(
      `座位：${d.seat ? `${d.seat.row} 排 ${d.seat.column} 列` : "未安排"}`,
    );
  if ("row" in d) lines.push(`座位：${d.row} 排 ${d.column} 列`);
  if (d.class_name) lines.push(`历史班级：${d.class_name}`);
  if (d.student_ids)
    lines.push(`导入：${d.student_ids.length} 人；跳过：${d.skipped} 条`);
  if (d.assignments)
    lines.push(
      `已排座：${d.assignments.length} 人`,
      ...d.assignments.map(
        (a: { row: number; column: number; student_id: string }) =>
          `${a.row} 排 ${a.column} 列 · 学生 ID ${a.student_id}`,
      ),
    );
  return lines.join("\n") || "操作已记录";
}
export function OperationList({ items }: { items: Operation[] }) {
  return (
    <ul className="operation-list">
      {items.map((item) => (
        <li key={item.id}>
          <strong>{operationNames[item.action] || item.action}</strong>
          <small>
            {new Date(item.at).toLocaleString("zh-CN")} · {item.actor}
          </small>
          <details>
            <summary>查看变更前后</summary>
            <div className="audit-values">
              <span>变更前</span>
              <pre>{readableSnapshot(item.before_json)}</pre>
              <span>变更后</span>
              <pre>{readableSnapshot(item.after_json)}</pre>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
export default function Operations({
  classId,
  onClose,
}: {
  classId: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Operation[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ items: Operation[] }>(`/classes/${classId}/operations`)
      .then((r) => {
        if (active) setItems(r.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [classId]);
  return (
    <Drawer title="班级操作记录" onClose={onClose}>
      <Feedback error={error} />
      <p className="form-help">
        班级变更、导入和座位布局保存均保留记录。学生个人变更请在学生详情查看。
      </p>
      <OperationList items={items} />
    </Drawer>
  );
}
