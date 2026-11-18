import { useEffect, useState, useCallback } from "react";
import { NavLink, useLocation, Link } from "react-router-dom";
import { api } from "../api";
import { Feedback } from "../components/Drawer";
import Drawer from "../components/Drawer";
import type { Overview, Point } from "../features/chemistry/types";
import { statusNames } from "../features/chemistry/types";
import Network, { PointDetails } from "../features/chemistry/Network";
import GraphQuestions, { GraphQuestion } from "../features/chemistry/Questions";
import Practice from "../features/chemistry/Practice";
import DataManager from "../features/chemistry/DataManager";
const tabs = [
  ["", "知识图谱"],
  ["points", "知识点列表"],
  ["questions", "诊断题库"],
  ["practice", "知识诊断"],
  ["data", "数据管理"],
];
export default function ChemistryWorkspace() {
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState(""),
    [point, setPoint] = useState<Point | null>(null),
    [query, setQuery] = useState("");
  const location = useLocation(),
    part = location.pathname.split("/")[2] || "",
    identity = location.pathname.split("/")[3] || "";
  const reload = useCallback(() => {
    api<Overview>("/chemistry-graph/overview")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(reload, [reload]);
  return (
    <div className="cg-workspace">
      <header className="cg-heading">
        <h1>初中化学知识图谱</h1>
        <div className="cg-metrics">
          <span>
            <strong>{data?.points.length || 0}</strong>知识点
          </span>
          <span>
            <strong>{data?.question_total || 0}</strong>诊断题
          </span>
          <span>
            <strong>{data?.approved_questions || 0}</strong>已审核题
          </span>
        </div>
      </header>
      <nav className="cg-tabs" aria-label="化学空间内部导航">
        {tabs.map(([path, label]) => (
          <NavLink
            key={path}
            end={path === ""}
            to={"/chemistry-graph" + (path ? "/" + path : "")}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Feedback error={error} />
      {data ? (
        <>
          {!data.points.length ? (
            <section className="card cg-card">
              <h2>独立空间尚未导入资源</h2>
              <p>不会自动写入原教材题库。</p>
              <Link to="/chemistry-graph/data">前往数据管理</Link>
              {part === "data" && (
                <DataManager
                  data={data}
                  onChanged={reload}
                  onError={setError}
                />
              )}
            </section>
          ) : part === "points" ? (
            <>
              <div className="knowledge-tools">
                <input
                  aria-label="搜索独立知识点"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="名称或来源ID"
                />
              </div>
              <section className="card cg-card">
                {data.points
                  .filter(
                    (p) =>
                      p.name.includes(query) || p.external_id.includes(query),
                  )
                  .map((p) => (
                    <button
                      className="cg-question-row"
                      key={p.id}
                      onClick={() => setPoint(p)}
                    >
                      <strong>{p.name}</strong>
                      <small>
                        {p.external_id} · {statusNames[p.status]} ·{" "}
                        {p.question_count}题
                      </small>
                    </button>
                  ))}
              </section>
              {point && (
                <Drawer title={point.name} onClose={() => setPoint(null)}>
                  <PointDetails point={point} data={data} />
                </Drawer>
              )}
            </>
          ) : part === "questions" ? (
            identity ? (
              <GraphQuestion
                identity={identity}
                onChanged={reload}
                onError={setError}
              />
            ) : (
              <GraphQuestions data={data} onError={setError} />
            )
          ) : part === "practice" ? (
            <Practice data={data} onError={setError} />
          ) : part === "data" ? (
            <DataManager data={data} onChanged={reload} onError={setError} />
          ) : (
            <Network data={data} onError={setError} />
          )}
        </>
      ) : (
        <p>正在读取独立图谱空间…</p>
      )}
    </div>
  );
}
