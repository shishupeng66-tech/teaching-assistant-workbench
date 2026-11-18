import { useState } from "react";
import Drawer, { Feedback } from "../../components/Drawer";
import { Button } from "../../components/ui/button";
import { upload } from "../../api";
import { docText } from "./types";
import type { Doc } from "./types";
type Preview = {
  rows: {
    row: number;
    error: string | null;
    duplicate: boolean;
    data: { path?: string; stem?: Doc } | null;
    similar_questions?: { id: string; similarity: number }[];
  }[];
  valid_count: number;
  error_count: number;
  duplicate_count: number;
  already_imported: boolean;
  imported_count?: number;
  skipped_count?: number;
};
export default function LibraryImport({
  kind,
  scopeId,
  onClose,
  onSaved,
}: {
  kind: "questions" | "nodes";
  scopeId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [policy, setPolicy] = useState("reject"),
    [confirmation, setConfirmation] = useState(""),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [done, setDone] = useState(false);
  async function send(commit = false) {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    const body = new FormData();
    body.append("file", file);
    body.append("scope_id", scopeId);
    body.append("policy", policy);
    body.append("confirmation", confirmation);
    try {
      const p = await upload<Preview>(
        `/library/import/${kind}/${commit ? "commit" : "preview"}`,
        body,
      );
      setPreview(p);
      if (p.already_imported) {
        setDone(true);
        setMessage("相同文件已经导入，未重复保存。");
      } else if (commit) {
        setDone(true);
        setMessage(
          `导入完成：新增 ${p.imported_count} 条，跳过 ${p.skipped_count} 条。${kind === "questions" ? "题目均为草稿，尚未审核。" : ""}`,
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
    <Drawer
      title={kind === "questions" ? "批量导入题目" : "导入已审核教材目录"}
      onClose={onClose}
      busy={busy}
    >
      <Feedback error={error} message={message} />
      <a
        className="template-link"
        href={`/api/library/import/${kind}/template`}
        download
      >
        下载{kind === "questions" ? "题目" : "教材目录"} Excel 模板
      </a>
      <p className="form-help">
        仅.xlsx，最多500条、5MB；预览不写库。题目只按已有且唯一的章节路径关联，错误或歧义须修正，不会自动新建章节。目录须教师先核实。
      </p>
      <label className="file-field">
        选择导入文件
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
            setAck(false);
          }}
        />
      </label>
      <Button
        variant="outline"
        disabled={busy || !file}
        onClick={() => void send()}
      >
        校验并预览
      </Button>
      {preview && !preview.already_imported && (
        <>
          <div className="import-summary">
            有效 {preview.valid_count} 条 · 重复/相似 {preview.duplicate_count}{" "}
            条 · 错误 {preview.error_count} 条
          </div>
          <div className="import-table">
            <table>
              <thead>
                <tr>
                  <th>行</th>
                  <th>记录</th>
                  <th>校验</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.row}>
                    <td>{r.row}</td>
                    <td>
                      {r.data?.path ||
                        (r.data?.stem
                          ? docText(r.data.stem).slice(0, 100)
                          : "—")}
                    </td>
                    <td className={r.error ? "text-danger" : ""}>
                      {r.error ||
                        (r.duplicate ? "重复或相似，须核对" : "可导入")}
                      {r.similar_questions?.map((q) => (
                        <a
                          key={q.id}
                          href={`/questions/${q.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          相似度 {Math.round(q.similarity * 100)}%
                        </a>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="policy-label">
            重复处理
            <select
              aria-label="题库导入重复处理"
              value={policy}
              disabled={busy || done}
              onChange={(e) => setPolicy(e.target.value)}
            >
              <option value="reject">存在重复/相似时整批拒绝</option>
              <option value="skip">跳过重复/相似记录</option>
              {kind === "questions" && (
                <option value="keep">已核对，保留为独立题目</option>
              )}
            </select>
          </label>
          {policy === "keep" && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              我已逐项核对，仍需分别保存，不合并题目
            </label>
          )}
          {kind === "nodes" && (
            <label className="editor-label">
              输入“目录已审核”
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
          )}
          <p className="form-help">
            不会静默覆盖任何已有记录；有错误行时整批不写入。目录已有路径只能跳过，不能通过导入覆盖。
          </p>
          <Button
            disabled={
              busy ||
              done ||
              preview.error_count > 0 ||
              (preview.duplicate_count > 0 && policy === "reject") ||
              (policy === "keep" && !ack) ||
              (kind === "nodes" && confirmation !== "目录已审核")
            }
            onClick={() => void send(true)}
          >
            确认批量保存
          </Button>
        </>
      )}
    </Drawer>
  );
}
