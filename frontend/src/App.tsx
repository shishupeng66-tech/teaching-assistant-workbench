import { useEffect, useState, lazy, Suspense } from "react";
import {
  NavLink,
  Routes,
  Route,
  useLocation,
  Link,
  Navigate,
} from "react-router-dom";
import {
  BookOpen,
  UsersRound,
  LibraryBig,
  Files,
  Sparkles,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  ShieldCheck,
  Search,
  Network,
  FlaskConical,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Empty } from "./components/common";
import { api } from "./api";
import Classes from "./pages/Classes";
import StudentDetail from "./pages/StudentDetail";
import Questions from "./pages/Questions";
const ContentReview = lazy(() => import("./pages/ContentReview"));
const ChemistryLab = lazy(() => import("./pages/ChemistryLab"));
import { t as labText } from "./features/chemistry-lab/i18n";
const CatalogManager = lazy(() => import("./pages/CatalogManager"));
const ChemistryWorkspace = lazy(() => import("./pages/ChemistryWorkspace"));
const KnowledgeManager = lazy(() => import("./pages/KnowledgeManager"));
const QuestionEditor = lazy(() => import("./pages/QuestionEditor"));
const QuestionDetail = lazy(() => import("./pages/QuestionDetail"));
import Papers from "./pages/Papers";
import AIPage from "./pages/AIPage";
import SystemSettingsPage from "./pages/SystemSettingsPage";
const navigation = [
  { to: "/", name: "班级管理", icon: UsersRound },
  { to: "/questions", name: "题库", icon: LibraryBig },
  { to: "/papers", name: "试卷库", icon: Files },
  { to: "/ai", name: "AI 辅助", icon: Sparkles },
  { to: "/chemistry-graph", name: "化学知识图谱", icon: Network },
  { to: "/chemistry-lab", name: labText("workspace"), icon: FlaskConical },
];
function NotFound() {
  return (
    <section className="card">
      <Empty icon={<Search size={32} />} title="没有找到这个页面">
        请使用左侧导航返回工作台。
      </Empty>
      <div className="return-home">
        <Button asChild>
          <Link to="/">返回班级管理</Link>
        </Button>
      </div>
    </section>
  );
}
export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem("taw-theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const [connected, setConnected] = useState(false);
  const location = useLocation();
  const name =
    (location.pathname.startsWith("/chemistry-lab")
      ? labText("workspace")
      : location.pathname.startsWith("/chemistry-graph")
        ? "化学知识图谱"
        : location.pathname.startsWith("/questions")
          ? "题库"
          : navigation.find((n) => n.to === location.pathname)?.name) ||
    (location.pathname === "/settings"
      ? "系统设置"
      : location.pathname.startsWith("/students/")
        ? "学生详情"
        : "页面未找到");
  function setTheme(value: string) {
    setThemeState(value);
    try {
      localStorage.setItem("taw-theme", value);
    } catch {
      /* Browser storage can be disabled. */
    }
  }
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.title = `${name} · 教学辅助工作台`;
  }, [name]);
  useEffect(() => {
    let active = true;
    const check = () =>
      api<{ status: string }>("/health")
        .then((r) => {
          if (active) setConnected(r.status === "ok");
        })
        .catch(() => {
          if (active) setConnected(false);
        });
    void check();
    const timer = setInterval(check, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <div className={`app ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="sidebar">
        <Link to="/" className="brand" aria-label="教学辅助工作台首页">
          <span className="brand-icon">
            <BookOpen size={23} />
          </span>
          <div>
            <strong>教学辅助工作台</strong>
            <small>TEACHER WORKSPACE</small>
          </div>
        </Link>
        <div className="nav-label">教学工作空间</div>
        <nav aria-label="业务导航">
          {navigation.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              title={n.name}
              className={({ isActive }) =>
                `nav-item ${isActive || (n.to === "/" && location.pathname.startsWith("/students/")) ? "active" : ""}`
              }
            >
              <n.icon size={20} />
              <span>{n.name}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <ShieldCheck size={19} />
            <div>
              <strong>本地工作空间</strong>
              <small>数据保存在你的电脑</small>
            </div>
          </div>
          <NavLink
            to="/settings"
            title="系统设置"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Settings2 size={19} />
            <span>系统设置</span>
          </NavLink>
          <div className="sidebar-version">
            <span>班级管理</span>
            <span>v0.3.0</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <Button
              variant="ghost"
              size="icon"
              aria-label={collapsed ? "展开导航" : "折叠导航"}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? (
                <PanelLeftOpen size={19} />
              ) : (
                <PanelLeftClose size={19} />
              )}
            </Button>
            <span className="crumb-root">工作台</span>
            <span className="crumb-slash">/</span>
            <strong>{name}</strong>
          </div>
          <div className="topbar-right">
            <span className={`connection ${connected ? "online" : ""}`}>
              {connected ? "本地服务已连接" : "本地服务未连接"}
            </span>
            <span className="top-divider" />
            <Button
              variant="ghost"
              size="icon"
              aria-label={
                theme === "light" ? "切换为深色模式" : "切换为浅色模式"
              }
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </Button>
            <span className="teacher-avatar" title="教师本机工作台">
              师
            </span>
          </div>
        </header>
        <main>
          <Suspense fallback={<p className="loading-state">正在加载页面…</p>}>
            <Routes>
              <Route
                path="/chemistry-graph/*"
                element={<ChemistryWorkspace />}
              />
              <Route
                path="/questions/graph"
                element={<Navigate to="/chemistry-graph" replace />}
              />
              <Route path="/chemistry-lab" element={<ChemistryLab />} />
              <Route path="/chemistry-lab/:id" element={<ChemistryLab />} />
              <Route path="/" element={<Classes />} />
              <Route path="/students/:id" element={<StudentDetail />} />
              <Route path="/questions" element={<Questions />} />
              <Route path="/questions/review" element={<ContentReview />} />
              <Route path="/questions/catalog" element={<CatalogManager />} />
              <Route
                path="/questions/knowledge"
                element={<KnowledgeManager />}
              />
              <Route path="/questions/new" element={<QuestionEditor />} />
              <Route path="/questions/:id/edit" element={<QuestionEditor />} />
              <Route path="/questions/:id" element={<QuestionDetail />} />
              <Route path="/papers" element={<Papers />} />
              <Route path="/ai" element={<AIPage />} />
              <Route
                path="/settings"
                element={
                  <SystemSettingsPage theme={theme} setTheme={setTheme} />
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <footer className="page-footer">
            <span>教学辅助工作台</span>
            <span>专注教学 · 从容有序</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
