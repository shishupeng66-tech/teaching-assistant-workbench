export type Classroom = {
  id: string;
  name: string;
  school_year: string;
  grade: string;
  class_number: string;
  archived: number;
  student_count?: number;
};
export type Student = {
  id: string;
  name: string;
  student_no: string | null;
  gender: string | null;
  entry_year: number | null;
  notes: string;
  status: "active" | "archived";
  current_class: Classroom | null;
  seat: Assignment | null;
};
export type Assignment = {
  class_id?: string;
  row: number;
  column: number;
  student_id: string;
};
export type Layout = {
  class_id: string;
  rows: number;
  columns: number;
  version: number;
  assignments: Assignment[];
};
export type Enrollment = {
  class_archived: boolean;
  id: string;
  class_id: string;
  class_name: string;
  school_year: string;
  grade: string;
  class_number: string;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
};
export type Operation = {
  id: string;
  at: string;
  action: string;
  actor: string;
  before_json: string | null;
  after_json: string | null;
};
export type StudentDetail = Student & {
  history: Enrollment[];
  operations: Operation[];
};
export const operationNames: Record<string, string> = {
  "student.create": "创建学生",
  "student.update": "编辑学生",
  "student.transfer": "转班",
  "student.progression": "班级学年信息调整",
  "student.archive": "归档学生",
  "seat.change": "调整座位",
  "seat.release": "释放座位",
  "class.create": "创建班级",
  "class.update": "编辑班级",
  "class.archive": "归档班级",
  "layout.save": "保存教室布局",
  "student.import": "批量导入学生",
};
