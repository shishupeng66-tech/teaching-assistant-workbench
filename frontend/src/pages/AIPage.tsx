import {
  UsersRound,
  GraduationCap,
  Files,
  Sparkles,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge, PageTitle, Notice, later } from "../components/common";
export default function AIPage() {
  const blocks = [
    {
      icon: UsersRound,
      title: "班级学情分析",
      desc: "从班级整体出发，发现共性知识薄弱点。",
      tags: ["班级知识点掌握", "教学建议"],
    },
    {
      icon: GraduationCap,
      title: "学生个人学情分析",
      desc: "关注每一位学生，理解个体学习差异。",
      tags: ["知识点画像", "针对性建议"],
    },
    {
      icon: Files,
      title: "个性化试卷",
      desc: "依据真实学情，为不同需求准备练习。",
      tags: ["薄弱点练习", "个性化组卷"],
    },
  ];
  return (
    <>
      <PageTitle
        eyebrow="AI ASSISTANT / 教学伙伴"
        title="AI 辅助"
        description="让真实的学习数据，成为教学决策的参考。"
      >
        <Badge>尚未接入 AI</Badge>
      </PageTitle>
      <Notice />
      <div className="ai-intro">
        <div className="ai-mark">
          <Sparkles size={26} />
        </div>
        <div>
          <h2>教学洞察，从真实记录开始</h2>
          <p>未来将结合考试成绩与逐题作答记录，辅助分析知识点掌握情况。</p>
        </div>
        <span className="ai-label">规划预览</span>
      </div>
      <div className="ai-grid">
        {blocks.map((b) => (
          <section className="card ai-card" key={b.title}>
            <div className="feature-icon">
              <b.icon size={23} />
            </div>
            <h2>{b.title}</h2>
            <p>{b.desc}</p>
            <div className="feature-tags">
              {b.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <div className="ai-preview">
              <span />
              <span />
              <span />
            </div>
            <Button variant="outline" disabled title={later}>
              后续阶段开放
              <ArrowUpRight size={15} />
            </Button>
          </section>
        ))}
      </div>
      <div className="bottom-note">
        <ShieldCheck size={16} />
        当前未连接任何 AI 服务，不提供模拟的正式学情结论。
      </div>
    </>
  );
}
