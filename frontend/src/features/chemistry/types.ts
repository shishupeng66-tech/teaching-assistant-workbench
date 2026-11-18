import type { Doc } from "../library/types";
export const base = "/api/chemistry-graph/assets";
export const statusNames: Record<string, string> = {
  pending: "待审核",
  approved: "已审核",
  rejected: "已拒绝",
  draft: "草稿",
};
export type Point = {
  id: string;
  external_id: string;
  name: string;
  description: string;
  mastery: string[];
  status: string;
  question_count: number;
  source: Record<string, unknown>;
};
export type Edge = {
  id: string;
  topic_id: string;
  prerequisite_id: string;
  strength: "hard" | "soft";
  reason: string;
  status: string;
};
export type Overview = {
  points: Point[];
  edges: Edge[];
  question_total: number;
  approved_questions: number;
  approved_points: number;
  assets: number;
};
export type Question = {
  id: string;
  external_id: string;
  point_id: string;
  stem: Doc;
  answer: Doc;
  explanation: Doc;
  difficulty: number;
  status: string;
  version: number;
  grading_manual?: boolean;
  raw: Record<string, unknown>;
  history: {
    id: string;
    version: number;
    action: string;
    snapshot: Record<string, unknown>;
  }[];
};
export type QuestionPage = {
  total: number;
  page: number;
  page_size: number;
  items: {
    id: string;
    external_id: string;
    point_id: string;
    status: string;
    version: number;
    difficulty: number;
    summary: string;
  }[];
};
export type Browse = {
  positions?: Record<string, { x: number; y: number }>;
  selected?: string;
  mode?: "global" | "local";
  viewport?: { x: number; y: number; zoom: number };
};
export type Practice = {
  id: string;
  target: string;
  limit: number;
  finished: boolean;
  notice: string;
  outcomes: Record<string, string>;
  answers: {
    point_id: string;
    question_id: string;
    external_id: string;
    question_version: number;
    stem: Doc;
    reference: Doc;
    explanation: Doc;
    text: string;
    correct: boolean;
    mode: string;
  }[];
  current: null | {
    question_id: string;
    external_id: string;
    point_id: string;
    stem: Doc;
    choices: { key: string; text: string }[];
    type: string;
    manual_only: boolean;
    reference?: Doc;
    explanation?: Doc;
  };
};
