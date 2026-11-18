import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
export const later = "后续阶段开发";
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function PageTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function Notice() {
  return (
    <div className="notice">
      <CircleHelp size={16} />
      <span>此模块暂为界面预览，业务功能将在后续阶段开放。</span>
      <Badge>基础框架</Badge>
    </div>
  );
}
export function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
      <Badge>{later}</Badge>
    </div>
  );
}
