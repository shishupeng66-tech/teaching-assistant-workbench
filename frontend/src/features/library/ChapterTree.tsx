import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, ArrowUp, ArrowDown } from "lucide-react";
import { api } from "../../api";
import type { Chapter } from "./types";
export default function ChapterTree({
  nodes,
  selected,
  onSelect,
  onReload,
  onError,
}: {
  nodes: Chapter[];
  selected?: string;
  onSelect: (id: string) => void;
  onReload: () => void;
  onError: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set()),
    [q, setQ] = useState(""),
    [inactive, setInactive] = useState(false),
    [busy, setBusy] = useState(false);
  const candidates = nodes
    .filter((n) => inactive || n.active)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const visible = (n: Chapter): boolean =>
    n.name.includes(q) ||
    candidates.filter((x) => x.parent_id === n.id).some(visible);
  async function order(id: string, direction: string) {
    setBusy(true);
    try {
      await api(`/library/nodes/${id}/order`, { direction });
      onReload();
    } catch (e) {
      onError(e instanceof Error ? e.message : "排序失败");
    } finally {
      setBusy(false);
    }
  }
  function branch(parent: string | null, depth = 0): ReactNode {
    return candidates
      .filter((n) => n.parent_id === parent && (!q || visible(n)))
      .map((n) => {
        const children = candidates.some((x) => x.parent_id === n.id),
          open = !!q || expanded.has(n.id);
        return (
          <div key={n.id}>
            <div
              className={`chapter-row ${selected === n.id ? "selected" : ""}`}
              style={{ paddingLeft: depth * 14 + 4 }}
            >
              <button
                type="button"
                className="tree-expand"
                aria-label={`${open ? "收起" : "展开"}${n.name}`}
                aria-expanded={open}
                disabled={!children}
                onClick={() =>
                  setExpanded((old) => {
                    const next = new Set(old);
                    if (next.has(n.id)) next.delete(n.id);
                    else next.add(n.id);
                    return next;
                  })
                }
              >
                <ChevronRight size={14} className={open ? "rotated" : ""} />
              </button>
              <button
                type="button"
                className="tree-name"
                title={n.name}
                onClick={() => onSelect(n.id)}
              >
                {n.name}
                {!n.active && <small>停用</small>}
              </button>
              <div className="tree-order">
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`上移${n.name}`}
                  onClick={() => void order(n.id, "up")}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`下移${n.name}`}
                  onClick={() => void order(n.id, "down")}
                >
                  <ArrowDown size={12} />
                </button>
              </div>
            </div>
            {children && open && branch(n.id, depth + 1)}
          </div>
        );
      });
  }
  return (
    <div className="chapter-tree">
      <input
        aria-label="搜索教材目录"
        placeholder="搜索章节或课时"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <label className="check-label">
        <input
          type="checkbox"
          checked={inactive}
          onChange={(e) => setInactive(e.target.checked)}
        />
        显示停用目录
      </label>
      <nav aria-label="教材目录树">{branch(null)}</nav>
      {!nodes.length && (
        <p className="form-help">目录为空，请手动新增或导入已审核的结构。</p>
      )}
    </div>
  );
}
