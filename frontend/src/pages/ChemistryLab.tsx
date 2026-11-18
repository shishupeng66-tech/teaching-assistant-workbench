import { useState, lazy, Suspense } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Atom,
  FlaskConical,
  ArrowUpRight,
  Star,
  Search,
  Network,
  Flame,
  Download,
  Upload,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Feedback } from "../components/Drawer";
import { experiments } from "../features/chemistry-lab/catalog";
import { t } from "../features/chemistry-lab/i18n";
import {
  loadFavorites,
  saveFavorites,
  validateFavorites,
} from "../features/chemistry-lab/favorites";
import "../features/chemistry-lab/lab.css";
const LabPlayer = lazy(() => import("../features/chemistry-lab/LabPlayer"));
const tabs = ["all", "virtual", "micro", "reaction", "favorites"];
export default function ChemistryLab() {
  const { id } = useParams();
  const [tab, setTab] = useState("all"),
    [query, setQuery] = useState(""),
    [favorites, setFavorites] = useState(loadFavorites),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  function setSaved(ids: string[]) {
    setFavorites(ids);
    try {
      saveFavorites(ids);
    } catch {
      setError(t("saveError"));
    }
  }
  const exp = experiments.find((e) => e.id === id);
  if (id)
    return exp ? (
      <Suspense fallback={<p>{t("loading")}</p>}>
        <LabPlayer key={id} experiment={exp} />
      </Suspense>
    ) : (
      <section className="card lab-empty">
        <h1>{t("notFound")}</h1>
        <Link to="/chemistry-lab">{t("back")}</Link>
      </section>
    );
  const visible = experiments.filter(
    (e) =>
      (tab === "all" ||
        (tab === "favorites" && favorites.includes(e.id)) ||
        e.category === tab) &&
      (e.title + e.description).includes(query),
  );
  function exportSaved() {
    const blob = new Blob(
      [JSON.stringify({ version: 1, favorites }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chemistry-lab-favorites.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importSaved(file?: File) {
    if (!file) return;
    try {
      if (file.size > 10000) throw Error();
      const v = JSON.parse(await file.text());
      if (v.version !== 1) throw Error();
      const ids = validateFavorites(v.favorites);
      setSaved(ids);
      setMessage(t("importSuccess"));
    } catch {
      setError(t("importError"));
    }
  }
  return (
    <div className="chem-lab-library">
      <div className="lab-library-heading">
        <div>
          <div className="lab-eyebrow">{t("subtitle")}</div>
          <h1>{t("workspace")}</h1>
          <p>{t("localOnly")}</p>
        </div>
        <span className="lab-library-count">
          10 <FlaskConical size={21} />
        </span>
      </div>
      <Feedback error={error} message={message} />
      <div className="lab-browser-tools">
        <nav aria-label={t("workspace")}>
          {tabs.map((key) => (
            <Button
              key={key}
              variant={tab === key ? "default" : "ghost"}
              onClick={() => setTab(key)}
            >
              {t(key)}
            </Button>
          ))}
        </nav>
        <label className="lab-search">
          <Search size={17} />
          <input
            aria-label={t("search")}
            placeholder={t("search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {tab === "favorites" && (
        <div className="card lab-favorites-tools">
          <p>{t("addFavorites")}</p>
          <Button variant="outline" onClick={exportSaved}>
            <Download size={16} />
            {t("exportFavorites")}
          </Button>
          <label className="lab-file-button">
            <Upload size={16} />
            {t("importFavorites")}
            <input
              type="file"
              accept="application/json,.json"
              aria-label={t("importFavorites")}
              onChange={(e) => void importSaved(e.target.files?.[0])}
            />
          </label>
        </div>
      )}
      <div className="lab-cards">
        {visible.map((e, index) => {
          const Icon =
            e.category === "micro"
              ? Atom
              : e.category === "reaction"
                ? Flame
                : FlaskConical;
          return (
            <article className="lab-course-card" key={e.id}>
              <div className={`lab-course-art lab-art-${e.category}`}>
                <div className="lab-orbit orbit-one" />
                <div className="lab-orbit orbit-two" />
                <Icon size={62} strokeWidth={1} />
                <span className="lab-course-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <button
                  className={`lab-favorite ${favorites.includes(e.id) ? "saved" : ""}`}
                  aria-label={
                    t(favorites.includes(e.id) ? "unfavorite" : "favorite") +
                    "：" +
                    e.title
                  }
                  onClick={() =>
                    setSaved(
                      favorites.includes(e.id)
                        ? favorites.filter((x) => x !== e.id)
                        : [...favorites, e.id],
                    )
                  }
                >
                  <Star
                    size={18}
                    fill={favorites.includes(e.id) ? "currentColor" : "none"}
                  />
                </button>
              </div>
              <div className="lab-course-content">
                <span className="lab-level">
                  {t(e.level)} · {t("scienceReview")}
                </span>
                <h2>{e.title}</h2>
                <p>{e.description}</p>
                <Link className="lab-launch" to={`/chemistry-lab/${e.id}`}>
                  {t("launch")}
                  <ArrowUpRight size={17} />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      {!visible.length && (
        <div className="card lab-empty">
          <Network size={35} />
          <p>{t("empty")}</p>
        </div>
      )}
      <footer className="lab-source-note">
        <p>{t("attribution")}</p>
        <a
          href="https://github.com/rudra496/sciencelab3d/tree/939d9300ea04fc0b6c22b1a5cfc8cbd8ee480c80"
          target="_blank"
          rel="noreferrer"
        >
          {t("sourceLinkLabel")}
        </a>
        <p>{t("boundary")}</p>
      </footer>
    </div>
  );
}
