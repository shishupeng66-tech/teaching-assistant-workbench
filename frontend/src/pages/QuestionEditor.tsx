import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Button } from "../components/ui/button";
import { Feedback } from "../components/Drawer";
import { api } from "../api";
import { useCatalog } from "../features/library/useCatalog";
import RichEditor from "../features/library/RichEditor";
import { validateMath } from "../features/library/RichView";
import {
  types,
  emptyDoc,
  nodeSubject,
  nodePath,
  bookLabel,
} from "../features/library/types";
import type {
  Catalog,
  Doc,
  Question,
  KnowledgeLink,
  Part,
} from "../features/library/types";
type Form = Pick<
  Question,
  | "subject_id"
  | "grade"
  | "question_type"
  | "difficulty"
  | "stem"
  | "answer"
  | "explanation"
  | "source"
  | "knowledge_links"
  | "node_ids"
  | "parts"
>;
function EditorForm({
  catalog: c,
  initial,
  subjectId,
  nodeId,
  back,
}: {
  catalog: Catalog;
  initial?: Question;
  subjectId?: string;
  nodeId?: string;
  back: string;
}) {
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(
    initial
      ? {
          subject_id: initial.subject_id,
          grade: initial.grade,
          question_type: initial.question_type,
          difficulty: initial.difficulty,
          stem: initial.stem,
          answer: initial.answer,
          explanation: initial.explanation,
          source: initial.source,
          knowledge_links: initial.knowledge_links.map((k) => ({
            knowledge_point_id: k.knowledge_point_id,
            is_primary: !!k.is_primary,
            weight: k.weight,
            part_refs: k.part_refs,
          })),
          node_ids: initial.node_ids,
          parts: initial.parts,
        }
      : {
          subject_id: subjectId || c.subjects.find((s) => s.active)?.id || "",
          grade: "",
          question_type: "单选题",
          difficulty: 2,
          stem: emptyDoc(),
          answer: emptyDoc(),
          explanation: emptyDoc(),
          source: "",
          knowledge_links: [],
          node_ids: nodeId ? [nodeId] : [],
          parts: [],
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [similar, setSimilar] = useState<
      { id: string; similarity: number; summary: string }[]
    >([]),
    [ack, setAck] = useState(false),
    [pointQ, setPointQ] = useState(""),
    [chapterQ, setChapterQ] = useState("");
  function updateDoc(key: "stem" | "answer" | "explanation", value: Doc) {
    setForm((old) => ({ ...old, [key]: value }));
    setAck(false);
  }
  function togglePoint(id: string) {
    setForm((old) => {
      const links = old.knowledge_links.some((x) => x.knowledge_point_id === id)
        ? old.knowledge_links.filter((x) => x.knowledge_point_id !== id)
        : [
            ...old.knowledge_links,
            {
              knowledge_point_id: id,
              is_primary: !old.knowledge_links.length,
              weight: null,
              part_refs: [],
            },
          ];
      if (links.length && !links.some((x) => x.is_primary))
        links[0] = { ...links[0], is_primary: true };
      return { ...old, knowledge_links: links };
    });
  }
  function changeLink(id: string, data: Partial<KnowledgeLink>) {
    setForm((old) => ({
      ...old,
      knowledge_links: old.knowledge_links.map((k) =>
        k.knowledge_point_id === id
          ? { ...k, ...data }
          : data.is_primary
            ? { ...k, is_primary: false }
            : k,
      ),
    }));
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      for (const doc of [
        form.stem,
        form.answer,
        form.explanation,
        ...form.parts.map((p) => p.rubric),
      ])
        validateMath(doc);
      const check = await api<{
        items: { id: string; similarity: number; summary: string }[];
      }>("/library/questions/duplicates", {
        subject_id: form.subject_id,
        stem: form.stem,
        exclude_id: initial?.id || null,
      });
      setSimilar(check.items);
      if (check.items.length && !ack) {
        setError("存在相似题，请核对下方提示并明确勾选后再保存。");
        return;
      }
      const saved = await api<Question>(
        `/library/questions${initial ? "/" + initial.id : ""}`,
        {
          ...form,
          knowledge_links: form.knowledge_links.map((k) => ({
            ...k,
            part_refs: k.part_refs.filter(Boolean),
          })),
          expected_version: initial?.version || null,
          confirm_similarity: ack,
        },
      );
      navigate(`/questions/${saved.id}?back=${encodeURIComponent(back)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  function editPart(index: number, change: Partial<Part>) {
    setForm((old) => ({
      ...old,
      parts: old.parts.map((p, i) => (i === index ? { ...p, ...change } : p)),
    }));
  }
  const points = c.points.filter(
    (p) =>
      p.subject_id === form.subject_id &&
      (p.name.includes(pointQ) || p.code.includes(pointQ)),
  );
  return (
    <form
      id="question-editor-form"
      className="question-editor-form"
      onSubmit={(e) => void save(e)}
    >
      <div className="library-heading">
        <div>
          <h1>{initial ? "编辑题目" : "新增题目"}</h1>
          <p>保存为草稿；修改已审核题目将重新进入草稿，旧版本永久保留。</p>
        </div>
        <div className="toolbar-actions">
          <Button asChild variant="outline">
            <Link to={back}>返回题库</Link>
          </Button>
          <Button disabled={busy || !form.subject_id}>
            {busy ? "保存中…" : "保存草稿"}
          </Button>
        </div>
      </div>
      <Feedback error={error} />
      <section className="card question-meta-form">
        <label>
          所属学科
          <select
            aria-label="题目所属学科"
            value={form.subject_id}
            disabled={!!initial}
            onChange={(e) =>
              setForm({
                ...form,
                subject_id: e.target.value,
                knowledge_links: [],
                node_ids: [],
              })
            }
          >
            <option value="">请选择学科</option>
            {c.subjects.map((s) => (
              <option key={s.id} value={s.id} disabled={!s.active}>
                {s.name}
                {!s.active ? "（停用）" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          适用年级
          <input
            maxLength={40}
            aria-label="题目适用年级"
            placeholder="例如 九年级"
            value={form.grade}
            onChange={(e) => setForm({ ...form, grade: e.target.value })}
          />
        </label>
        <label>
          题型
          <select
            aria-label="录入题型"
            value={form.question_type}
            onChange={(e) =>
              setForm({ ...form, question_type: e.target.value })
            }
          >
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          难度
          <select
            aria-label="录入难度"
            value={form.difficulty}
            onChange={(e) =>
              setForm({ ...form, difficulty: Number(e.target.value) })
            }
          >
            {[1, 2, 3, 4, 5].map((t) => (
              <option key={t} value={t}>
                {t} · {["", "容易", "较易", "中等", "较难", "困难"][t]}
              </option>
            ))}
          </select>
        </label>
        <label className="full-row">
          来源（可选）
          <input
            maxLength={1000}
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
          />
        </label>
      </section>
      <p className="form-help">
        单选、多选题可用题干中的列表填写选项。使用“公式 / 化学式”录入 LaTeX 或
        mhchem，支持上下标、反应箭头和电荷；图片须上传本机业务目录，禁止粘贴外部链接。
      </p>
      <RichEditor
        label="题干"
        value={form.stem}
        onChange={(v) => updateDoc("stem", v)}
      />
      <RichEditor
        label="标准答案"
        value={form.answer}
        onChange={(v) => updateDoc("answer", v)}
      />
      <RichEditor
        label="解析"
        value={form.explanation}
        onChange={(v) => updateDoc("explanation", v)}
      />
      <section className="card question-associations">
        <h2>知识点关联</h2>
        <input
          aria-label="录题搜索知识点"
          placeholder="搜索知识点名称或编码"
          value={pointQ}
          onChange={(e) => setPointQ(e.target.value)}
        />
        <div className="reference-picker">
          {points.map((p) => (
            <label key={p.id}>
              <input
                type="checkbox"
                checked={form.knowledge_links.some(
                  (k) => k.knowledge_point_id === p.id,
                )}
                disabled={
                  !p.active &&
                  !form.knowledge_links.some(
                    (k) => k.knowledge_point_id === p.id,
                  )
                }
                onChange={() => togglePoint(p.id)}
              />
              <span>
                {p.code} · {p.name}
                {!p.active ? "（停用）" : ""}
              </span>
            </label>
          ))}
        </div>
        <div className="question-link-details">
          {form.knowledge_links.map((k) => (
            <div key={k.knowledge_point_id}>
              <strong>
                {c.points.find((p) => p.id === k.knowledge_point_id)?.name}
              </strong>
              <label>
                <input
                  type="radio"
                  name="primary-point"
                  checked={!!k.is_primary}
                  onChange={() =>
                    changeLink(k.knowledge_point_id, { is_primary: true })
                  }
                />
                主要知识点
              </label>
              <label>
                考查权重
                <input
                  type="number"
                  min="0.01"
                  max="1"
                  step="0.01"
                  placeholder="可选 0–1"
                  value={k.weight ?? ""}
                  onChange={(e) =>
                    changeLink(k.knowledge_point_id, {
                      weight: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>
              <label>
                涉及小问编码
                <input
                  placeholder="可选，以逗号分隔"
                  value={k.part_refs.join(",")}
                  onChange={(e) =>
                    changeLink(k.knowledge_point_id, {
                      part_refs: e.target.value.split(",").map((s) => s.trim()),
                    })
                  }
                />
              </label>
            </div>
          ))}
        </div>
        <p className="form-help">
          权重为可选的 0–1
          数值；小问编码须先在下方扩展信息建立。本阶段不据此计算学情或成绩。
        </p>
        <Link
          to={`/questions/knowledge?subject=${form.subject_id}`}
          target="_blank"
        >
          管理知识点主库
        </Link>
      </section>
      <section className="card question-associations">
        <h2>教材章节引用</h2>
        <input
          aria-label="录题搜索教材章节"
          placeholder="搜索章节路径"
          value={chapterQ}
          onChange={(e) => setChapterQ(e.target.value)}
        />
        <div className="reference-picker">
          {c.nodes
            .filter(
              (n) =>
                nodeSubject(c, n.id) === form.subject_id &&
                nodePath(c, n.id).includes(chapterQ),
            )
            .map((n) => (
              <label key={n.id}>
                <input
                  type="checkbox"
                  checked={form.node_ids.includes(n.id)}
                  disabled={!n.active && !form.node_ids.includes(n.id)}
                  onChange={() =>
                    setForm({
                      ...form,
                      node_ids: form.node_ids.includes(n.id)
                        ? form.node_ids.filter((x) => x !== n.id)
                        : [...form.node_ids, n.id],
                    })
                  }
                />
                <span>
                  {bookLabel(c, n.book_id)}
                  <small>
                    {nodePath(c, n.id)}
                    {!n.active ? "（停用）" : ""}
                  </small>
                </span>
              </label>
            ))}
        </div>
        <p className="form-help">
          同一道题可跨版本、跨章节引用，只保存关系，不复制题目实体。知识点关联不会因章节改名或排序而丢失。
        </p>
      </section>
      <details className="card question-parts">
        <summary>小问 / 评分依据扩展（可选）</summary>
        <p className="form-help">
          预留稳定小问编码、满分及评分依据，供后续试卷快照、部分得分与逐题归因使用。本阶段不录入考试成绩。
        </p>
        {form.parts.map((p, index) => (
          <div key={index} className="part-editor">
            <div className="inline-fields">
              <label>
                小问编码
                <input
                  required
                  maxLength={40}
                  value={p.ref}
                  onChange={(e) => editPart(index, { ref: e.target.value })}
                />
              </label>
              <label>
                预留满分
                <input
                  type="number"
                  min="0.1"
                  max="1000"
                  step="0.1"
                  value={p.max_score ?? ""}
                  onChange={(e) =>
                    editPart(index, {
                      max_score: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>
              <Button
                variant="outline"
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    parts: form.parts.filter((_, i) => i !== index),
                  })
                }
              >
                移除此小问
              </Button>
            </div>
            <RichEditor
              label={`小问${index + 1}评分依据`}
              value={p.rubric}
              onChange={(rubric) => editPart(index, { rubric })}
            />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={form.parts.length >= 20}
          onClick={() =>
            setForm({
              ...form,
              parts: [
                ...form.parts,
                {
                  ref: String(form.parts.length + 1),
                  max_score: null,
                  rubric: emptyDoc(),
                },
              ],
            })
          }
        >
          新增小问扩展
        </Button>
      </details>
      {similar.length > 0 && (
        <section className="card similarity-panel">
          <h2>相似题提示</h2>
          <p>仅按标准化题干文本初筛，不代表内容等价，不会自动合并。</p>
          {similar.map((s) => (
            <div key={s.id}>
              <Link to={`/questions/${s.id}`} target="_blank" rel="noreferrer">
                {Math.round(s.similarity * 100)}% · {s.summary}
              </Link>
            </div>
          ))}
          <label className="check-label">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            已核对相似题，仍保存为独立题目
          </label>
        </section>
      )}
      <div className="question-save-bottom">
        <Button disabled={busy || !form.subject_id}>保存草稿</Button>
        <span>尚未通过审核的题目不会标记为正式可用。</span>
      </div>
    </form>
  );
}
export default function QuestionEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { catalog, loading, error } = useCatalog();
  const [question, setQuestion] = useState<Question | null>(null),
    [questionError, setError] = useState("");
  const back = params.get("back")?.startsWith("/questions")
    ? params.get("back")!
    : "/questions";
  useEffect(() => {
    let active = true;
    if (id)
      api<Question>(`/library/questions/${id}`)
        .then((q) => {
          if (active) setQuestion(q);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [id]);
  if (loading || (id && !question && !questionError))
    return <p className="loading-state">读取题目编辑器…</p>;
  if (error || questionError)
    return <Feedback error={error || questionError} />;
  if (!catalog.subjects.length)
    return (
      <section className="card first-class">
        <h2>请先建立学科</h2>
        <Button asChild>
          <Link to="/questions/catalog">前往教材目录管理</Link>
        </Button>
      </section>
    );
  return (
    <EditorForm
      catalog={catalog}
      initial={question || undefined}
      subjectId={params.get("subject") || undefined}
      nodeId={params.get("node") || undefined}
      back={back}
    />
  );
}
