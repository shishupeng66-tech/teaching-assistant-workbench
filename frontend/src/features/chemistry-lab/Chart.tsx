import { reactionEnergy } from "./science";
import { t } from "./i18n";
import type { Params } from "./Scene";
export default function Chart({
  id,
  p,
  data,
}: {
  id: string;
  p: Params;
  data: Record<string, unknown>;
}) {
  if (!["titration", "thermochemistry", "gas-laws"].includes(id)) return null;
  let second: number[][] = [];
  let points: number[][] = [],
    maxX = 1,
    maxY = 14,
    xLabel = t("pathAxis"),
    yLabel = t("energyAxis");
  if (id === "titration") {
    const curve = data.titrationCurve as
      { volume: number; ph: number }[] | undefined;
    maxX = curve?.at(-1)?.volume || 50;
    points = (curve || []).map((q) => [q.volume, q.ph]);
    xLabel = t("volumeAxis");
    yLabel = t("phAxis");
  } else if (id === "gas-laws") {
    maxX = 10;
    maxY = (Number(p.numParticles) / 1000) * 8.314 * Number(p.temperature);
    points = Array.from({ length: 91 }, (_, i) => {
      const v = 1 + i / 10;
      return [v, maxY / v];
    });
    xLabel = t("volume") + "（L）";
    yLabel = t("pressureAxis");
  } else {
    const ea = Number(p.activationEnergy),
      release = Number(p.energyReleased);
    maxY = 80 + Math.max(ea, release) + 10;
    points = Array.from({ length: 81 }, (_, i) => [
      i / 80,
      reactionEnergy(i / 80, ea, -release),
    ]);
    second = Array.from({ length: 81 }, (_, i) => [
      i / 80,
      reactionEnergy(i / 80, ea, release),
    ]);
  }
  const line = points
    .map(
      ([x, y]) =>
        `${40 + (x / maxX) * 260},${155 - (Math.max(0, Math.min(maxY, y)) / maxY) * 120}`,
    )
    .join(" ");
  return (
    <figure className="lab-chart">
      <figcaption>{t("chart")}</figcaption>
      <svg
        viewBox="0 0 330 205"
        role="img"
        aria-label={xLabel + " / " + yLabel}
      >
        <path
          d="M40 25 V155 H308"
          fill="none"
          stroke="currentColor"
          opacity=".45"
        />
        <polyline
          points={line}
          fill="none"
          stroke={id === "thermochemistry" ? "#fb8b7c" : "#48ceff"}
          strokeWidth="2"
        />
        {second.length > 0 && (
          <polyline
            points={second
              .map(([x, y]) => `${40 + x * 260},${155 - (y / maxY) * 120}`)
              .join(" ")}
            fill="none"
            stroke="#60a5fa"
            strokeWidth="2"
          />
        )}
        <text x="40" y="17">
          {yLabel}
        </text>
        <text x="42" y="173">
          0
        </text>
        <text x="268" y="173">
          {maxX.toFixed(0)}
        </text>
        <text x="48" y="198">
          {xLabel}
        </text>
        {id === "titration" &&
          typeof data.volumeAdded === "number" &&
          typeof data.currentPH === "number" && (
            <circle
              cx={40 + Math.min(1, data.volumeAdded / maxX) * 260}
              cy={155 - (data.currentPH / 14) * 120}
              r="4"
              fill="#ffca6b"
            />
          )}
      </svg>
      {id === "thermochemistry" && (
        <p>
          <span style={{ color: "#fb8b7c" }}>{t("EXOTHERMIC")}</span> ·{" "}
          <span style={{ color: "#60a5fa" }}>{t("ENDOTHERMIC")}</span>
        </p>
      )}
      <small>{t("chartLive")}</small>
    </figure>
  );
}
