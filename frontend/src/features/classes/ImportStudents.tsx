import { useState } from "react";
import Drawer, { Feedback } from "../../components/Drawer";
import { Button } from "../../components/ui/button";
import { upload } from "../../api";
type Row = {
  row: number;
  data: { name: string; student_no: string | null } | null;
  error: string | null;
  duplicate: boolean;
};
type Preview = {
  rows: Row[];
  valid_count: number;
  duplicate_count: number;
  error_count: number;
  already_imported: boolean;
  imported_count?: number;
  skipped_count?: number;
};
export default function ImportStudents({
  classId,
  onClose,
  onSaved,
}: {
  classId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [policy, setPolicy] = useState("reject"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [done, setDone] = useState(false);
  async function send(commit = false) {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    const data = new FormData();
    data.append("file", file);
    data.append("policy", policy);
    try {
      const result = await upload<Preview>(
        `/classes/${classId}/${commit ? "import" : "import-preview"}`,
        data,
      );
      setPreview(result);
      if (result.already_imported) {
        setDone(true);
        setMessage("相同文件已导入此班级，本次没有重复新增。");
      } else if (commit) {
        setDone(true);
        setMessage(
          `导入完成：新增 ${result.imported_count} 人，跳过 ${result.skipped_count} 条重复记录。`,
        );
        onSaved();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer title="Excel 批量导入学生" busy={busy} onClose={onClose}>
      <Feedback error={error} message={message} />
      <a className="template-link" href="/api/student-import/template" download>
        下载 Excel 导入模板（.xlsx）
      </a>
      <p className="form-help">
        姓名必填，其余可选。学号按文本填写以保留前导零。最多1000行、5MB，禁止公式。模板未包含样例学生，避免误导入。
      </p>
      <label className="file-field">
        选择 Excel 文件
        <input
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setPreview(null);
            setDone(false);
            setError("");
            setMessage("");
          }}
        />
      </label>
      <Button
        variant="outline"
        disabled={!file || busy}
        onClick={() => void send(false)}
      >
        校验并预览
      </Button>
      {preview && !preview.already_imported && (
        <>
          <div className="import-summary">
            可导入 {preview.valid_count} 条 · 重复 {preview.duplicate_count} 条
            · 错误 {preview.error_count} 条
          </div>
          <div className="import-table">
            <table>
              <thead>
                <tr>
                  <th>行</th>
                  <th>姓名 / 学号</th>
                  <th>检查结果</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.row}>
                    <td>{row.row}</td>
                    <td>
                      {row.data?.name || "—"}
                      <small>{row.data?.student_no || "未填学号"}</small>
                    </td>
                    <td className={row.error ? "text-danger" : ""}>
                      {row.error || "可导入"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="policy-label">
            重复记录处理
            <select
              value={policy}
              disabled={busy || done}
              onChange={(e) => setPolicy(e.target.value)}
            >
              <option value="reject">存在重复时整批拒绝</option>
              <option value="skip">跳过重复记录，导入其余有效行</option>
            </select>
          </label>
          <p className="form-help">
            错误行须修正后再导入；跳过重复不会覆盖或合并已有档案。同名不同学号可分别建档。相同文件重复提交不会重复新增；无学号的修改版文件需人工核对。
          </p>
          <Button
            disabled={
              busy ||
              done ||
              preview.error_count > 0 ||
              (preview.duplicate_count > 0 && policy === "reject") ||
              preview.valid_count === 0
            }
            onClick={() => void send(true)}
          >
            {busy ? "导入中…" : "确认导入"}
          </Button>
        </>
      )}
    </Drawer>
  );
}
