import { Plus, Files } from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge, PageTitle, Notice, Empty, later } from "../components/common";
export default function Papers() {
  return (
    <>
      <PageTitle
        eyebrow="PAPER LIBRARY / 试卷资源"
        title="试卷库"
        description="把教学思路，整理成一份份有针对性的练习。"
      >
        <Button disabled title={later}>
          <Plus size={16} />
          新建试卷
        </Button>
      </PageTitle>
      <Notice />
      <section className="card">
        <div className="section-heading">
          <h2>
            <Files size={18} />
            我的试卷
          </h2>
          <Badge>功能筹备中</Badge>
        </div>
        <Empty icon={<Files size={32} />} title="为下一次课堂，留好准备的空间">
          后续可创建、整理与管理试卷。
          <br />
          真实组卷、导出与考试关联将在后续阶段实现。
        </Empty>
      </section>
    </>
  );
}
