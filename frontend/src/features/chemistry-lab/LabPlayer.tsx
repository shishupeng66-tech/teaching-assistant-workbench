import {
  Component,
  Suspense,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Maximize,
  Minimize,
  RotateCcw,
  Pause,
  Play,
  Settings2,
  ChartNoAxesCombined,
  BookOpen,
} from "lucide-react";
import Scene from "./Scene";
import type { Params } from "./Scene";
import type { Experiment } from "./catalog";
import { defaults } from "./catalog";
import { t } from "./i18n";
import Results from "./Results";
import Chart from "./Chart";
import type { ElementData } from "./scenes/periodic-trends-scene";
class SceneBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="lab-scene-error" role="alert">
        <p>{t("error")}</p>
        <button onClick={this.props.onRetry}>{t("retry")}</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function LabPlayer({
  experiment: e,
}: {
  experiment: Experiment;
}) {
  const root = useRef<HTMLDivElement>(null),
    elapsed = useRef(0),
    last = useRef(0),
    clockLabel = useRef<HTMLOutputElement>(null);
  const [p, setParams] = useState<Params>(() => defaults(e)),
    [playing, setPlaying] = useState(true),
    [speed, setSpeed] = useState(1),
    [epoch, setEpoch] = useState(0),
    [raw, setRaw] = useState<Record<string, unknown>>({}),
    [full, setFull] = useState(false),
    [error, setError] = useState(""),
    [manualDrop, setManualDrop] = useState(0),
    [ready, setReady] = useState(false),
    [controls, setControls] = useState(() => innerWidth >= 900),
    [results, setResults] = useState(() => innerWidth >= 900),
    [guide, setGuide] = useState(false);
  const receive = useCallback(
    (value: object) => setRaw(value as Record<string, unknown>),
    [],
  );
  const select = useCallback(
    (value: ElementData) =>
      setParams((old) => ({ ...old, selectedAtomicNumber: value.number })),
    [],
  );
  const sceneReady = useCallback(() => setReady(true), []);
  useEffect(() => {
    const listener = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", listener);
    return () => document.removeEventListener("fullscreenchange", listener);
  }, []);
  useEffect(() => {
    let frame = 0;
    last.current = performance.now();
    function tick(now: number) {
      if (playing)
        elapsed.current += Math.min((now - last.current) / 1000, 0.05) * speed;
      last.current = now;
      if (clockLabel.current) {
        clockLabel.current.textContent = elapsed.current.toFixed(1) + " s";
        clockLabel.current.dataset.time = elapsed.current.toFixed(2);
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, epoch]);
  useEffect(() => {
    const node = root.current;
    const app = document.getElementById("root");
    const overflow = document.body.style.overflow;
    if (app) app.inert = true;
    document.body.style.overflow = "hidden";
    root.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    return () => {
      if (app) app.inert = false;
      document.body.style.overflow = overflow;
      if (node && document.fullscreenElement === node)
        void document.exitFullscreen().catch(() => {});
    };
  }, []);
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch {
      setError(t("fullscreenError"));
    }
  }
  function reset() {
    setParams(defaults(e));
    setPlaying(true);
    setSpeed(1);
    setRaw({});
    setManualDrop(0);
    elapsed.current = 0;
    setReady(false);
    setEpoch((n) => n + 1);
    setError("");
  }
  function param(key: string, value: string | number | boolean) {
    setParams((old) => {
      const next = { ...old, [key]: value };
      if (e.id === "chemical-bonding" && key === "bondType") next.step = 1;
      if (e.id === "thermochemistry")
        next.activationEnergy = Math.max(
          Number(next.activationEnergy),
          Number(next.energyReleased) + 5,
        );
      return next;
    });
  }
  const clampPH = raw.currentPH as number | undefined;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={e.title}
      className="chem-lab-player"
      ref={root}
      data-experiment={e.id}
      data-playing={playing}
    >
      <header className="lab-player-header">
        <Link
          to="/chemistry-lab"
          className="lab-icon-button"
          aria-label={t("back")}
          title={t("back")}
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <span className="lab-player-brand">{t("subtitle")}</span>
          <h1>{e.title}</h1>
        </div>
        <div className="lab-player-header-actions">
          <button
            className={controls ? "active" : ""}
            aria-label={t(controls ? "hideControls" : "showControls")}
            onClick={() => setControls((v) => !v)}
          >
            <Settings2 size={18} />
          </button>
          <button
            className={results ? "active" : ""}
            aria-label={t(results ? "hideResults" : "showResults")}
            onClick={() => setResults((v) => !v)}
          >
            <ChartNoAxesCombined size={18} />
          </button>
          <button aria-label={t("guide")} onClick={() => setGuide((v) => !v)}>
            <BookOpen size={18} />
          </button>
          <button
            aria-label={t(full ? "exitFullscreen" : "fullscreen")}
            onClick={() => void fullscreen()}
          >
            {full ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </header>
      <div className="lab-stage" aria-label={e.title + " · 3D"}>
        <SceneBoundary key={epoch} onRetry={reset}>
          <Suspense fallback={null}>
            <Scene
              key={epoch}
              id={e.id}
              params={p}
              playing={playing}
              speed={speed}
              camera={e.camera}
              onData={receive}
              onSelect={select}
              manualDrop={manualDrop}
              onReady={sceneReady}
            />
          </Suspense>
        </SceneBoundary>
        {!ready && (
          <div className="lab-loading" role="status">
            {t("loading")}
          </div>
        )}
        <span className="lab-scene-status" data-testid="lab-status">
          {t(playing ? "running" : "paused")} ·{" "}
          {ready ? t("sceneReady") : t("loading")}
        </span>
        <span className="lab-mouse-hint">{t("instructions")}</span>
      </div>
      {controls && (
        <aside className="lab-floating lab-parameters">
          <h2>{t("controls")}</h2>
          {e.controls.map((c) => (
            <label
              className={
                "lab-param " + (c.kind === "check" ? "lab-param-check" : "")
              }
              key={c.key}
            >
              <span>
                {t(c.label)}{" "}
                {c.kind === "range" && (
                  <output>
                    {String(p[c.key])} {c.unit}
                  </output>
                )}
              </span>
              {c.kind === "range" ? (
                <input
                  type="range"
                  aria-label={t(c.label)}
                  min={
                    e.id === "thermochemistry" && c.key === "activationEnergy"
                      ? Number(p.energyReleased) + 5
                      : c.min
                  }
                  max={
                    e.id === "chemical-bonding" &&
                    c.key === "step" &&
                    p.bondType === "metallic"
                      ? 4
                      : c.max
                  }
                  step={c.step}
                  value={Number(p[c.key])}
                  onChange={(event) => param(c.key, Number(event.target.value))}
                />
              ) : c.kind === "select" ? (
                <select
                  aria-label={t(c.label)}
                  value={String(p[c.key])}
                  onChange={(event) => param(c.key, event.target.value)}
                >
                  {c.options?.map(([key, label]) => (
                    <option key={key} value={key}>
                      {t(label)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="checkbox"
                  aria-label={t(c.label)}
                  checked={Boolean(p[c.key])}
                  onChange={(event) => param(c.key, event.target.checked)}
                />
              )}
            </label>
          ))}
          {e.id === "titration" && (
            <button
              className="lab-action"
              disabled={!playing || Number(raw.volumeAdded) >= 50}
              onClick={() => setManualDrop((n) => n + 1)}
            >
              {t("manualDrop")}
            </button>
          )}
          <p className="lab-panel-note">
            {e.id === "electrolysis" ? t("waterOnly") : t("parametersReset")}
          </p>
        </aside>
      )}
      {results && (
        <aside className="lab-floating lab-data">
          <h2>{t("results")}</h2>
          <Results id={e.id} data={raw} p={p} />
          {e.id === "chemical-bonding" &&
            typeof raw.description === "string" && (
              <p className="lab-panel-note">{raw.description}</p>
            )}
          <Chart id={e.id} p={p} data={raw} />
          {e.id === "titration" && (
            <p className="lab-panel-note">
              {Number(raw.volumeAdded) >= 50
                ? t("droppedOut")
                : clampPH !== undefined
                  ? `${t("currentPH")} ${clampPH.toFixed(2)}`
                  : t("resultsEmpty")}
            </p>
          )}
          <details>
            <summary>{t("source")}</summary>
            <p>{e.limits}</p>
          </details>
        </aside>
      )}
      {guide && (
        <section className="lab-guide lab-floating">
          <button
            className="lab-guide-close"
            aria-label={t("guide")}
            onClick={() => setGuide(false)}
          >
            ×
          </button>
          <h2>{t("guide")}</h2>
          <h3>{t("objectives")}</h3>
          <ul>
            {e.objectives.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <h3>{t("theory")}</h3>
          <p>{e.theory}</p>
          <p>{e.limits}</p>
          <h3>{t("topicHint")}</h3>
          <p>{e.topic}</p>
          <p>{t("boundary")}</p>
          <small>{t("attribution")}</small>
        </section>
      )}
      <footer className="lab-simulation-bar">
        <button
          className="lab-play"
          aria-label={t(playing ? "pause" : "resume")}
          onClick={() => setPlaying((v) => !v)}
        >
          {playing ? <Pause size={20} /> : <Play size={20} />}
          <span>{t(playing ? "pause" : "resume")}</span>
        </button>
        <button
          aria-label={t("reset")}
          title={t("parametersReset")}
          onClick={reset}
        >
          <RotateCcw size={18} />
        </button>
        <span className="lab-simulation-time">
          {t("elapsed")}{" "}
          <output ref={clockLabel} data-testid="lab-clock" data-time="0">
            0.0 s
          </output>
        </span>
        <label>
          {t("speed")}
          <select
            aria-label={t("speed")}
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            {[0.25, 0.5, 1, 1.5, 2, 3].map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </label>
      </footer>
      <div className="lab-warning">{error || t("modelTag")}</div>
    </div>,
    document.body,
  );
}
