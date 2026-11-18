import { useState, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  MarkerType,
  Position,
  useNodesState,
} from "@xyflow/react";
import type { Node, Edge as FlowEdge, ReactFlowInstance } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "../../components/ui/button";
import Drawer from "../../components/Drawer";
import { Link } from "react-router-dom";
import { api } from "../../api";
import type { Overview, Browse, Point } from "./types";
import { statusNames } from "./types";

export function PointDetails({
  point,
  data,
}: {
  point: Point;
  data: Overview;
}) {
  const edges = data.edges.filter(
    (e) => e.topic_id === point.id || e.prerequisite_id === point.id,
  );
  return (
    <>
      <p>
        {point.external_id} · {statusNames[point.status]}
      </p>
      <p>{point.description}</p>
      <h3>掌握标准（来源建议）</h3>
      <ul>
        {point.mastery.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
      <h3>前置与后续</h3>
      {edges.map((e) => (
        <p key={e.id}>
          {e.topic_id === point.id ? "前置：" : "后续："}
          {
            data.points.find(
              (p) =>
                p.id ===
                (e.topic_id === point.id ? e.prerequisite_id : e.topic_id),
            )?.name
          }{" "}
          · {e.strength === "hard" ? "强前置" : "弱前置"} ·{" "}
          {statusNames[e.status]}
          <small className="cg-muted cg-block">{e.reason}</small>
        </p>
      ))}
      <Button asChild>
        <Link to={`/chemistry-graph/questions?point=${point.id}`}>
          查看{point.question_count}道诊断题
        </Link>
      </Button>
      <p className="cg-muted">
        来源：cn-math-taxonomy，CC BY-NC
        4.0。知识关系为来源建议，审核请前往数据管理。
      </p>
    </>
  );
}
export default function Network({
  data,
  onError,
}: {
  data: Overview;
  onError: (s: string) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]),
    [mode, setMode] = useState<"global" | "local">("global"),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [drawer, setDrawer] = useState(false),
    [ready, setReady] = useState(false);
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const saved = useRef<Browse>({});
  const initialViewApplied = useRef(false);
  const positions = useRef<Record<string, { x: number; y: number }>>({});
  const current = data.points.find((p) => p.id === selected);
  useEffect(() => {
    api<Browse>("/chemistry-graph/view")
      .then((v) => {
        saved.current = v;
        positions.current = v.positions || {};
        setMode(v.mode || "global");
        setSelected(v.selected || "");
        setReady(true);
      })
      .catch((e) => onError(e.message));
  }, [onError]);
  const visible = useMemo(() => {
    if (mode === "global" || !selected)
      return new Set(data.points.map((p) => p.id));
    const ids = new Set([selected]);
    for (const e of data.edges)
      if (e.topic_id === selected || e.prerequisite_id === selected) {
        ids.add(e.topic_id);
        ids.add(e.prerequisite_id);
      }
    return ids;
  }, [data, mode, selected]);
  useEffect(() => {
    if (!ready) return;
    const levels = new Map<string, number>();
    function level(id: string, seen = new Set<string>()): number {
      if (levels.has(id)) return levels.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      const pre = data.edges.filter(
        (e) => e.topic_id === id && e.strength === "hard",
      );
      const l = pre.length
        ? Math.max(...pre.map((e) => level(e.prerequisite_id, new Set(seen)))) +
          1
        : 0;
      levels.set(id, l);
      return l;
    }
    const rows: Record<number, number> = {};
    setNodes(
      data.points
        .filter((p) => visible.has(p.id))
        .map((p) => {
          const l = level(p.id),
            r = rows[l] || 0;
          rows[l] = r + 1;
          return {
            id: p.id,
            position: positions.current[p.id] || { x: l * 285, y: r * 140 },
            data: {
              label: (
                <>
                  <strong>{p.name}</strong>
                  <small>
                    {p.external_id} · {p.question_count}题
                  </small>
                </>
              ),
            },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            selected: p.id === selected,
            style: { width: 230 },
            deletable: false,
          };
        }),
    );
  }, [data, visible, selected, ready, setNodes]);
  useEffect(() => {
    if (flow && nodes.length) {
      if (!initialViewApplied.current && saved.current.viewport)
        void flow.setViewport(saved.current.viewport);
      else void flow.fitView({ padding: 0.15, minZoom: 0.03, maxZoom: 1 });
      initialViewApplied.current = true;
    }
  }, [flow, nodes.length, mode]);
  const edges: FlowEdge[] = data.edges
    .filter((e) => visible.has(e.topic_id) && visible.has(e.prerequisite_id))
    .map((e) => ({
      id: e.id,
      source: e.prerequisite_id,
      target: e.topic_id,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: e.strength === "hard" ? "#2563eb" : "#8896aa",
      },
      style: {
        stroke: e.strength === "hard" ? "#2563eb" : "#8896aa",
        strokeWidth: e.strength === "hard" ? 2 : 1.5,
        strokeDasharray: e.strength === "soft" ? "7 5" : undefined,
      },
      label: e.strength === "hard" ? "强" : "弱",
      deletable: false,
      focusable: true,
    }));
  async function persist(override: Partial<Browse> = {}) {
    if (!ready) return;
    try {
      await api("/chemistry-graph/view", {
        positions: positions.current,
        selected,
        mode,
        viewport: flow?.getViewport(),
        ...override,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "保存浏览状态失败");
    }
  }
  const matches = data.points.filter(
    (p) => p.name.includes(query) || p.external_id.includes(query),
  );
  return (
    <>
      <div className="cg-canvas-tools">
        <input
          aria-label="搜索定位知识点"
          placeholder="名称或来源编号"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="定位图谱节点"
          value={selected}
          onChange={(e) => {
            const id = e.target.value;
            setSelected(id);
            setDrawer(true);
            void persist({ selected: id });
            setTimeout(
              () =>
                void flow?.fitView({
                  nodes: [{ id }],
                  maxZoom: 1.2,
                  padding: 0.4,
                }),
              0,
            );
          }}
        >
          <option value="">选择节点定位</option>
          {matches.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（{p.external_id}）
            </option>
          ))}
        </select>
        <Button
          variant={mode === "global" ? "default" : "outline"}
          onClick={() => {
            setMode("global");
            void persist({ mode: "global" });
          }}
        >
          全局图谱
        </Button>
        <Button
          variant={mode === "local" ? "default" : "outline"}
          disabled={!selected}
          onClick={() => {
            setMode("local");
            void persist({ mode: "local" });
          }}
        >
          局部关系
        </Button>
        <Button variant="outline" onClick={() => void flow?.zoomIn()}>
          放大
        </Button>
        <Button variant="outline" onClick={() => void flow?.zoomOut()}>
          缩小
        </Button>
        <Button
          variant="outline"
          onClick={() => void flow?.fitView({ padding: 0.15, minZoom: 0.03 })}
        >
          适应画布
        </Button>
      </div>
      <div className="cg-legend">
        <span>实线：强前置</span>
        <span>虚线：弱前置</span>
        <span>箭头：前置 → 后续</span>
        <span>
          {nodes.length}节点 · {edges.length}连线
        </span>
      </div>
      <div className="cg-network" aria-label="二维化学知识图谱">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onInit={(f) => {
            setFlow(f);
            if (saved.current.viewport)
              void f.setViewport(saved.current.viewport);
          }}
          onNodeClick={(_, node) => {
            setSelected(node.id);
            setDrawer(true);
            void persist({ selected: node.id });
          }}
          onNodeDragStop={(_, node) => {
            positions.current[node.id] = node.position;
            void persist();
          }}
          onMoveEnd={() => void persist()}
          nodesConnectable={false}
          deleteKeyCode={null}
          minZoom={0.03}
          maxZoom={2.5}
          fitView
        >
          <Background />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
      <p className="cg-muted">
        拖动空白区域平移，滚轮缩放，拖动节点调整布局。浏览位置保存在独立空间。
      </p>
      {drawer && current && (
        <Drawer title={current.name} onClose={() => setDrawer(false)}>
          <PointDetails point={current} data={data} />
        </Drawer>
      )}
    </>
  );
}
