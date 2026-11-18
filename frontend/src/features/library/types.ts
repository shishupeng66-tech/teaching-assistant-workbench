import type { JSONContent } from "@tiptap/core";
export type Doc = JSONContent;
export const emptyDoc = (): Doc => ({
  type: "doc",
  content: [{ type: "paragraph", content: [] }],
});
export const types = [
  "单选题",
  "多选题",
  "判断题",
  "填空题",
  "简答题",
  "计算题",
  "实验题",
  "综合题",
];
export const statuses: Record<string, string> = {
  draft: "草稿",
  pending: "待审核",
  approved: "已审核",
  archived: "已归档",
};
export type Subject = {
  id: string;
  name: string;
  code: string;
  active: number;
};
export type Edition = {
  id: string;
  subject_id: string;
  name: string;
  description: string;
  active: number;
};
export type Book = {
  id: string;
  edition_id: string;
  grade: string;
  volume: string;
  active: number;
};
export type Chapter = {
  id: string;
  book_id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  position: number;
  description: string;
  active: number;
};
export type Point = {
  review_status?: string;
  teaching_requirements?: string;
  mastery_criteria?: string[];
  difficulty_min?: number;
  difficulty_max?: number;
  content_source?: string;
  profile_version?: number;
  content_reviews?: { action: string; note: string; created_at: string }[];
  id: string;
  subject_id: string;
  parent_id: string | null;
  name: string;
  code: string;
  description: string;
  active: number;
};
export type KnowledgeLink = {
  knowledge_point_id: string;
  is_primary: boolean | number;
  weight: number | null;
  part_refs: string[];
};
export type Part = { ref: string; max_score: number | null; rubric: Doc };
export type Question = {
  id: string;
  subject_id: string;
  grade: string;
  question_type: string;
  difficulty: number;
  stem: Doc;
  answer: Doc;
  explanation: Doc;
  source: string;
  source_kind: string;
  status: string;
  version: number;
  knowledge_links: KnowledgeLink[];
  node_ids: string[];
  parts: Part[];
  created_at: string;
  updated_at: string;
};
export type QuestionDetail = Question & {
  revisions: {
    id: string;
    version: number;
    snapshot: Question;
    reason: string;
    created_at: string;
  }[];
  reviews: {
    id: string;
    version: number;
    action: string;
    before_status: string;
    after_status: string;
    note: string;
    created_at: string;
  }[];
  chapter_references: { id: string; path: string; book_id: string }[];
};
export type Catalog = {
  candidates?: {
    point_id: string | null;
    question_id: string | null;
    node_id: string;
    status: string;
    reason: string;
  }[];
  subjects: Subject[];
  editions: Edition[];
  books: Book[];
  nodes: Chapter[];
  points: Point[];
  relations: { source_id: string; target_id: string; kind: string }[];
  mappings: { node_id: string; knowledge_point_id: string }[];
};
export const emptyCatalog: Catalog = {
  subjects: [],
  editions: [],
  books: [],
  nodes: [],
  points: [],
  relations: [],
  mappings: [],
};
export type QuestionRow = {
  stem: Doc;
  answer: Doc;
  explanation: Doc;
  id: string;
  subject_id: string;
  grade: string;
  question_type: string;
  difficulty: number;
  status: string;
  version: number;
  summary: string;
  updated_at: string;
  knowledge_links: KnowledgeLink[];
};
export type QuestionPage = {
  items: QuestionRow[];
  total: number;
  page: number;
  page_size: number;
};
export type Stats = {
  total: number;
  approved: number;
  statuses: Record<string, number>;
  types: Record<string, number>;
  difficulties: Record<string, number>;
  subjects: Record<string, number>;
  knowledge_total: number;
  knowledge_approved: number;
  knowledge_pending: number;
  knowledge_covered: number;
  unmapped_questions: number;
};
export function nodePath(c: Catalog, id: string): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let node = c.nodes.find((n) => n.id === id);
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    names.unshift(node.name);
    node = c.nodes.find((n) => n.id === node?.parent_id);
  }
  return names.join(" / ");
}
export function bookLabel(c: Catalog, id: string): string {
  const book = c.books.find((b) => b.id === id);
  return book
    ? `${c.editions.find((e) => e.id === book.edition_id)?.name || ""} · ${book.grade} ${book.volume}`
    : "";
}
export function nodeSubject(c: Catalog, id: string): string | undefined {
  const n = c.nodes.find((n) => n.id === id);
  const b = c.books.find((b) => b.id === n?.book_id);
  return c.editions.find((e) => e.id === b?.edition_id)?.subject_id;
}
export function docText(doc: Doc): string {
  if (doc.type === "text") return doc.text || "";
  if (doc.type === "math") return doc.attrs?.latex || "";
  if (doc.type === "asset") return "[图片]";
  return (doc.content || []).map(docText).join(doc.type === "doc" ? "\n" : "");
}
