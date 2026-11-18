import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Drawer, { Feedback } from "../../components/Drawer";
import { Button } from "../../components/ui/button";
import { api } from "../../api";
import type { Catalog, QuestionPage } from "./types";
export function PointMapping({
  catalog: c,
  nodeId,
  subjectId,
  onClose,
  onSaved,
}: {
  catalog: Catalog;
  nodeId: string;
  subjectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ids, setIds] = useState(
      c.mappings
        .filter((m) => m.node_id === nodeId)
        .map((m) => m.knowledge_point_id),
    ),
    [q, setQ] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/library/nodes/${nodeId}/knowledge`, {
        knowledge_point_ids: ids,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "关联失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer title="关联章节知识点" onClose={onClose} busy={busy}>
      <Feedback error={error} />
      <p className="form-help">
        只调整当前节点的映射，其他教材、章节和题目关联保持。取消勾选可解除本节点映射。
      </p>
      <input
        aria-label="搜索可关联知识点"
        placeholder="搜索名称或编码"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="reference-picker">
        {c.points
          .filter(
            (p) =>
              p.subject_id === subjectId &&
              (p.name.includes(q) || p.code.includes(q)),
          )
          .map((p) => (
            <label key={p.id}>
              <input
                type="checkbox"
                checked={ids.includes(p.id)}
                disabled={!p.active && !ids.includes(p.id)}
                onChange={() =>
                  setIds((old) =>
                    old.includes(p.id)
                      ? old.filter((x) => x !== p.id)
                      : [...old, p.id],
                  )
                }
              />
              <span>
                {p.name}
                <small>
                  {p.code}
                  {!p.active ? " · 停用" : ""}
                </small>
              </span>
            </label>
          ))}
      </div>
      <Button disabled={busy} onClick={() => void save()}>
        保存章节知识点关联
      </Button>
    </Drawer>
  );
}
export function ExistingQuestionLink({
  nodeId,
  subjectId,
  onClose,
  onSaved,
}: {
  nodeId: string;
  subjectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [result, setResult] = useState<QuestionPage>({
      items: [],
      total: 0,
      page: 1,
      page_size: 10,
    }),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api<QuestionPage>(
      `/library/questions?subject_id=${subjectId}&q=${encodeURIComponent(q)}&page=${page}&page_size=10`,
    )
      .then((r) => {
        if (active) setResult(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [q, page, subjectId]);
  async function link(id: string) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ already_linked: boolean }>(
        `/library/nodes/${nodeId}/questions`,
        { question_id: id },
      );
      setMessage(
        r.already_linked
          ? "已在当前章节中，未重复关联"
          : "已关联到当前章节，题目保留原 ID 并退回草稿待重新审核",
      );
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "关联失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer title="关联已有题目" onClose={onClose} busy={busy}>
      <Feedback error={error} message={message} />
      <p className="form-help">
        跨章节复用同一题目，不复制实体。新增关联会记录版本并退回草稿，须重新审核。
      </p>
      <input
        aria-label="搜索已有题目"
        placeholder="按题干搜索本学科题目"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      <div className="existing-questions">
        {result.items.map((item) => (
          <div key={item.id}>
            <Link to={`/questions/${item.id}`} target="_blank">
              {item.summary}
            </Link>
            <small>
              {item.question_type} · 难度{item.difficulty}
            </small>
            <Button
              variant="outline"
              disabled={busy || item.status === "archived"}
              onClick={() => void link(item.id)}
            >
              关联此题
            </Button>
          </div>
        ))}
      </div>
      <div className="pagination">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          上一页
        </Button>
        <span>
          {page} / {Math.max(1, Math.ceil(result.total / 10))}
        </span>
        <Button
          variant="outline"
          disabled={page * 10 >= result.total}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </Button>
      </div>
    </Drawer>
  );
}
