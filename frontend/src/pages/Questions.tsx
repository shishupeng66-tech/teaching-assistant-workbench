import { useEffect, useState, lazy } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Plus, LibraryBig, Search, BookOpen } from "lucide-react";
import { Button } from "../components/ui/button";
import Drawer, { Feedback } from "../components/Drawer";
const RichView = lazy(() =>
  import("../features/library/RichView").then((m) => ({ default: m.RichView })),
);
import PointEditor from "../features/library/PointEditor";
import type { Point } from "../features/library/types";
import { api } from "../api";
import { useCatalog } from "../features/library/useCatalog";
import ChapterTree from "../features/library/ChapterTree";
import {
  PointMapping,
  ExistingQuestionLink,
} from "../features/library/ChapterLinks";
import LibraryImport from "../features/library/LibraryImport";
import CatalogEditor from "../features/library/CatalogEditor";
import {
  nodePath,
  bookLabel,
  statuses,
  types,
} from "../features/library/types";
import type { QuestionPage, Stats } from "../features/library/types";

export default function Questions() {
  const [point, setPoint] = useState<Point | null>(null),
    [editingPoint, setEditingPoint] = useState(false);
  const {
    catalog: c,
    loading: catalogLoading,
    error: catalogError,
    reload,
  } = useCatalog();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [q, setQ] = useState(""),
    [filters, setFilters] = useState({
      grade: "",
      question_type: "",
      difficulty: "",
      status: "",
      knowledge_point_id: "",
    }),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(20),
    [descendants, setDescendants] = useState(true),
    [busy, setBusy] = useState(true),
    [result, setResult] = useState<QuestionPage>({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
    }),
    [stats, setStats] = useState<Stats | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [tick, setTick] = useState(0),
    [panel, setPanel] = useState<
      "points" | "existing" | "import" | "node" | null
    >(null);
  const activeSubjects = c.subjects,
    subject =
      params.get("subject") === "all"
        ? undefined
        : activeSubjects.find((s) => s.id === params.get("subject")) ||
          activeSubjects.find((s) => s.active) ||
          activeSubjects[0];
  const editions = c.editions.filter((e) => e.subject_id === subject?.id),
    edition =
      editions.find((e) => e.id === params.get("edition")) ||
      editions.find(
        (e) =>
          e.id === c.books.find((b) => b.id === params.get("book"))?.edition_id,
      ) ||
      editions[0];
  const books = c.books.filter((b) => b.edition_id === edition?.id),
    book = books.find((b) => b.id === params.get("book")) || books[0];
  const nodes = c.nodes.filter((n) => n.book_id === book?.id);
  const node =
    nodes.find((n) => n.id === params.get("node")) ||
    nodes
      .filter((n) => !n.parent_id && n.active)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))[0];
  const allMode =
    params.get("mode") === "all" || params.get("subject") === "all" || !!q;
  const back = location.pathname + location.search;
  const selectedNodes = new Set<string>(node ? [node.id] : []);
  if (descendants) {
    let changed = true;
    while (changed) {
      const more = nodes.filter(
        (n) =>
          n.parent_id &&
          selectedNodes.has(n.parent_id) &&
          !selectedNodes.has(n.id),
      );
      changed = more.length > 0;
      more.forEach((n) => selectedNodes.add(n.id));
    }
  }
  const mapped = c.points.filter(
    (p) =>
      c.mappings.some(
        (m) => m.knowledge_point_id === p.id && selectedNodes.has(m.node_id),
      ) ||
      (c.candidates || []).some(
        (m) => m.point_id === p.id && selectedNodes.has(m.node_id),
      ),
  );
  const visibleMapped = mapped.filter(
    (p) =>
      !["approved", "pending"].includes(filters.status) ||
      p.review_status === filters.status,
  );
  useEffect(() => {
    setPage(1);
  }, [q, filters, descendants, params, pageSize]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({
      ...filters,
      q,
      subject_id: subject?.id || "",
      node_id: !allMode ? node?.id || "" : "",
      descendants: String(descendants),
    })) {
      if (value) search.set(key, value);
    }
    Promise.all([
      api<QuestionPage>(
        `/library/questions?${search}&page=${page}&page_size=${pageSize}`,
      ),
      api<Stats>(`/library/statistics?${search}`),
    ])
      .then(([r, s]) => {
        if (active) {
          setResult(r);
          setStats(s);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [
    filters,
    q,
    subject?.id,
    node?.id,
    allMode,
    descendants,
    page,
    pageSize,
    tick,
  ]);
  function selectNode(id: string) {
    setQ("");
    setPage(1);
    setParams({
      subject: subject?.id || "",
      edition: edition?.id || "",
      book: book?.id || "",
      node: id,
      mode: "chapter",
    });
  }
  function refresh() {
    reload();
    setTick((t) => t + 1);
  }
  const newLink = `/questions/new?subject=${subject?.id || ""}${!allMode && node ? "&node=" + node.id : ""}&back=${encodeURIComponent(back)}`;
  function filter(key: keyof typeof filters, value: string) {
    setFilters((old) => ({ ...old, [key]: value }));
  }
  return (
    <>
      <div className="library-heading compact">
        <h1>题库</h1>
        <div className="toolbar-actions">
          <Button asChild variant="outline">
            <Link
              to={`/questions/review?node=${!allMode ? node?.id || "" : ""}`}
            >
              集中审核
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/questions/catalog">教材目录管理</Link>
          </Button>
          <Button asChild variant="outline">
            <Link
              to={`/questions/knowledge${subject ? "?subject=" + subject.id : ""}`}
            >
              知识点主库
            </Link>
          </Button>
          <Button
            variant="outline"
            disabled={!subject}
            onClick={() => setPanel("import")}
          >
            批量导入
          </Button>
          <Button asChild>
            <Link to={newLink}>
              <Plus size={16} />
              新增题目
            </Link>
          </Button>
        </div>
      </div>
      <Feedback error={error || catalogError} message={message} />
      <div className="question-workspace">
        <aside className="card question-tree">
          <div className="catalog-tree-title">
            <h2>
              <BookOpen size={16} />
              教材目录
            </h2>
          </div>
          <Button
            variant={allMode ? "default" : "ghost"}
            className="all-questions"
            onClick={() => {
              setQ("");
              setParams({ ...Object.fromEntries(params), mode: "all" });
            }}
          >
            <LibraryBig size={16} />
            全部题目
          </Button>
          <ChapterTree
            nodes={nodes}
            selected={!allMode ? node?.id : undefined}
            onSelect={selectNode}
            onReload={refresh}
            onError={setError}
          />
          <div className="tree-footer">
            <Link to="/questions/catalog">管理版本、册别与章节</Link>
          </div>
        </aside>
        <div className="question-content">
          {catalogLoading ? (
            <p className="loading-state">读取教材目录…</p>
          ) : (
            <>
              <section className="card chapter-context">
                <div className="chapter-context-title">
                  <div>
                    <div className="chapter-path">
                      {allMode
                        ? "跨教材检索"
                        : book
                          ? bookLabel(c, book.id)
                          : "先建立自己的教材目录"}
                    </div>
                    <h2>
                      {allMode ? "全部题目" : node?.name || "尚无教材章节"}
                    </h2>
                  </div>
                  {allMode && (
                    <label className="global-question-search">
                      <Search size={16} />
                      <input
                        aria-label="全局题目搜索"
                        placeholder="跨教材搜索题干文本"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                      />
                    </label>
                  )}
                  {!allMode && node && (
                    <Button variant="outline" onClick={() => setPanel("node")}>
                      编辑章节说明
                    </Button>
                  )}
                </div>
                {!allMode && node && (
                  <>
                    <div className="chapter-path">{nodePath(c, node.id)}</div>
                    <details className="chapter-description-disclosure">
                      <summary>教学目标与章节说明</summary>
                      <p className="chapter-description">
                        {node.description ||
                          "暂无教学目标或说明，可通过编辑章节补充。"}
                      </p>
                    </details>
                    <div className="chapter-scope">
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={descendants}
                          onChange={(e) => setDescendants(e.target.checked)}
                        />
                        包含全部下级章节
                      </label>
                      <span>
                        {descendants
                          ? "范围：当前节点及全部下级，题目去重计数"
                          : "范围：仅当前节点"}
                      </span>
                    </div>
                    <div className="chapter-knowledge">
                      <div>
                        <h3>本范围知识点</h3>
                        <div className="knowledge-chips">
                          {visibleMapped.map((p) => (
                            <button
                              key={p.id}
                              className="badge knowledge-button"
                              onClick={() => {
                                setEditingPoint(false);
                                setPoint(p);
                              }}
                            >
                              {p.name} ·{" "}
                              {p.review_status === "approved"
                                ? "已审核"
                                : "待教师审核"}
                              {!p.active ? "（停用）" : ""}
                            </button>
                          ))}
                          {!visibleMapped.length && (
                            <span className="form-help">尚未关联知识点</span>
                          )}
                        </div>
                      </div>
                      <div className="toolbar-actions">
                        <Button
                          variant="outline"
                          disabled={!node.active}
                          onClick={() => setPanel("points")}
                        >
                          调整知识点关联
                        </Button>
                        <Button asChild variant="outline">
                          <Link
                            to={`/questions/knowledge?subject=${subject?.id}&node=${node.id}&new=1`}
                          >
                            新增知识点
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          disabled={!node.active}
                          onClick={() => setPanel("existing")}
                        >
                          关联已有题目
                        </Button>
                      </div>
                    </div>
                  </>
                )}
                {!allMode && !node && (
                  <p className="form-help">
                    可从空目录手动新增，或导入教师审核过的结构；也可使用“全部题目”直接录题。
                  </p>
                )}
                {!allMode && node && (
                  <details className="future-chapter-actions">
                    <summary>后续教学工具（未开放）</summary>
                    <div>
                      <Button
                        disabled
                        variant="ghost"
                        title="第四阶段及后续阶段开发"
                      >
                        按本章组卷（后续）
                      </Button>
                      <Button disabled variant="ghost" title="后续阶段开发">
                        章节测试（后续）
                      </Button>
                      <Button disabled variant="ghost" title="后续阶段开发">
                        AI 教学建议（后续）
                      </Button>
                    </div>
                  </details>
                )}
              </section>
              <div className="question-filters">
                <input
                  aria-label="题目年级筛选"
                  placeholder="年级（精确匹配）"
                  value={filters.grade}
                  onChange={(e) => filter("grade", e.target.value)}
                />
                <select
                  aria-label="题目题型筛选"
                  value={filters.question_type}
                  onChange={(e) => filter("question_type", e.target.value)}
                >
                  <option value="">全部题型</option>
                  {types.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <select
                  aria-label="题目难度筛选"
                  value={filters.difficulty}
                  onChange={(e) => filter("difficulty", e.target.value)}
                >
                  <option value="">全部难度</option>
                  {[1, 2, 3, 4, 5].map((t) => (
                    <option key={t} value={t}>
                      难度 {t}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="题目知识点筛选"
                  value={filters.knowledge_point_id}
                  onChange={(e) => filter("knowledge_point_id", e.target.value)}
                >
                  <option value="">全部知识点</option>
                  {c.points
                    .filter((p) => !subject || p.subject_id === subject.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                </select>
                <select
                  aria-label="题目审核状态筛选"
                  value={filters.status}
                  onChange={(e) => filter("status", e.target.value)}
                >
                  <option value="">全部审核状态</option>
                  {Object.entries(statuses).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setFilters({
                      grade: "",
                      question_type: "",
                      difficulty: "",
                      status: "",
                      knowledge_point_id: "",
                    });
                    setQ("");
                  }}
                >
                  清空筛选
                </Button>
              </div>
              {!busy && stats && (
                <section className="card content-summary" aria-label="题库统计">
                  <span>
                    知识点 <b>{stats.knowledge_total}</b>（已审核{" "}
                    {stats.knowledge_approved} / 待审核{" "}
                    {stats.knowledge_pending}）
                  </span>
                  <span>
                    题目 <b data-testid="scope-question-count">{stats.total}</b>{" "}
                    · 已审核 {stats.approved} · 待审核{" "}
                    {stats.statuses.pending || 0}
                  </span>
                  <small>
                    候选关联可预览；仅教师审核通过内容可作为正式可用资源。
                  </small>
                  <details>
                    <summary>题型与难度分布</summary>
                    {Object.entries(stats.types).map(([k, v]) => (
                      <span key={k}>
                        {k} {v}　
                      </span>
                    ))}
                    <br />
                    {Object.entries(stats.difficulties).map(([k, v]) => (
                      <span key={k}>
                        {k}级 {v}　
                      </span>
                    ))}
                    <p>
                      知识点覆盖 {stats.knowledge_covered}/
                      {stats.knowledge_total}；无知识点题目{" "}
                      {stats.unmapped_questions}
                    </p>
                  </details>
                </section>
              )}
              <div className="content-tabs" aria-label="内容审核筛选">
                {[
                  ["", "全部内容"],
                  ["approved", "已审核"],
                  ["pending", "待审核"],
                ].map(([key, label]) => (
                  <Button
                    key={key}
                    variant={filters.status === key ? "default" : "outline"}
                    onClick={() => filter("status", key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <section className="card question-list">
                <div className="section-heading">
                  <h2>关联题目列表</h2>
                  <span>{result.total} 条 · 后端分页</span>
                </div>
                {busy ? (
                  <p className="loading-state">正在检索题目…</p>
                ) : (
                  result.items.map((item) => (
                    <article key={item.id} className="question-preview">
                      <Link
                        className="question-row"
                        to={`/questions/${item.id}?back=${encodeURIComponent(back)}`}
                      >
                        <div className="question-row-meta">
                          <span className="badge">{item.question_type}</span>
                          <span>
                            {item.grade || "年级未填写"} · 难度{" "}
                            {item.difficulty}
                          </span>
                          <span className={`review-badge ${item.status}`}>
                            {statuses[item.status]}
                          </span>
                        </div>
                        <p>{item.summary}</p>
                        <div className="question-row-bottom">
                          <span>
                            {item.knowledge_links
                              .map(
                                (k) =>
                                  c.points.find(
                                    (p) => p.id === k.knowledge_point_id,
                                  )?.name || "知识点",
                              )
                              .join(" · ") || "尚未关联知识点"}
                          </span>
                          <small>
                            v{item.version} ·{" "}
                            {new Date(item.updated_at).toLocaleDateString(
                              "zh-CN",
                            )}
                          </small>
                        </div>
                      </Link>
                      <details className="inline-answer">
                        <summary>展开题干、答案与解析</summary>
                        <RichView doc={item.stem} />
                        <h3>参考答案</h3>
                        <RichView doc={item.answer} />
                        <h3>解析</h3>
                        <RichView doc={item.explanation} />
                        <p className="form-help">
                          {item.status === "approved"
                            ? "教师已审核"
                            : "待教师审核，未列为正式可用题目"}
                        </p>
                      </details>
                    </article>
                  ))
                )}
                {!busy && !result.items.length && (
                  <div className="question-empty">
                    <LibraryBig size={30} />
                    <h3>此范围暂无题目</h3>
                    <p>新建或导入题目，或将已有题目关联到章节。</p>
                    <Button asChild variant="outline">
                      <Link to={newLink}>录入第一道题</Link>
                    </Button>
                  </div>
                )}
                <div className="pagination">
                  <select
                    aria-label="每页题目数量"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    {[10, 20, 50].map((n) => (
                      <option key={n} value={n}>
                        {n} 条 / 页
                      </option>
                    ))}
                  </select>
                  <span>
                    第 {page} /{" "}
                    {Math.max(1, Math.ceil(result.total / pageSize))} 页
                  </span>
                  <Button
                    variant="outline"
                    disabled={busy || page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || page * pageSize >= result.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    下一页
                  </Button>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
      {point && !editingPoint && (
        <Drawer title={point.name} onClose={() => setPoint(null)}>
          <p className="review-badge">
            {point.review_status === "approved" ? "已审核" : "待教师审核"}
          </p>
          <h3>简明定义</h3>
          <p>{point.description}</p>
          <h3>教学要求</h3>
          <p>{point.teaching_requirements || "尚未补充"}</p>
          <h3>掌握标准</h3>
          <ul>
            {point.mastery_criteria?.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p>
            适用难度：{point.difficulty_min}—{point.difficulty_max}
          </p>
          <h3>来源</h3>
          <p>{point.content_source || "教师录入"}</p>
          <Button onClick={() => setEditingPoint(true)}>编辑知识点</Button>
          <h3>审核记录</h3>
          {point.content_reviews?.map((r, i) => (
            <p key={i}>
              {r.created_at} · {r.action} · {r.note}
            </p>
          ))}
        </Drawer>
      )}
      {point && editingPoint && (
        <PointEditor
          catalog={c}
          subjectId={point.subject_id}
          identity={point.id}
          onClose={() => setPoint(null)}
          onSaved={() => {
            setPoint(null);
            refresh();
            setMessage("知识点修改已保存，需重新审核");
          }}
        />
      )}
      {panel === "points" && node && subject && (
        <PointMapping
          catalog={c}
          nodeId={node.id}
          subjectId={subject.id}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            setMessage("章节知识点关联已保存");
            refresh();
          }}
        />
      )}
      {panel === "existing" && node && subject && (
        <ExistingQuestionLink
          nodeId={node.id}
          subjectId={subject.id}
          onClose={() => setPanel(null)}
          onSaved={refresh}
        />
      )}{" "}
      {panel === "import" && subject && (
        <LibraryImport
          kind="questions"
          scopeId={subject.id}
          onClose={() => setPanel(null)}
          onSaved={refresh}
        />
      )}{" "}
      {panel === "node" && node && (
        <CatalogEditor
          kind="nodes"
          existing={node as unknown as Record<string, unknown>}
          catalog={c}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            refresh();
          }}
        />
      )}
    </>
  );
}
